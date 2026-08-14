import { Minus, Plus, Search, X } from 'lucide-react'
import { cn, haptic } from '@/lib/utils'

export function SearchField({ value, onChange, placeholder = 'Search', onFocus, autoFocus }) {
  return (
    <div className="relative flex items-center">
      <Search
        size={14}
        className="pointer-events-none absolute left-2.5 text-label-3"
        aria-hidden="true"
      />
      <input
        type="search"
        inputMode="search"
        value={value}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          'focus-ring h-8 w-full rounded-[3px] border border-line bg-surface pl-8 pr-8',
          'text-subhead text-label placeholder:text-label-3',
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-2 flex h-4 w-4 items-center justify-center rounded-[2px] text-label-3 hover:bg-surface-2 hover:text-label"
        >
          <X size={12} strokeWidth={2.6} />
        </button>
      ) : null}
    </div>
  )
}

/** A bordered switcher — closer to a tab strip than an iOS segmented control. */
export function SegmentedControl({ options, value, onChange, className }) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex w-full overflow-hidden rounded-[3px] border border-line bg-surface',
        className,
      )}
    >
      {options.map((opt, i) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => {
              haptic(4)
              onChange(opt.value)
            }}
            className={cn(
              'min-w-0 flex-1 px-2.5 py-1.5 text-footnote font-medium transition-colors duration-100',
              i > 0 && 'border-l border-line',
              active
                ? 'bg-brand-600/10 text-brand-700 dark:text-brand-400'
                : 'text-label-2 hover:bg-surface-2',
            )}
          >
            <span className="truncate">{opt.label}</span>
            {opt.count != null ? (
              <span className="tnum ml-1 text-label-3">{opt.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function Stepper({ value, onChange, min = 0, max = 9999, step = 1, unit }) {
  const set = (next) => {
    const clamped = Math.min(max, Math.max(min, Number(next.toFixed(2))))
    if (clamped !== value) {
      haptic(4)
      onChange(clamped)
    }
  }

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-[3px] border border-line">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => set(value - step)}
        disabled={value <= min}
        className="flex h-9 w-10 items-center justify-center bg-surface text-label transition-colors hover:bg-surface-2 disabled:opacity-30"
      >
        <Minus size={15} strokeWidth={2.4} />
      </button>

      <div className="flex min-w-[68px] flex-col items-center justify-center border-x border-line bg-surface px-2">
        <span className="tnum text-title3 font-semibold leading-none">{value}</span>
        {unit ? <span className="mt-0.5 text-caption2 text-label-3">{unit}</span> : null}
      </div>

      <button
        type="button"
        aria-label="Increase"
        onClick={() => set(value + step)}
        disabled={value >= max}
        className="flex h-9 w-10 items-center justify-center bg-surface text-label transition-colors hover:bg-surface-2 disabled:opacity-30"
      >
        <Plus size={15} strokeWidth={2.4} />
      </button>
    </div>
  )
}

/**
 * Status badge: tinted fill with a matching hairline, so it reads as a data
 * chip rather than an iOS capsule.
 */
const TONES = {
  critical: 'bg-ios-red/10 text-ios-red ring-ios-red/25',
  warning: 'bg-ios-orange/12 text-ios-orange ring-ios-orange/25',
  caution: 'bg-ios-yellow/14 text-ios-yellow ring-ios-yellow/30',
  good: 'bg-ios-green/10 text-ios-green ring-ios-green/25',
  info: 'bg-ios-blue/10 text-ios-blue ring-ios-blue/25',
  brand: 'bg-brand-600/10 text-brand-700 dark:text-brand-400 ring-brand-600/25',
  quiet: 'bg-surface-2 text-label-2 ring-line',
}

/**
 * Sentence case, not micro-caps. Uppercase suits a one-word state ("NEW") and
 * shouts at anything longer — and these carry phrases like "Cheapest on the
 * market". Uppercase stays reserved for the vendor-status badge.
 */
export function Pill({ tone = 'quiet', children, className, icon: Icon }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-[2px] px-1.5 py-[1px]',
        'text-caption font-medium ring-1 ring-inset',
        TONES[tone] ?? TONES.quiet,
        className,
      )}
    >
      {Icon ? <Icon size={10} strokeWidth={2.6} aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        haptic(4)
        onChange(!checked)
      }}
      className={cn(
        'focus-ring relative h-[20px] w-[34px] shrink-0 rounded-[2px] border transition-colors duration-100',
        checked ? 'border-brand-700 bg-brand-600' : 'border-line bg-surface-2',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[14px] w-[14px] rounded-[2px] transition-transform duration-100 ease-sharp',
          checked ? 'translate-x-[17px] bg-white' : 'translate-x-[2px] bg-label-3',
        )}
      />
    </button>
  )
}

/**
 * Par-level meter.
 *
 * A linear bar rather than a ring: a par level is a measurement against a
 * threshold, and bars line up down a column of rows where circles do not.
 * Keeps the `size`/`stroke` props so existing call sites render unchanged.
 */
export function Gauge({ value = 0, size = 44, stroke = 4, tone = 'brand' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const colors = {
    brand: 'rgb(var(--brand))',
    critical: '#DC2626',
    warning: '#D97706',
    good: '#1F9D55',
  }

  return (
    <span
      className="flex shrink-0 flex-col items-end gap-1"
      style={{ width: Math.max(size, 34) }}
      role="img"
      aria-label={`${pct}% of par`}
    >
      <span className="tnum text-caption2 font-semibold leading-none text-label-2">{pct}%</span>
      <span
        className="w-full overflow-hidden rounded-[2px] bg-fill/15"
        style={{ height: Math.max(3, stroke - 1) }}
      >
        <span
          className="block h-full rounded-[2px] transition-[width] duration-300 ease-sharp"
          style={{ width: `${Math.max(pct, 2)}%`, background: colors[tone] ?? colors.brand }}
        />
      </span>
    </span>
  )
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon ? (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-[4px] border border-line bg-surface text-label-3">
          <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
        </span>
      ) : null}
      <h3 className="text-headline">{title}</h3>
      {body ? <p className="mt-1 max-w-[38ch] text-footnote text-label-3">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
