import { adminClient, json, userClient } from '../_lib/supabase.js'
import {
  MAX_BILLABLE_LOCATIONS,
  TERMINAL_SUB_STATUSES,
  planQuantityChange,
  stripeClient,
} from '../_lib/stripe.js'

/**
 * POST /api/billing/sync-quantity
 *
 * Dentin is sold per location, but onboarding takes the card at step 2 —
 * before the locations step exists — so /api/billing/checkout can only ever
 * bill for the one location it can see. Without this endpoint a three-location
 * practice pays for one for the life of the subscription and nothing in the
 * product notices.
 *
 * So: count the practice's locations, compare them to the live Stripe
 * subscription, and move the quantity only when they actually differ.
 *
 * It is called speculatively — when the billing screen opens, after setup
 * writes the locations, after one is added or removed — so "nothing to do" is
 * a 200 with synced:false and a reason, never an error a user has to read.
 *
 * Returns { synced, from, to, status, proration, reason, interval }.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

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

    // The quantity is counted here, from the caller's own RLS-scoped rows, and
    // is never read from the request body. A quantity in the body would let a
    // client name the size of its own bill.
    const { count: locationCount, error: locationError } = await supabase
      .from('locations')
      .select('id', { count: 'exact', head: true })
    if (locationError) {
      return json(res, 500, { error: 'Could not count locations — try again in a moment.' })
    }
    const locations = Math.max(1, locationCount ?? 1)

    // The subscriptions table is service-role only; the practice can read its
    // own row but this handler needs it before it knows whether to trust the
    // caller's view of it.
    const admin = adminClient()
    const { data: mirror, error: mirrorError } = await admin
      .from('subscriptions')
      .select('stripe_subscription_id, status, quantity')
      .eq('practice_id', practiceId)
      .maybeSingle()
    if (mirrorError) {
      return json(res, 500, { error: 'Could not read the subscription — try again in a moment.' })
    }

    // Nothing to reconcile, and nothing has gone wrong: a practice mid-signup
    // or one that cancelled months ago both land here on every screen load.
    if (!mirror?.stripe_subscription_id) {
      return nothing(res, { to: locations, reason: 'no-subscription' })
    }
    if (TERMINAL_SUB_STATUSES.includes(mirror.status)) {
      return nothing(res, {
        from: mirror.quantity ?? null,
        to: locations,
        status: mirror.status,
        reason: mirror.status,
      })
    }

    const stripe = stripeClient()
    let sub
    try {
      sub = await stripe.subscriptions.retrieve(mirror.stripe_subscription_id)
    } catch (e) {
      return json(res, 502, { error: stripeMessage(e, 'Stripe would not return the subscription.') })
    }

    // Compare against Stripe, not the mirror: the mirror is a webhook delivery
    // behind, and acting on a stale number means re-applying a change that has
    // already landed.
    const item = sub.items?.data?.[0]
    if (!item?.id) {
      return nothing(res, { to: locations, status: sub.status, reason: 'no-subscription-item' })
    }
    const interval = item.price?.recurring?.interval ?? null

    const decision = planQuantityChange({
      status: sub.status,
      billed: item.quantity,
      locations,
    })

    if (decision.action === 'refuse') {
      return json(res, 400, {
        error:
          `This practice has ${decision.to} locations on file, past the ${MAX_BILLABLE_LOCATIONS} ` +
          'Dentin bills automatically. That looks like a data problem rather than a purchase — ' +
          'check the locations list, or contact support to set the quantity by hand.',
      })
    }

    // Already in step, or a status where the number changes no money. An
    // unconditional write on every page load would be an audit-log mess and a
    // rate limit waiting to be hit.
    if (decision.action === 'skip') {
      return nothing(res, {
        from: decision.from,
        to: decision.to,
        status: sub.status,
        reason: decision.reason,
        interval,
      })
    }

    let updated
    try {
      updated = await stripe.subscriptionItems.update(
        item.id,
        { quantity: decision.to, proration_behavior: decision.proration },
        // Two tabs open on the billing screen both notice the same drift. The
        // key collapses them into one change instead of two. It carries a
        // one-minute bucket rather than being fixed forever because a practice
        // that adds a location, removes it and adds it back must not have the
        // third change replayed away as a duplicate of the first.
        {
          idempotencyKey: `sync-qty:${item.id}:${decision.from}-${decision.to}:${Math.floor(
            Date.now() / 60000,
          )}`,
        },
      )
    } catch (e) {
      return json(res, 502, { error: stripeMessage(e, 'Stripe would not accept the quantity change.') })
    }

    // The subscriptions table stays the webhook's to write. customer.subscription
    // .updated is already on its way carrying this same number, and two writers
    // racing over one row is how a mirror ends up wrong.
    return json(res, 200, {
      synced: true,
      from: decision.from,
      to: updated?.quantity ?? decision.to,
      status: sub.status,
      proration: decision.proration,
      reason: decision.reason,
      interval,
    })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
}

/** A 200 that means "looked, nothing to do" — the common case on screen load. */
function nothing(res, { from = null, to, status = null, reason, interval = null }) {
  return json(res, 200, { synced: false, from, to, status, proration: null, reason, interval })
}

/**
 * Stripe's error message is a sentence written for a human, not a stack trace,
 * so it is safe to pass through — but on its own it reads as though Dentin
 * broke, hence the lead-in. Anything without a message gets the lead-in alone.
 */
function stripeMessage(e, lead) {
  const detail = typeof e?.message === 'string' ? e.message.trim() : ''
  return detail ? `${lead} ${detail}` : lead
}
