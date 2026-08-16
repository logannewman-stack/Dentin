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
