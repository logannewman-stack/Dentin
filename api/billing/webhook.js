import { adminClient, json } from '../_lib/supabase.js'
import { rawBody, stripeClient, subscriptionRow } from '../_lib/stripe.js'

/**
 * POST /api/billing/webhook — Stripe events.
 *
 * Signature-verified against the RAW payload (never parse the body first),
 * then mirrored into the subscriptions table with the service role. Stripe
 * remains the source of truth; this table is the app's fast local copy.
 *
 * Events that matter:
 *   checkout.session.completed          → link customer ↔ practice
 *   customer.subscription.created/updated/deleted → status, period, quantity
 *   invoice.payment_failed              → surfaces as past_due on next update
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return json(res, 500, { error: 'STRIPE_WEBHOOK_SECRET is not configured' })

  let event
  try {
    const stripe = stripeClient()
    const payload = await rawBody(req)
    event = stripe.webhooks.constructEvent(payload, req.headers['stripe-signature'], secret)
  } catch (e) {
    return json(res, 400, { error: `Signature verification failed: ${e.message}` })
  }

  const admin = adminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const practiceId = session.client_reference_id ?? session.metadata?.practice_id
        if (!practiceId) break
        // The subscription object arrives via its own event moments later;
        // record the customer link now so the portal works immediately.
        await admin.from('subscriptions').upsert(
          {
            practice_id: practiceId,
            stripe_customer_id:
              typeof session.customer === 'string' ? session.customer : session.customer?.id,
            stripe_subscription_id:
              typeof session.subscription === 'string'
                ? session.subscription
                : (session.subscription?.id ?? null),
            status: 'incomplete',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'practice_id' },
        )
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        const practiceId = sub.metadata?.practice_id
        if (!practiceId) break
        await admin
          .from('subscriptions')
          .upsert(subscriptionRow(sub, practiceId), { onConflict: 'practice_id' })
        break
      }

      default:
        break // acknowledged, deliberately ignored
    }
  } catch (e) {
    // A 500 makes Stripe retry — correct for transient database trouble.
    return json(res, 500, { error: e.message })
  }

  return json(res, 200, { received: true })
}
