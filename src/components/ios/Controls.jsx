import { Minus, Plus, Search, X } from 'lucide-react'
import { cn, haptic } from '@/lib/utils'

export function SearchField({ value, onChange, placeholder = 'Search', onFocus, autoFocus }) {
  return (
    <div className="relative flex items-center">
      <Search
        size={16}
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
          'h-9 w-full rounded-ios bg-fill/12 pl-8 pr-8 text-callout text-label',
          'placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-brand-500/40',
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-2 flex h-5 w-5 items-center justify-center rounded-full bg-label-3/50 text-white"
        >
          <X size={12} strokeWidth={3} />
        </button>
      ) : null}
    </div>
  )
}

export function SegmentedControl({ options, value, onChange, className }) {
  return (
    <div
      role="tablist"
      className={cn('flex gap-0.5 rounded-[9px] bg-fill/12 p-0.5', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => {
              haptic(6)
              onChange(opt.value)
            }}
            className={cn(
              'flex-1 rounded-[7px] px-3 py-1.5 text-subhead font-medium transition-all duration-200',
              active
                ? 'bg-surface text-label shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
                : 'text-label-2 active:opacity-60',
            )}
          >
            {opt.label}
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
      haptic(6)
      onChange(clamped)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => set(value - step)}
        disabled={value <= min}
        className="press flex h-9 w-9 items-center justify-center rounded-full bg-fill/12 text-label disabled:opacity-30"
      >
        <Minus size={18} strokeWidth={2.6} />
      </button>

      <div className="min-w-[64px] text-center">
        <span className="tnum text-title3 font-semibold">{value}</span>
        {unit ? <span className="ml-1 text-footnote text-label-3">{unit}</span> : null}
      </div>

      <button
        type="button"
        aria-label="Increase"
        onClick={() => set(value + step)}
        disabled={value >= max}
        className="press flex h-9 w-9 items-center justify-center rounded-full bg-fill/12 text-label disabled:opacity-30"
      >
        <Plus size={18} strokeWidth={2.6} />
      </button>
    </div>
  )
}

const TONES = {
  critical: 'bg-ios-red/12 text-ios-red',
  warning: 'bg-ios-orange/14 text-ios-orange',
  caution: 'bg-ios-yellow/18 text-[#946200] dark:text-ios-yellow',
  good: 'bg-ios-green/14 text-ios-green',
  info: 'bg-ios-blue/12 text-ios-blue',
  brand: 'bg-brand-600/12 text-brand-600 dark:text-brand-400',
  quiet: 'bg-fill/12 text-label-2',
}

export function Pill({ tone = 'quiet', children, className, icon: Icon }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold',
        TONES[tone] ?? TONES.quiet,
        className,
      )}
    >
      {Icon ? <Icon size={11} strokeWidth={2.6} aria-hidden="true" /> : null}
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
        haptic(8)
        onChange(!checked)
      }}
      className={cn(
        'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200',
        checked ? 'bg-ios-green' : 'bg-fill/25',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)]',
          'transition-transform duration-200 ease-out',
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  )
}

/** Circular par-level gauge. Reads faster than a number on a dashboard. */
export function Gauge({ value = 0, size = 44, stroke = 4, tone = 'brand' }) {
  const pct = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const colors = {
    brand: 'rgb(14 124 123)',
    critical: 'rgb(255 59 48)',
    warning: 'rgb(255 149 0)',
    good: 'rgb(52 199 89)',
  }

  return (
    <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${pct}% of par`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        className="text-fill/15"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={colors[tone] ?? colors.brand}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct / 100)}
        style={{ transition: 'stroke-dashoffset 500ms cubic-bezier(0.32,0.72,0,1)' }}
      />
    </svg>
  )
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      {Icon ? (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-fill/10 text-label-3">
          <Icon size={26} strokeWidth={1.7} aria-hidden="true" />
        </span>
      ) : null}
      <h3 className="text-headline font-semibold">{title}</h3>
      {body ? <p className="mt-1 max-w-[34ch] text-subhead text-label-3">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
