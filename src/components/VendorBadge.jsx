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
          'inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-600/12 px-2 py-0.5 text-caption font-semibold text-brand-700 dark:text-brand-400',
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
          'inline-flex shrink-0 items-center gap-1 rounded-full bg-ios-green/14 px-2 py-0.5 text-caption font-semibold text-ios-green',
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
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-caption font-bold uppercase tracking-[0.4px] text-white',
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
