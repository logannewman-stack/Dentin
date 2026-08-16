import { adminClient, json, userClient } from '../_lib/supabase.js'
import { stripeClient } from '../_lib/stripe.js'

/**
 * POST /api/billing/checkout
 *
 * Starts a Stripe Checkout session for the caller's practice: one monthly
 * subscription, quantity = number of locations, free trial from
 * STRIPE_TRIAL_DAYS (default 90). Returns { url } to redirect to.
 *
 * The caller is identified by their Supabase bearer token; the practice id
 * rides into Stripe as metadata so the webhook can map events back without
 * guessing.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  const priceId = process.env.STRIPE_PRICE_ID
  if (!priceId) return json(res, 500, { error: 'STRIPE_PRICE_ID is not configured' })

  try {
    const supabase = userClient(req)
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user
    if (!user) return json(res, 401, { error: 'Sign in first' })

    const { data: profile } = await supabase
      .from('profiles')
      .select('practice_id')
      .eq('id', user.id)
      .maybeSingle()
    const practiceId = profile?.practice_id
    if (!practiceId) return json(res, 400, { error: 'Finish practice setup first' })

    const { count: locationCount } = await supabase
      .from('locations')
      .select('id', { count: 'exact', head: true })
    const quantity = Math.max(1, locationCount ?? 1)

    // Reuse the Stripe customer if this practice already has one.
    const admin = adminClient()
    const { data: existing } = await admin
      .from('subscriptions')
      .select('stripe_customer_id, status')
      .eq('practice_id', practiceId)
      .maybeSingle()
    if (existing && ['active', 'trialing', 'past_due'].includes(existing.status)) {
      return json(res, 409, { error: 'This practice already has a subscription — use Manage billing.' })
    }

    const origin = req.headers.origin ?? `https://${req.headers.host}`
    const trialDays = Number(process.env.STRIPE_TRIAL_DAYS ?? 90)

    const stripe = stripeClient()
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity }],
      customer: existing?.stripe_customer_id || undefined,
      customer_email: existing?.stripe_customer_id ? undefined : user.email,
      client_reference_id: practiceId,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { practice_id: practiceId },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
      metadata: { practice_id: practiceId },
      success_url: `${origin}/settings/billing?checkout=success`,
      cancel_url: `${origin}/settings/billing?checkout=cancelled`,
    })

    return json(res, 200, { url: session.url })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
}
