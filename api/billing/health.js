import { adminClient, json } from '../_lib/supabase.js'
import { stripeClient } from '../_lib/stripe.js'

// The published pricing this deployment is supposed to be selling. If the
// numbers on the pitch card ever change, change these too.
const PUBLIC_PRICING = {
  annual: { interval: 'year', amount: 216000 }, // $2,160.00 / location / year
  monthly: { interval: 'month', amount: 20000 }, // $200.00 / location / month
}

// Events /api/billing/webhook needs to hear to keep the subscriptions table
// mirroring Stripe.
const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]

const PROMO_CODES = ['backstage', 'TBOD', 'testing99']

const money = (cents, currency = 'usd') =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency })

/**
 * GET /api/billing/health
 *
 * Pre-flight for live billing: verifies the Stripe env vars point at real,
 * live-mode prices with the published amounts, inspects the promo codes for
 * surprises (wrong percent, first-time-only, product restrictions, expiry),
 * confirms a webhook endpoint is listening for the right events, and checks
 * the service role can reach the subscriptions table. Run it before a live
 * checkout rehearsal and fix anything with pass:false.
 *
 * Never returns a secret — only presence, prefixes and Stripe-side facts
 * that already appear on the public checkout page. Gated by CRON_SECRET
 * (send it as ?key=… or a bearer token); if CRON_SECRET is unset the report
 * still renders but flags itself as unprotected.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })

  const gate = process.env.CRON_SECRET
  const offered =
    req.headers.authorization?.replace(/^Bearer\s+/i, '') ??
    new URL(req.url, 'http://internal').searchParams.get('key')
  if (gate && offered !== gate) {
    return json(res, 401, { error: 'Pass CRON_SECRET as ?key=… or a bearer token' })
  }

  const checks = []
  const add = (name, pass, detail) => checks.push({ name, pass, detail })

  try {
    // --- env shape -----------------------------------------------------------
    const sk = process.env.STRIPE_SECRET_KEY ?? ''
    const mode = sk.startsWith('sk_live_') ? 'LIVE' : sk.startsWith('sk_test_') ? 'test' : null
    add(
      'stripe secret key',
      Boolean(mode),
      mode ? `${mode} mode` : 'STRIPE_SECRET_KEY is missing or not an sk_ key',
    )

    const priceIds = {
      annual: process.env.STRIPE_PRICE_ID_ANNUAL,
      monthly: process.env.STRIPE_PRICE_ID_MONTHLY ?? process.env.STRIPE_PRICE_ID,
    }
    for (const [plan, id] of Object.entries(priceIds)) {
      add(
        `${plan} price id`,
        Boolean(id?.startsWith('price_')),
        !id
          ? `not set — checkout for the ${plan} plan will fail`
          : id.startsWith('price_')
            ? 'set'
            : 'set but does not start with price_ — copy the price API ID, not the prod_ product id',
      )
    }

    const whsec = process.env.STRIPE_WEBHOOK_SECRET ?? ''
    add(
      'webhook signing secret',
      whsec.startsWith('whsec_'),
      whsec ? (whsec.startsWith('whsec_') ? 'set' : 'set but not a whsec_ value') : 'not set',
    )

    const trialDays = Number(process.env.STRIPE_TRIAL_DAYS ?? 7)
    add('trial length', trialDays === 7, `${trialDays} days`)

    if (!gate) {
      add('endpoint protection', false, 'CRON_SECRET is unset — this health check is publicly reachable')
    }

    // --- ask Stripe ----------------------------------------------------------
    if (mode) {
      const stripe = stripeClient()

      for (const [plan, id] of Object.entries(priceIds)) {
        if (!id?.startsWith('price_')) continue
        try {
          const price = await stripe.prices.retrieve(id)
          const want = PUBLIC_PRICING[plan]
          const problems = []
          if (!price.active) problems.push('price is archived')
          if (!price.livemode) problems.push('TEST-mode price under a live key')
          if (price.recurring?.interval !== want.interval)
            problems.push(`bills every ${price.recurring?.interval ?? '??'} — want ${want.interval}`)
          if (price.unit_amount !== want.amount)
            problems.push(`amount is ${money(price.unit_amount, price.currency)} — want ${money(want.amount)}`)
          add(
            `${plan} price in Stripe`,
            problems.length === 0,
            problems.length
              ? problems.join('; ')
              : `${money(price.unit_amount)} every ${price.recurring.interval} · live · active`,
          )
        } catch (e) {
          add(`${plan} price in Stripe`, false, e.message)
        }
      }

      for (const code of PROMO_CODES) {
        try {
          const { data } = await stripe.promotionCodes.list({
            code,
            limit: 1,
            expand: ['data.coupon'],
          })
          const pc = data[0]
          if (!pc) {
            add(`promo code ${code}`, false, 'not found in this mode')
            continue
          }
          // Newer Stripe API versions keep reshaping where the discount
          // lives on a promotion code — try each known shape in turn.
          let c = pc.coupon
          if (typeof c === 'string') c = await stripe.coupons.retrieve(c).catch(() => null)
          if (!c || typeof c !== 'object') {
            const full = await stripe.promotionCodes
              .retrieve(pc.id, { expand: ['coupon'] })
              .catch(() => null)
            if (full?.coupon && typeof full.coupon === 'object') c = full.coupon
          }
          if (!c || typeof c !== 'object') {
            // 2026+ API: the discount lives under `promotion` instead.
            const promo = pc.promotion
            if (promo && typeof promo === 'object') {
              if (promo.coupon && typeof promo.coupon === 'object') c = promo.coupon
              else if (typeof promo.coupon === 'string')
                c = await stripe.coupons.retrieve(promo.coupon).catch(() => null)
              else if (promo.percent_off != null || promo.amount_off != null || promo.duration)
                c = promo
            }
          }
          if (!c || typeof c !== 'object') {
            // Can't read the percent on this API version — the code itself
            // still exists, so report what we know plus the object's fields
            // so the missing shape is obvious from the report.
            add(
              `promo code ${code}`,
              Boolean(pc.active),
              `${pc.active ? 'exists and is active' : 'exists but is DEACTIVATED'} — discount % not exposed here, verify it on the checkout page (fields: ${Object.keys(pc).join(', ')})`,
            )
            continue
          }
          const notes = [`${c.percent_off ?? '??'}% off · ${c.duration}`]
          const problems = []
          if (!pc.active) problems.push('code is deactivated')
          if (!c.valid) problems.push('coupon is no longer valid')
          if (pc.restrictions?.first_time_transaction)
            problems.push('restricted to first-time customers — bounces for anyone with a prior payment')
          if (c.applies_to?.products?.length)
            problems.push('coupon limited to specific products — confirm that includes the Dentin product')
          if (pc.max_redemptions) notes.push(`${pc.times_redeemed}/${pc.max_redemptions} redemptions used`)
          if (pc.expires_at) notes.push(`expires ${new Date(pc.expires_at * 1000).toISOString().slice(0, 10)}`)
          // The two customer-facing codes are supposed to be 50%; testing99 is
          // whatever it is — just reported.
          if (code !== 'testing99' && c.percent_off !== 50) problems.push(`expected 50% off, found ${c.percent_off}%`)
          add(`promo code ${code}`, problems.length === 0, [...notes, ...problems].join(' · '))
        } catch (e) {
          add(`promo code ${code}`, false, e.message)
        }
      }

      try {
        const eps = await stripe.webhookEndpoints.list({ limit: 10 })
        const ep = eps.data.find((e) => e.url.includes('/api/billing/webhook'))
        if (!ep) {
          add('webhook endpoint', false, 'no endpoint in this mode points at /api/billing/webhook')
        } else {
          const events = ep.enabled_events ?? []
          const missing = events.includes('*') ? [] : WEBHOOK_EVENTS.filter((e) => !events.includes(e))
          const problems = []
          if (ep.status !== 'enabled') problems.push('endpoint is disabled')
          if (missing.length) problems.push(`not subscribed to: ${missing.join(', ')}`)
          add('webhook endpoint', problems.length === 0, problems.length ? `${ep.url} — ${problems.join('; ')}` : ep.url)
        }
      } catch (e) {
        add('webhook endpoint', false, e.message)
      }
    }

    // --- Supabase service role ----------------------------------------------
    try {
      const { error } = await adminClient()
        .from('subscriptions')
        .select('practice_id', { count: 'exact', head: true })
      add('supabase → subscriptions table', !error, error ? error.message : 'reachable')
    } catch (e) {
      add('supabase → subscriptions table', false, e.message)
    }

    return json(res, 200, { ok: checks.every((c) => c.pass), checks })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
}
