import { Minus, Plus, Search, X } from 'lucide-react'
import { useSkin } from '@/lib/skin'
import { cn, haptic } from '@/lib/utils'

/** UISearchBar: a filled, rounded, borderless field on the grouped canvas. */
export function SearchField({ value, onChange, placeholder = 'Search', onFocus, autoFocus }) {
  return (
    <div className="relative flex items-center">
      <Search
        size={16}
        strokeWidth={2.4}
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
          'focus-ring h-9 w-full rounded-[10px] bg-fill/[0.10] pl-9 pr-9 dark:bg-fill/[0.22]',
          'text-callout text-label placeholder:text-label-3',
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-2.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-label-3/70 text-surface transition-opacity active:opacity-60"
        >
          <X size={12} strokeWidth={3} />
        </button>
      ) : null}
    </div>
  )
}

/**
 * UISegmentedControl: a recessed grey track with a white thumb that slides
 * under the selected label. The thumb is a positioned sibling rather than a
 * background on the active button, which is the only way it can animate
 * between segments instead of blinking.
 */
export function SegmentedControl({ options, value, onChange, className }) {
  const [skin] = useSkin()
  const sharp = skin === 'software'
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  return (
    <div
      role="tablist"
      className={cn(
        'relative inline-flex w-full',
        // Software: a bordered tab strip with dividers. iOS: a recessed track
        // with a thumb. Same control, two different objects.
        sharp
          ? 'overflow-hidden rounded-ios border border-line bg-surface'
          : 'rounded-[9px] bg-fill/[0.08] p-[2px] dark:bg-fill/[0.20]',
        className,
      )}
    >
      {/* The track carries 2px of padding, so the buttons divide (100% - 4px)
          between them — not 100%. Sizing the thumb off the raw percentage
          leaves it a few px narrow and drifting further out on each segment. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-[2px] left-[2px] rounded-[7px] bg-surface shadow-control transition-transform duration-200 ease-out',
          sharp && 'hidden',
        )}
        style={{
          width: `calc((100% - 4px) / ${options.length || 1})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
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
              'relative z-10 flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden',
              'px-2 text-footnote transition-colors duration-200',
              sharp ? 'py-1.5' : 'rounded-[7px] py-[5px]',
              sharp && i > 0 && 'border-l border-line',
              sharp && active && 'bg-brand-600/10 text-brand-700 dark:text-brand-400',
              sharp && !active && 'text-label-2',
              !sharp && (active ? 'font-semibold text-label' : 'font-medium text-label-2'),
            )}
          >
            {/* Label and count truncate as one unit. Left as siblings, the
                count sits outside the truncation and spills past the thumb. */}
            <span className="truncate">{opt.label}</span>
            {opt.count != null ? (
              <span className="tnum shrink-0 text-label-3">{opt.count}</span>
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
    <div className="inline-flex items-stretch overflow-hidden rounded-[10px] bg-fill/[0.08] dark:bg-fill/[0.20]">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => set(value - step)}
        disabled={value <= min}
        className="flex h-[38px] w-11 items-center justify-center text-label transition-opacity active:opacity-45 disabled:opacity-25"
      >
        <Minus size={15} strokeWidth={2.4} />
      </button>

      <div className="my-[2px] flex min-w-[68px] flex-col items-center justify-center rounded-[8px] bg-surface px-2 shadow-control">
        <span className="tnum text-title3 font-semibold leading-none">{value}</span>
        {unit ? <span className="mt-0.5 text-caption2 text-label-3">{unit}</span> : null}
      </div>

      <button
        type="button"
        aria-label="Increase"
        onClick={() => set(value + step)}
        disabled={value >= max}
        className="flex h-[38px] w-11 items-center justify-center text-label transition-opacity active:opacity-45 disabled:opacity-25"
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
  quiet: 'bg-fill/[0.10] text-label-2 ring-transparent',
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
        'inline-flex shrink-0 items-center gap-1 rounded-chip px-2 py-[2px]',
        'text-caption font-semibold ring-1 ring-inset',
        TONES[tone] ?? TONES.quiet,
        className,
      )}
    >
      {Icon ? <Icon size={11} strokeWidth={2.6} aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

/** UISwitch: 51×31pt, fully round, with a knob that carries a soft shadow. */
export function Toggle({ checked, onChange, label }) {
  const [skin] = useSkin()
  const sharp = skin === 'software'

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
        'focus-ring relative shrink-0 transition-colors duration-200 ease-out',
        sharp
          ? 'h-[20px] w-[34px] rounded-ios border ' +
            (checked ? 'border-brand-700 bg-brand-600' : 'border-line bg-surface-2')
          : 'h-[31px] w-[51px] rounded-full ' + (checked ? 'bg-ios-green' : 'bg-fill/25'),
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] transition-transform duration-200 ease-out',
          sharp
            ? 'h-[14px] w-[14px] rounded-[2px] ' +
              (checked ? 'translate-x-[17px] bg-white' : 'translate-x-[2px] bg-label-3')
            : 'h-[27px] w-[27px] rounded-full bg-white shadow-control ' +
              (checked ? 'translate-x-[22px]' : 'translate-x-[2px]'),
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
