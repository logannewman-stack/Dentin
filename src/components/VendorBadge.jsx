import { Check, Sparkles, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The one distinction that governs a buying decision: can we order from this
 * vendor today, or is this a price we cannot reach yet?
 *
 * Colour never carries it alone — each state ships an icon and a word, so it
 * survives colour-blindness, greyscale and a glance from across the operatory.
 */
export function VendorStatus({ hasAccount, isPreferred, className }) {
  if (isPreferred) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-[2px] bg-brand-600/10 px-1.5 py-[1px] text-caption font-semibold ring-1 ring-inset ring-brand-600/25 text-brand-700 dark:text-brand-400',
          className,
        )}
      >
        <Star size={11} strokeWidth={2.8} fill="currentColor" aria-hidden="true" />
        Preferred
      </span>
    )
  }

  if (hasAccount) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-[2px] bg-ios-green/10 px-1.5 py-[1px] text-caption font-semibold text-ios-green ring-1 ring-inset ring-ios-green/25',
          className,
        )}
      >
        <Check size={11} strokeWidth={3} aria-hidden="true" />
        Account
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-[2px] px-1.5 py-[1px] text-caption2 font-bold uppercase tracking-[0.06em] text-white',
        className,
      )}
      style={{ background: 'rgb(var(--viz-2))' }}
    >
      <Sparkles size={11} strokeWidth={2.8} aria-hidden="true" />
      New
    </span>
  )
}

/** Left rail that marks a whole card as a new-vendor opportunity. */
export function NewVendorRail({ active, className }) {
  if (!active) return null
  return (
    <span
      className={cn('absolute inset-y-0 left-0 w-[3px]', className)}
      style={{ background: 'rgb(var(--viz-2))' }}
      aria-hidden="true"
    />
  )
}
