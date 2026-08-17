import { adminClient, json } from '../_lib/supabase.js'

/**
 * GET /api/affiliates/report?key=CRON_SECRET
 *
 * What each affiliate earned this month: how many practices signed up on
 * their code, how many are still in the free trial, how many are actually
 * paying, and the payout that follows. Trials are counted but not paid —
 * a referral becomes payable when Stripe starts collecting.
 *
 * Owner-only: gated by CRON_SECRET, the same key as the health check.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })

  const gate = process.env.CRON_SECRET
  const offered =
    req.headers.authorization?.replace(/^Bearer\s+/i, '') ??
    new URL(req.url, 'http://internal').searchParams.get('key')
  if (!gate || offered !== gate) {
    return json(res, 401, { error: 'Pass CRON_SECRET as ?key=… or a bearer token' })
  }

  try {
    const admin = adminClient()
    const { data, error } = await admin
      .from('v_affiliate_payouts')
      .select('*')
      .order('monthly_payout_usd', { ascending: false })
    if (error) return json(res, 500, { error: error.message })

    const rows = (data ?? []).map((r) => ({
      code: r.code,
      name: r.name,
      email: r.email,
      active: r.active,
      signups: r.signups_total,
      inTrial: r.in_trial,
      paying: r.paying,
      churned: r.churned,
      perReferral: `$${(r.payout_cents / 100).toFixed(2)}`,
      owedThisMonth: `$${Number(r.monthly_payout_usd ?? 0).toFixed(2)}`,
    }))

    const total = rows.reduce((sum, r) => sum + Number(r.owedThisMonth.slice(1)), 0)
    return json(res, 200, {
      generatedFor: new Date().toISOString().slice(0, 7),
      totalOwed: `$${total.toFixed(2)}`,
      affiliates: rows,
    })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
}
