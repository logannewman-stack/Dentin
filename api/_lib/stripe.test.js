// Run with: node --test api/_lib/stripe.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'

process.env.STRIPE_SECRET_KEY = 'sk_test_offline_dummy'
const {
  MAX_BILLABLE_LOCATIONS,
  TERMINAL_SUB_STATUSES,
  planQuantityChange,
  rawBody,
  stripeClient,
  subscriptionRow,
} = await import('./stripe.js')

test('webhook signature verifies against the raw payload, and only that', () => {
  const stripe = stripeClient()
  const payload = JSON.stringify({
    id: 'evt_1',
    object: 'event',
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1' } },
  })
  const secret = 'whsec_test_secret'
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret })

  const event = stripe.webhooks.constructEvent(payload, header, secret)
  assert.equal(event.type, 'customer.subscription.updated')

  // One byte of difference must fail — this is why the body is never parsed
  // before verification.
  assert.throws(() => stripe.webhooks.constructEvent(`${payload} `, header, secret))
  assert.throws(() => stripe.webhooks.constructEvent(payload, header, 'whsec_wrong'))
})

test('rawBody returns the exact bytes off the wire', async () => {
  const req = Readable.from([Buffer.from('{"a":'), Buffer.from('1}')])
  const buf = await rawBody(req)
  assert.equal(buf.toString(), '{"a":1}')
})

test('subscriptionRow maps a Stripe subscription to the table shape', () => {
  const row = subscriptionRow(
    {
      id: 'sub_123',
      customer: 'cus_9',
      status: 'trialing',
      cancel_at_period_end: false,
      trial_end: 1760000000,
      items: {
        data: [{ price: { id: 'price_x' }, quantity: 2, current_period_end: 1765000000 }],
      },
    },
    'practice-uuid',
  )
  assert.equal(row.practice_id, 'practice-uuid')
  assert.equal(row.stripe_customer_id, 'cus_9')
  assert.equal(row.stripe_subscription_id, 'sub_123')
  assert.equal(row.status, 'trialing')
  assert.equal(row.quantity, 2)
  assert.equal(row.price_id, 'price_x')
  assert.equal(row.current_period_end, new Date(1765000000 * 1000).toISOString())
  assert.equal(row.trial_end, new Date(1760000000 * 1000).toISOString())
  assert.equal(row.cancel_at_period_end, false)
})

test('subscriptionRow tolerates expanded customer objects and older shapes', () => {
  const row = subscriptionRow(
    {
      id: 'sub_9',
      customer: { id: 'cus_obj' },
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: 1770000000, // pre-Basil top-level field
      items: { data: [] },
    },
    'p2',
  )
  assert.equal(row.stripe_customer_id, 'cus_obj')
  assert.equal(row.quantity, 1)
  assert.equal(row.current_period_end, new Date(1770000000 * 1000).toISOString())
  assert.equal(row.cancel_at_period_end, true)
})

// --- planQuantityChange: what /api/billing/sync-quantity decides ------------

test('a trial grows to the real location count without prorating', () => {
  // Checkout ran at onboarding step 2 with one location; setup then wrote
  // three. Nothing has been charged, so the first invoice simply reflects
  // three — a proration here would bill days inside a free trial.
  const d = planQuantityChange({ status: 'trialing', billed: 1, locations: 3 })
  assert.deepEqual(d, {
    action: 'update',
    from: 1,
    to: 3,
    proration: 'none',
    reason: 'increase',
  })
})

test('a live subscription prorates in both directions', () => {
  const up = planQuantityChange({ status: 'active', billed: 1, locations: 3 })
  assert.equal(up.action, 'update')
  assert.equal(up.reason, 'increase')
  assert.equal(up.proration, 'create_prorations')

  // A closed location credits back the unused part of the period rather than
  // quietly keeping the money.
  const down = planQuantityChange({ status: 'active', billed: 3, locations: 2 })
  assert.equal(down.action, 'update')
  assert.equal(down.reason, 'decrease')
  assert.equal(down.proration, 'create_prorations')
  assert.equal(down.to, 2)
})

test('an incomplete first payment is uncharged too, so it does not prorate', () => {
  // The opening invoice has not cleared. Correcting the quantity now costs
  // nobody anything; a proration would true up a period never paid for.
  const d = planQuantityChange({ status: 'incomplete', billed: 1, locations: 2 })
  assert.equal(d.action, 'update')
  assert.equal(d.proration, 'none')
})

test('past_due still reconciles, and prorates like any live subscription', () => {
  const d = planQuantityChange({ status: 'past_due', billed: 2, locations: 4 })
  assert.equal(d.action, 'update')
  assert.equal(d.proration, 'create_prorations')
})

test('no drift means no call to Stripe', () => {
  for (const status of ['trialing', 'active', 'past_due', 'incomplete', 'paused']) {
    const d = planQuantityChange({ status, billed: 3, locations: 3 })
    assert.equal(d.action, 'skip', status)
    assert.equal(d.reason, 'in-step')
    assert.equal(d.proration, null)
  }
})

test('a subscription that will never invoice again is left alone', () => {
  for (const status of TERMINAL_SUB_STATUSES) {
    const d = planQuantityChange({ status, billed: 1, locations: 5 })
    assert.equal(d.action, 'skip', status)
    assert.equal(d.reason, status)
  }
})

test('the quantity floor is one location, never zero', () => {
  // Mid-onboarding there are no location rows at all, and a practice is still
  // one practice.
  for (const locations of [0, null, undefined, -4, 'nonsense', NaN]) {
    assert.equal(planQuantityChange({ status: 'trialing', billed: 1, locations }).to, 1)
    assert.equal(planQuantityChange({ status: 'trialing', billed: 1, locations }).action, 'skip')
  }
  // A missing or nonsensical billed quantity reads as the one seat checkout
  // always creates.
  assert.equal(planQuantityChange({ status: 'active', billed: undefined, locations: 1 }).from, 1)
  assert.equal(planQuantityChange({ status: 'active', billed: 0, locations: 1 }).action, 'skip')
})

test('an absurd location count is refused rather than billed', () => {
  const ok = planQuantityChange({
    status: 'active',
    billed: 1,
    locations: MAX_BILLABLE_LOCATIONS,
  })
  assert.equal(ok.action, 'update')

  const tooMany = planQuantityChange({
    status: 'active',
    billed: 1,
    locations: MAX_BILLABLE_LOCATIONS + 1,
  })
  assert.equal(tooMany.action, 'refuse')
  assert.equal(tooMany.reason, 'too-many-locations')
  assert.equal(tooMany.proration, null)
})

test('a dead subscription with an absurd count is a quiet skip, not an error', () => {
  // This endpoint runs on every billing screen load; a canceled practice
  // cannot be mis-billed, so there is nothing worth interrupting them for.
  const d = planQuantityChange({ status: 'canceled', billed: 1, locations: 5000 })
  assert.equal(d.action, 'skip')
  assert.equal(d.reason, 'canceled')
})

test('fractional counts truncate instead of billing a fraction of a seat', () => {
  const d = planQuantityChange({ status: 'active', billed: 1, locations: 3.9 })
  assert.equal(d.to, 3)
})
