import { adminClient, json, userClient } from '../_lib/supabase.js'
import { stripeClient } from '../_lib/stripe.js'

/**
 * POST /api/billing/portal
 *
 * Opens the Stripe customer portal for the caller's practice — update card,
 * download invoices, cancel. Returns { url }.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  try {
    const supabase = userClient(req)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) return json(res, 401, { error: 'Sign in first' })

    const { data: profile } = await supabase
      .from('profiles')
      .select('practice_id')
      .eq('id', auth.user.id)
      .maybeSingle()
    if (!profile?.practice_id) return json(res, 400, { error: 'Finish practice setup first' })

    const { data: sub } = await adminClient()
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('practice_id', profile.practice_id)
      .maybeSingle()
    if (!sub?.stripe_customer_id) {
      return json(res, 404, { error: 'No subscription yet — start one first.' })
    }

    // Host, not Origin: the caller must not choose where Stripe returns to.
    const origin = `https://${req.headers.host}`
    const stripe = stripeClient()
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/settings/billing`,
    })

    return json(res, 200, { url: session.url })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
}
