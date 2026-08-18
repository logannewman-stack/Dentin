import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { differenceInCalendarDays, format } from 'date-fns'
import { BadgeCheck, Check, ChevronLeft, CreditCard, ExternalLink } from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Pill, SegmentedControl } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import { moneyRound } from '@/lib/format'
import {
  ACTIVE_SUB_STATUSES,
  getBillingSnapshot,
  isDemo,
  openBillingPortal,
  startSubscriptionCheckout,
  syncBillingQuantity,
} from '@/lib/repository'

const STATUS = {
  trialing: { label: 'Free trial', tone: 'good' },
  active: { label: 'Active', tone: 'good' },
  past_due: { label: 'Payment failed', tone: 'critical' },
  canceled: { label: 'Canceled', tone: 'quiet' },
  unpaid: { label: 'Unpaid', tone: 'critical' },
  incomplete: { label: 'Starting…', tone: 'quiet' },
  paused: { label: 'Paused', tone: 'quiet' },
}

const PLAN_POINTS = [
  'Unlimited items, orders and team members',
  'Barcode & QR scanning with lot and expiry capture',
  'Live price comparison and landed-cost math',
  'Contract price and inventory imports',
  'Compliance wall, insights and benchmarks',
]

const day = (iso) => format(new Date(iso), 'MMMM d, yyyy')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The sync reports the Stripe price's interval; that names the plan exactly. */
const planFromInterval = (interval) =>
  interval === 'year' ? 'annual' : interval === 'month' ? 'monthly' : null

/**
 * The practice's Dentin plan. Stripe holds the money and the card; this
 * screen reads the mirrored state and hands off to Stripe-hosted pages for
 * anything sensitive — no card form ever renders in the app.
 */
