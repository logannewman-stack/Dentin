import { useEffect, useState } from 'react'
import { CreditCard, ExternalLink, LogOut, RefreshCw } from 'lucide-react'
import { SegmentedControl } from '@/components/ui/Controls'
import { openBillingPortal, startSubscriptionCheckout } from '@/lib/repository'
import { useAuth } from '@/lib/AuthContext'

const REASON = {
  canceled: {
    title: 'Your subscription has ended',
    body: 'Your data is safe exactly as you left it. Restart the plan and everything comes straight back.',
  },
  unpaid: {
    title: 'Payment could not be collected',
    body: 'The card on file was declined. Update it in the billing portal and access resumes immediately.',
  },
  incomplete: {
    title: 'Checkout never finished',
    body: 'The subscription was started but not confirmed. Finish checkout to open the app.',
  },
  incomplete_expired: {
    title: 'Checkout expired',
    body: 'That checkout session timed out before it was confirmed. Start it again below.',
  },
  paused: {
    title: 'Your subscription is paused',
    body: 'Resume it from the billing portal to get back in.',
  },
  none: {
    title: 'Your trial has ended',
    body: 'Pick a plan to keep using Dentin. Everything you have counted, priced and ordered is still here.',
  },
}

/**
 * The wall a lapsed practice hits. It is deliberately not a dead end: the
 * data is described as intact (it is — nothing is deleted), and both ways
 * back in are one tap away.
 *
 * `onRecheck` re-reads the subscription, and this screen also polls for the
 * first minute, so a practice that just paid is not stuck staring at a wall
 * while Stripe's webhook lands.
 */
export default function Paywall({ status, hasCustomer, onRecheck }) {
  const { signOut } = useAuth()
  const [plan, setPlan] = useState('annual')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const copy = REASON[status] ?? REASON.none

  useEffect(() => {
    let tries = 0
    const id = setInterval(() => {
      tries += 1
      if (tries > 12) {
        clearInterval(id)
        return
      }
      onRecheck?.()
    }, 5000)
    return () => clearInterval(id)
  }, [onRecheck])

  const act = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message ?? 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-[26rem]">
        <span className="flex h-11 w-11 items-center justify-center rounded-[4px] bg-brand-600 text-white">
          <CreditCard size={21} strokeWidth={2.1} aria-hidden="true" />
        </span>
        <h1 className="mt-3.5 text-title1 font-bold tracking-tight">{copy.title}</h1>
        <p className="mt-1.5 text-subhead text-label-2">{copy.body}</p>

        <div className="mt-5">
          <SegmentedControl
            value={plan}
            onChange={setPlan}
            options={[
              { value: 'annual', label: 'Annual · save 10%' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
        </div>

        <div className="mt-3 rounded-card bg-surface shadow-card p-4">
          <p className="text-title2 font-bold leading-tight">
            {plan === 'annual' ? '$180' : '$200'}
            <span className="text-callout font-semibold text-label-3"> / location / month</span>
          </p>
          <p className="mt-1 text-footnote text-label-3">
            {plan === 'annual'
              ? 'Billed annually — $2,160 per location per year'
              : 'Billed month to month'}
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => act(() => startSubscriptionCheckout(plan))}
          className="mt-3 flex h-[50px] w-full items-center justify-center gap-2 rounded-[4px] bg-brand-600 text-body font-semibold text-white transition-opacity active:opacity-85 disabled:opacity-60"
        >
          <CreditCard size={17} strokeWidth={2.2} aria-hidden="true" />
          {status === 'none' ? 'Choose a plan' : 'Restart the subscription'}
        </button>

        {hasCustomer ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => act(openBillingPortal)}
            className="press mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-[4px] border border-line bg-surface text-callout font-semibold text-label"
          >
            <ExternalLink size={15} strokeWidth={2.2} aria-hidden="true" />
            Manage billing — card, invoices, receipts
          </button>
        ) : null}

        {error ? (
          <p role="alert" className="mt-2 text-center text-footnote text-ios-red">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-center gap-4 text-footnote text-label-3">
          <button type="button" onClick={() => onRecheck?.()} className="press flex items-center gap-1.5">
            <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
            Already paid? Check again
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={signOut} className="press flex items-center gap-1.5">
            <LogOut size={13} strokeWidth={2.2} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
