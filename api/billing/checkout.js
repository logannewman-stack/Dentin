import { adminClient, json, userClient } from '../_lib/supabase.js'
import { stripeClient } from '../_lib/stripe.js'

/**
 * POST /api/billing/checkout
 *
 * Starts a Stripe Checkout session for the caller's practice: one monthly
 * subscription, quantity = the locations that exist at this moment, free trial
 * from STRIPE_TRIAL_DAYS (default 7). The card is collected at checkout and
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

    // A floor, not the final answer. Onboarding takes the card at step 2,
    // before the locations step exists, so for most practices this counts zero
    // rows and the subscription starts at one seat no matter how many
    // locations they are about to add. /api/billing/sync-quantity reconciles
    // it once setup has written the real rows, and again whenever locations
    // change; the number here only has to be honest about right now.
    const { count: locationCount, error: locationError } = await supabase
      .from('locations')
      .select('id', { count: 'exact', head: true })
    // A silent fallback would start the subscription on a guess and hide the
    // fact that it did — fail loud instead.
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

    // An affiliate code arrives from the share link. Resolve it to a Stripe
    // promotion code and pre-apply it: the customer does not have to retype
    // what they already clicked, and pre-applying replaces the promo box
    // entirely, so a second code cannot be stacked on top.
    const rawRef = String(req.body?.referralCode ?? '').trim()
    let appliedPromotion = null
    let attributedCode = null
    if (rawRef) {
      const { data: codes } = await stripe.promotionCodes.list({ code: rawRef, limit: 1 })
      const promo = codes?.[0]
      if (promo?.active) {
        appliedPromotion = promo.id
        attributedCode = promo.code
      }
    }

    // Record who sent them, whether or not Stripe had a matching discount —
    // attribution should survive a mistyped or expired coupon.
    if (rawRef) {
      const { data: affiliate } = await admin
        .from('affiliates')
        .select('code')
        .ilike('code', rawRef)
        .maybeSingle()
      if (affiliate) {
        await admin
          .from('practices')
          .update({ referral_code: affiliate.code, referred_at: new Date().toISOString() })
          .eq('id', practiceId)
          .is('referral_code', null)
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity }],
      customer: existing?.stripe_customer_id || undefined,
      customer_email: existing?.stripe_customer_id ? undefined : user.email,
      client_reference_id: practiceId,
      // Stripe forbids both at once, which is exactly the no-stacking rule:
      // either the referral discount is applied, or they may type one code.
      ...(appliedPromotion
        ? { discounts: [{ promotion_code: appliedPromotion }] }
        : { allow_promotion_codes: true }),
      subscription_data: {
        metadata: {
          practice_id: practiceId,
          ...(attributedCode ? { referral_code: attributedCode } : {}),
        },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
      metadata: {
        practice_id: practiceId,
        ...(attributedCode ? { referral_code: attributedCode } : {}),
      },
      success_url: `${origin}${returnTo}${join}checkout=success`,
      cancel_url: `${origin}${returnTo}${join}checkout=cancelled`,
    })

    return json(res, 200, { url: session.url })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
}
