// Run with: node --test api/_lib/stripe.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'

process.env.STRIPE_SECRET_KEY = 'sk_test_offline_dummy'
const { rawBody, stripeClient, subscriptionRow } = await import('./stripe.js')

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
