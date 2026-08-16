import { adminClient, json, userClient } from '../_lib/supabase.js'
import { stripeClient } from '../_lib/stripe.js'

/**
 * POST /api/billing/checkout
 *
 * Starts a Stripe Checkout session for the caller's practice: one monthly
 * subscription, quantity = number of locations, free trial from
 * STRIPE_TRIAL_DAYS (default 7). The card is collected at checkout and
 * Stripe charges it automatically the moment the trial ends. Returns
 * { url } to redirect to.
 *
 * The caller is identified by their Supabase bearer token; the practice id
 * rides into Stripe as metadata so the webhook can map events back without
 * guessing.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  // Two ways to pay for the same plan. Annual carries its 10% discount baked
  // into the price itself, so a promotion code (one max — Stripe Checkout
  // does not stack codes) still applies cleanly on top of either.
  const plan = req.body?.plan === 'monthly' ? 'monthly' : 'annual'
  const priceId =
    plan === 'annual'
      ? process.env.STRIPE_PRICE_ID_ANNUAL
      : (process.env.STRIPE_PRICE_ID_MONTHLY ?? process.env.STRIPE_PRICE_ID)
  if (!priceId) {
    return json(res, 500, { error: `The Stripe price for the ${plan} plan is not configured` })
  }

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

    const { count: locationCount, error: locationError } = await supabase
      .from('locations')
      .select('id', { count: 'exact', head: true })
    // A silent fallback here would bill a multi-location practice for one
    // location for the life of the subscription — fail loud instead.
    if (locationError) {
      return json(res, 500, { error: 'Could not count locations — try again in a moment.' })
    }
    const quantity = Math.max(1, locationCount ?? 1)

    // Reuse the Stripe customer if this practice already has one.
    const admin = adminClient()
    const { data: existing, error: existingError } = await admin
      .from('subscriptions')
      .select('stripe_customer_id, status')
      .eq('practice_id', practiceId)
      .maybeSingle()
    // If this check can't run, don't risk minting a duplicate subscription.
    if (existingError) {
      return json(res, 500, { error: 'Could not check the current subscription — try again in a moment.' })
    }
    if (existing && ['active', 'trialing', 'past_due', 'unpaid'].includes(existing.status)) {
      return json(res, 409, { error: 'This practice already has a subscription — use Manage billing.' })
    }

    // The SPA and this API are served from the same deployment, so the Host
    // header is the app origin. The Origin header is caller-controlled and
    // must not decide where Stripe redirects after card entry.
    const origin = `https://${req.headers.host}`
    // Where to land back in the app — a same-site path only (onboarding's
    // trial step passes /onboarding; default is the billing screen).
    const rawReturn = typeof req.body?.returnTo === 'string' ? req.body.returnTo : ''
    const returnTo =
      rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : '/settings/billing'
    const join = returnTo.includes('?') ? '&' : '?'
    // One free trial per practice, ever. A practice that canceled and is
    // restarting (any prior subscriptions row) pays from day one.
    const trialDays = existing ? 0 : Number(process.env.STRIPE_TRIAL_DAYS ?? 7)

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
      success_url: `${origin}${returnTo}${join}checkout=success`,
      cancel_url: `${origin}${returnTo}${join}checkout=cancelled`,
    })

    return json(res, 200, { url: session.url })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
}
