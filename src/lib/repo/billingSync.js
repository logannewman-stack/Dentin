/**
 * Keeping Dentin's own subscription in step with the practice's locations.
 *
 * Dentin is sold per location, but onboarding takes the card at step 2 —
 * before the locations step exists — so checkout can only bill for the one
 * location it can see. Everything in here closes that gap: one call that asks
 * the server to reconcile the quantity, and one read that gives the billing
 * screen the arithmetic behind the bill.
 */
import { isDemo, must, supabase } from '../repoCore'
import { LOCATIONS } from '../demoData'

/**
 * The published price, per location. These must match the Stripe Prices
 * exactly: api/billing/health.js asserts the same figures against Stripe
 * (annual 216000 cents a year, monthly 20000 cents a month) and fails the
 * pre-flight if they have drifted. The pitch card, these constants and the
 * Stripe prices change together or not at all.
 */
export const PRICING = {
  annual: { perLocationPerMonth: 180, perLocationPerYear: 2160, billedEvery: 'year' },
  monthly: { perLocationPerMonth: 200, perLocationPerYear: 2400, billedEvery: 'month' },
}

/** What a given number of locations costs on a plan. Pure. */
export function planMath(plan, locationCount) {
  const key = PRICING[plan] ? plan : 'annual'
  const rate = PRICING[key]
  // One location is the floor: it is what billing charges a practice whose
  // location rows have not been written yet.
  const count = Math.max(1, Math.trunc(Number(locationCount)) || 1)
  return {
    plan: key,
    locationCount: count,
    billedEvery: rate.billedEvery,
    perLocationPerMonth: rate.perLocationPerMonth,
    perLocationPerYear: rate.perLocationPerYear,
    perMonth: rate.perLocationPerMonth * count,
    perYear: rate.perLocationPerYear * count,
  }
}

/**
 * Ask the server to reconcile the billed quantity with the real location
 * count. The server counts the locations itself — the browser never gets to
 * name a quantity, because a quantity is a price.
 *
 * Called speculatively (screen load, end of onboarding, after a location is
 * added or removed), so "nothing to do" comes back as synced:false with a
 * reason rather than an error.
 */
export async function syncBillingQuantity() {
  if (isDemo) {
    return { synced: false, from: null, to: null, status: null, proration: null, reason: 'demo' }
  }

  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Sign in first')

  const res = await fetch('/api/billing/sync-quantity', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Billing request failed (${res.status})`)
  return body
}

/**
 * Everything the billing screen needs in one read: the plan as Stripe last
 * reported it, the locations the practice actually has, whether those two
 * agree, and what the true count costs.
 *
 * `planHint` comes from syncBillingQuantity(), which reads the price interval
 * straight off Stripe. Without it the plan can still be recovered from an
 * active subscription's billing period — see planFromPeriod.
 */
export async function getBillingSnapshot({ planHint = null } = {}) {
  if (isDemo) {
    // Furnished and internally consistent: the demo practice's two locations
    // are the two it pays for. The drift this module exists to fix is a live
    // problem, and inventing it here would read as a bug in the demo.
    const locationCount = LOCATIONS.length
    return snapshot({
      demo: true,
      subscription: {
        status: 'trialing',
        priceId: 'price_demo_annual',
        quantity: locationCount,
        currentPeriodEnd: null,
        trialEnd: new Date(Date.now() + 62 * 86400000).toISOString(),
        cancelAtPeriodEnd: false,
        hasCustomer: true,
      },
      locationCount,
      plan: 'annual',
    })
  }

  const row = must(
    await supabase.from('subscriptions').select('*').maybeSingle(),
    'Read the subscription',
  )

  // head:true means the rows come back empty and the answer is in `count`, so
  // this one cannot go through must() for its value — only for its error.
  const counted = await supabase.from('locations').select('id', { count: 'exact', head: true })
  must(counted, 'Count locations')
  const locationCount = Math.max(1, counted.count ?? 1)

  const subscription = row
    ? {
        status: row.status,
        priceId: row.price_id,
        quantity: row.quantity,
        currentPeriodEnd: row.current_period_end,
        trialEnd: row.trial_end,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        hasCustomer: Boolean(row.stripe_customer_id),
      }
    : null

  return snapshot({
    demo: false,
    subscription,
    locationCount,
    plan: planHint ?? planFromPeriod(subscription),
  })
}

/**
 * Which plan a subscription is on when Stripe has not just told us. An active
 * subscription's current period IS its billing interval, so a period ending
 * more than two months out can only be the annual price.
 *
 * Nothing else is safe to conclude: a month from renewal an annual plan looks
 * exactly like a monthly one, and during a trial the period end is the trial
 * end and says nothing at all. Both return null, and the screen waits for the
 * sync to name the plan rather than guessing about money.
 */
function planFromPeriod(subscription) {
  if (subscription?.status !== 'active' || !subscription.currentPeriodEnd) return null
  const days = (new Date(subscription.currentPeriodEnd).getTime() - Date.now()) / 86400000
  if (!Number.isFinite(days)) return null
  return days > 62 ? 'annual' : null
}

function snapshot({ demo, subscription, locationCount, plan }) {
  const billedQuantity = subscription ? Math.max(1, subscription.quantity ?? 1) : null
  const inStep = billedQuantity == null ? null : billedQuantity === locationCount
  const pricing = {
    annual: planMath('annual', locationCount),
    monthly: planMath('monthly', locationCount),
  }
  return {
    demo,
    subscription,
    locationCount,
    billedQuantity,
    inStep,
    mismatch: inStep === false
      ? {
          billed: billedQuantity,
          actual: locationCount,
          // 'under' is Dentin billing for less than it is owed — worth showing
          // plainly, but it is not the practice's mistake and not a debt to
          // chase. 'over' is the one that costs them money.
          direction: billedQuantity < locationCount ? 'under' : 'over',
        }
      : null,
    plan,
    // Unknown plan still gets numbers to show, on the plan signup defaults to.
    money: pricing[plan] ?? pricing.annual,
    pricing,
  }
}
