import Stripe from 'stripe'

/** Server-side Stripe client. The secret key never leaves the serverless env. */
export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY must be set')
  return new Stripe(key)
}

/**
 * Read the raw request bytes. Stripe webhook signatures are computed over the
 * exact payload, so the body must never pass through a JSON parser first —
 * do not touch req.body in any handler that calls this.
 */
export async function rawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * Statuses a subscription never invoices from again. Moving the quantity on
 * one of these changes no money, so it is churn in the audit log and nothing
 * else.
 */
export const TERMINAL_SUB_STATUSES = ['canceled', 'incomplete_expired', 'unpaid']

/**
 * More locations than a dental group plausibly runs on one subscription. A
 * count past this is a data problem — a bad import, a duplicated seed — and
 * acting on it would turn that mistake into a real charge.
 */
export const MAX_BILLABLE_LOCATIONS = 200

/**
 * Statuses where the practice has not paid anything yet: the trial has not
 * ended, or the very first invoice has not cleared. The quantity in force when
 * that first invoice is drawn is the one that gets billed, so it will already
 * be correct — there is no earlier period to true up.
 */
const UNCHARGED_SUB_STATUSES = ['trialing', 'incomplete']

/**
 * What to do about a subscription whose billed quantity has drifted from the
 * practice's real location count. Pure, so the money decision is testable
 * without Stripe: nothing in here touches the network.
 *
 * Proration is the part worth being deliberate about.
 *   nothing charged yet → 'none'. A proration would bill for days inside a
 *     free trial, against a card that has never been charged.
 *   anything live → 'create_prorations', in both directions. An increase
 *     charges the difference for the rest of the period, a decrease credits
 *     it. The rule is that money never moves without a line on the next
 *     invoice saying why — no silent lump sums either way.
 *
 * Returns { action: 'update' | 'skip' | 'refuse', from, to, proration, reason }.
 */
export function planQuantityChange({ status, billed, locations }) {
  const from = Number.isFinite(billed) && billed >= 1 ? Math.trunc(billed) : 1
  // A practice is billed for at least one location even before any rows are
  // written — during onboarding there are none, and zero is not a plan.
  const counted = Math.trunc(Number(locations))
  const to = Number.isFinite(counted) ? Math.max(1, counted) : 1

  // Terminal first: a dead subscription cannot be mis-billed, so an absurd
  // count on one is not worth an error on a screen the user is just opening.
  if (TERMINAL_SUB_STATUSES.includes(status)) {
    return { action: 'skip', from, to, proration: null, reason: status }
  }
  if (to > MAX_BILLABLE_LOCATIONS) {
    return { action: 'refuse', from, to, proration: null, reason: 'too-many-locations' }
  }
  if (from === to) {
    return { action: 'skip', from, to, proration: null, reason: 'in-step' }
  }
  return {
    action: 'update',
    from,
    to,
    proration: UNCHARGED_SUB_STATUSES.includes(status) ? 'none' : 'create_prorations',
    reason: to > from ? 'increase' : 'decrease',
  }
}

/**
 * The subscriptions-table row a Stripe subscription object maps to.
 * Pure, so the webhook's arithmetic is testable without Stripe or a network.
 */
export function subscriptionRow(sub, practiceId) {
  const item = sub.items?.data?.[0]
  const toIso = (secs) => (secs ? new Date(secs * 1000).toISOString() : null)
  return {
    practice_id: practiceId,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: item?.price?.id ?? null,
    quantity: item?.quantity ?? 1,
    current_period_end: toIso(item?.current_period_end ?? sub.current_period_end),
    trial_end: toIso(sub.trial_end),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  }
}