export default function Billing() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  // Set once the reconcile has answered. It names the plan, and re-reading the
  // snapshot on it picks up a quantity the sync has just changed.
  const [sync, setSync] = useState(null)
  const { data: snap, loading } = useData(
    () => getBillingSnapshot({ planHint: planFromInterval(sync?.interval) }),
    [sync],
  )
  const [busy, setBusy] = useState(false)
  // Annual leads — the 10% is baked into the yearly price itself, so promo
  // codes (one per checkout, Stripe enforces it) apply on top of either plan.
  const [plan, setPlan] = useState('annual')

  // Back from Stripe: say what happened.
  useEffect(() => {
    const state = params.get('checkout')
    if (state === 'success') {
      toast({ title: 'Subscription started', body: 'Welcome aboard — the trial clock is running.' })
    } else if (state === 'cancelled') {
      toast({ title: 'Checkout closed', body: 'No charge was made.', tone: 'info' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Checkout runs at onboarding step 2, before the locations step exists, so a
  // multi-location practice can be subscribed for fewer seats than it uses.
  // Reconciling costs nothing when the two already agree, and this is the
  // screen where a change to somebody's bill ought to be explained.
  useEffect(() => {
    let alive = true
    syncBillingQuantity()
      .then((result) => {
        if (!alive) return
        setSync(result)
        if (!result?.synced) return
        toast({
          title: 'Subscription updated',
          body:
            `Your plan now covers ${plural(result.to, 'location')}. ` +
            (result.proration === 'none'
              ? 'Nothing has been charged yet, so your first invoice reflects the new count.'
              : result.to > result.from
                ? 'The difference is prorated onto your next invoice.'
                : 'The difference comes back as a credit on your next invoice.'),
        })
      })
      .catch((e) => {
        // Speculative call: a failure is not worth a toast on its own. It only
        // matters if it left a mismatch on screen, and the banner below says
        // so — carrying the server's message, which is written to be acted on.
        if (alive) setSync({ synced: false, reason: 'unreachable', error: e.message })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const act = async (fn) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast({ title: 'Billing', body: e.message, tone: 'error' })
      setBusy(false)
    }
  }

  const sub = snap?.subscription ?? null
  const status = sub ? (STATUS[sub.status] ?? { label: sub.status, tone: 'quiet' }) : null
  const trialDaysLeft =
    sub?.status === 'trialing' && sub.trialEnd
      ? Math.max(0, differenceInCalendarDays(new Date(sub.trialEnd), new Date()))
      : null
  const money = snap?.money
  // Only show the per-location maths once the plan is known — the two rates
  // differ, and a guess about somebody's monthly cost is worse than silence.
  const showMath = Boolean(snap?.plan && money)
  // A mismatch on a subscription that will never invoice again is noise.
  const drift =
    sub && ACTIVE_SUB_STATUSES.includes(sub.status) ? (snap?.mismatch ?? null) : null
  const pitchMath = snap?.pricing?.[plan]

  return (
    <Screen
      title="Billing & subscription"
      largeTitle={false}
      leading={
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="press flex items-center gap-0.5 pl-1 text-brand-600 dark:text-brand-400"
        >
          <ChevronLeft size={24} strokeWidth={2.2} />
          <span className="text-body">Back</span>
        </button>
      }
    >
      {loading ? (
        <div className="mt-3 space-y-3">
          <div className="skeleton h-40 rounded-card" />
        </div>
      ) : sub ? (
        /* --- There is a plan (or the demo's furnished one) --- */
        <div className="panel mt-3">
          <div className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-headline font-semibold">Dentin</p>
              <p className="mt-0.5 text-footnote text-label-3">
                {plural(snap.billedQuantity, 'location')} · billed through Stripe
              </p>
            </div>
            <Pill tone={status.tone} icon={sub.status === 'active' ? BadgeCheck : undefined}>
              {status.label}
            </Pill>
          </div>

          {/* What they are paying for, spelled out. A per-location price is
              only fair if the practice can see the multiplication. */}
          {showMath ? (
            <div className="border-t border-line px-3 py-2.5 text-subhead text-label-2">
              <b className="text-label">{plural(money.locationCount, 'location')}</b> ×{' '}
              {moneyRound(money.perLocationPerMonth)}/mo
              {money.plan === 'annual' ? ' (billed annually)' : ''} —{' '}
              <b className="text-label">{moneyRound(money.perMonth)}/mo</b>,{' '}
              {moneyRound(money.perYear)}/yr
            </div>
          ) : null}

          {drift ? (
            <div className="border-t border-line px-3 py-2.5 text-footnote text-label-3">
              Billing covers {plural(drift.billed, 'location')}; you have {drift.actual}.{' '}
              {sync?.synced
                ? 'Dentin has updated this — it can take a moment to show here.'
                : !sync || sync.reason === 'in-step'
                  ? 'Dentin is updating this.'
                  : (sync.error ??
                    'Dentin could not update this automatically. Open Manage billing to adjust the quantity, or contact support and we will set it for you.')}
            </div>
          ) : null}

          <div className="border-t border-line px-3 py-2.5 text-subhead text-label-2">
            {sub.status === 'trialing' && sub.trialEnd ? (
              <>
                Free until <b className="text-label">{day(sub.trialEnd)}</b>
                {trialDaysLeft != null ? (
                  <span className="text-label-3"> · {trialDaysLeft} days left</span>
                ) : null}
                . Billing starts automatically after the trial — cancel anytime before then and
                pay nothing.
              </>
            ) : sub.status === 'active' ? (
              <>
                {sub.cancelAtPeriodEnd ? 'Ends' : 'Renews'}{' '}
                {sub.currentPeriodEnd ? <b className="text-label">{day(sub.currentPeriodEnd)}</b> : 'automatically'}
                {sub.cancelAtPeriodEnd ? ' — cancellation is scheduled.' : '.'}
              </>
            ) : sub.status === 'past_due' ? (
              <>The last payment failed — update the card in the billing portal to keep service uninterrupted.</>
            ) : sub.status === 'canceled' ? (
              <>The subscription has ended. Data stays put; restart anytime.</>
            ) : (
              <>Finishing setup with Stripe…</>
            )}
          </div>

          <div className="border-t border-line p-3">
            {sub.status === 'canceled' ? (
              <Button
                className="w-full"
                loading={busy}
                onClick={() => act(() => startSubscriptionCheckout('annual'))}
              >
                Restart subscription
              </Button>
            ) : (
              <Button
                className="w-full"
                variant="secondary"
                icon={ExternalLink}
                loading={busy}
                onClick={() => act(openBillingPortal)}
              >
                Manage billing — card, invoices, cancel
              </Button>
            )}
          </div>

          {snap.demo ? (
            <p className="border-t border-line px-3 py-2.5 text-footnote text-label-3">
              This is the demo practice's furnished trial. On the live app this screen mirrors
              Stripe in real time.
            </p>
          ) : null}
        </div>
      ) : (
        /* --- No plan yet: the pitch, then Stripe Checkout --- */
        <div className="panel mt-3">
          <div className="p-4">
            <p className="text-caption font-bold uppercase tracking-[0.5px] text-brand-700 dark:text-brand-400">
              Dentin
            </p>

            <div className="mt-3">
              <SegmentedControl
                value={plan}
                onChange={setPlan}
                options={[
                  { value: 'annual', label: 'Annual · save 10%' },
                  { value: 'monthly', label: 'Monthly' },
                ]}
              />
            </div>

            {plan === 'annual' ? (
              <>
                <p className="mt-3.5 text-title1 font-bold leading-tight">
                  $180
                  <span className="text-title3 font-semibold text-label-3"> / location / month</span>
                </p>
                <p className="mt-1 text-subhead text-label-2">
                  Billed annually — $2,160 per location per year, 10% under the monthly rate
                </p>
              </>
            ) : (
              <>
                <p className="mt-3.5 text-title1 font-bold leading-tight">
                  $200
                  <span className="text-title3 font-semibold text-label-3"> / location / month</span>
                </p>
                <p className="mt-1 text-subhead text-label-2">Billed month to month</p>
              </>
            )}
            {/* Multi-location practices should see their own total before they
                enter a card, not a per-location rate they have to multiply. */}
            {pitchMath && pitchMath.locationCount > 1 ? (
              <p className="mt-1 text-subhead text-label-2">
                You have {plural(pitchMath.locationCount, 'location')} —{' '}
                <b className="text-label">{moneyRound(pitchMath.perMonth)}/mo</b>,{' '}
                {moneyRound(pitchMath.perYear)}/yr
              </p>
            ) : null}
            <p className="mt-1 text-subhead text-label-2">
              First 7 days free · no setup fee · cancel anytime
            </p>
          </div>

          <ul className="border-t border-line px-4 py-3">
            {PLAN_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2 py-1 text-subhead text-label-2">
                <Check size={15} strokeWidth={2.6} className="mt-0.5 shrink-0 text-ios-green" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>

          <div className="border-t border-line p-3">
            <Button
              className="w-full"
              size="lg"
              icon={CreditCard}
              loading={busy}
              onClick={() => act(() => startSubscriptionCheckout(plan))}
            >
              Start the free trial{plan === 'annual' ? ' — annual' : ' — monthly'}
            </Button>
            <p className="mt-2 text-center text-caption text-label-3">
              Checkout and card details are handled by Stripe — Dentin never sees the number.
              Have a promo code? Enter it on the checkout page (one code per subscription).
            </p>
          </div>
        </div>
      )}

      <p className="px-1 pt-3 text-footnote text-label-3">
        {isDemo
          ? 'Live billing turns on once the app runs against Supabase with Stripe keys configured.'
          : 'Invoices, receipts and card changes all live in the Stripe billing portal.'}
      </p>
    </Screen>
  )
}
