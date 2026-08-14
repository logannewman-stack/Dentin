import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn, haptic } from '@/lib/utils'

export function Section({ title, footer, children, className, action }) {
  return (
    <section className={cn('mb-1', className)}>
      {title || action ? (
        <div className="flex items-baseline justify-between gap-2">
          {title ? <h3 className="section-label">{title}</h3> : <span />}
          {action ? <div className="pb-1.5 pt-5">{action}</div> : null}
        </div>
      ) : null}
      <div className="panel">{children}</div>
      {footer ? (
        <p className="px-0.5 pt-1.5 text-footnote leading-snug text-label-3">{footer}</p>
      ) : null}
    </section>
  )
}

/**
 * One row of a panel.
 *
 * Denser than the iOS equivalent — 38px minimum instead of 44 — because a
 * pointer-and-keyboard audience reads more rows at once and scrolls less.
 * Chevrons only appear on rows that actually navigate.
 */
export const Row = forwardRef(function Row(
  {
    to,
    onClick,
    leading,
    title,
    subtitle,
    detail,
    trailing,
    chevron,
    destructive,
    disabled,
    className,
    inset = true,
    children,
    ...rest
  },
  ref,
) {
  const interactive = Boolean(to || onClick)
  const showChevron = chevron ?? Boolean(to)

  const body = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}

      <span className="flex min-w-0 flex-1 flex-col py-1.5">
        <span
          className={cn('truncate text-body', destructive ? 'text-ios-red' : 'text-label')}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="truncate text-footnote text-label-3">{subtitle}</span>
        ) : null}
        {children}
      </span>

      {detail ? (
        <span className="tnum shrink-0 text-subhead text-label-3">{detail}</span>
      ) : null}
      {trailing}
      {showChevron ? (
        <ChevronRight size={14} className="shrink-0 text-label-3/60" aria-hidden="true" />
      ) : null}
    </>
  )

  const classes = cn(
    'row',
    inset && leading ? 'row-inset' : null,
    interactive && !disabled ? 'press' : null,
    disabled ? 'opacity-40' : null,
    className,
  )

  if (to && !disabled) {
    return (
      <Link ref={ref} to={to} className={classes} onClick={() => haptic(4)} {...rest}>
        {body}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          haptic(4)
          onClick(e)
        }}
        className={classes}
        {...rest}
      >
        {body}
      </button>
    )
  }

  return (
    <div ref={ref} className={classes} {...rest}>
      {body}
    </div>
  )
})

/** Square glyph tile. Sharp corners, flat tint — no gloss, no gradient. */
export function RowIcon({ children, tint = 'brand', className }) {
  const tints = {
    brand: 'bg-brand-600/12 text-brand-700 dark:text-brand-400',
    blue: 'bg-ios-blue/12 text-ios-blue',
    green: 'bg-ios-green/12 text-ios-green',
    orange: 'bg-ios-orange/14 text-ios-orange',
    red: 'bg-ios-red/12 text-ios-red',
    purple: 'bg-ios-purple/12 text-ios-purple',
    gray: 'bg-fill/12 text-label-2',
    quiet: 'bg-surface-2 text-label-2',
  }
  return (
    <span
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-[3px]',
        tints[tint] ?? tints.brand,
        className,
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  )
}
