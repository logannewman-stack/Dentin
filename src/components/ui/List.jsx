import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn, haptic } from '@/lib/utils'

/**
 * A grouped list section: quiet header, card, explanatory footer beneath.
 * The footer is set inside the same 16px gutter as the header so the three
 * parts read as one block rather than three stacked things.
 */
export function Section({ title, footer, children, className, action }) {
  return (
    <section className={cn('mb-2', className)}>
      {title || action ? (
        <div className="flex items-baseline justify-between gap-2">
          {title ? <h3 className="section-label">{title}</h3> : <span />}
          {action ? <div className="px-4 pb-2 pt-6">{action}</div> : null}
        </div>
      ) : null}
      <div className="panel">{children}</div>
      {footer ? (
        <p className="px-4 pt-2 text-footnote leading-snug text-label-3">{footer}</p>
      ) : null}
    </section>
  )
}

/**
 * One row of a grouped list.
 *
 * 44pt minimum, the platform's touch target — the reason an iOS list feels
 * unhurried where a 38px row reads as a spreadsheet. Chevrons appear only on
 * rows that navigate, in the quiet grey iOS uses, so they never compete with
 * the row's own content.
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

      <span className="flex min-w-0 flex-1 flex-col py-2">
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
        <span className="tnum shrink-0 text-body text-label-3">{detail}</span>
      ) : null}
      {trailing}
      {showChevron ? (
        <ChevronRight
          size={17}
          strokeWidth={2.6}
          className="-mr-1 shrink-0 text-label-3/55"
          aria-hidden="true"
        />
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

/**
 * The rounded glyph tile from an iOS settings row: 29pt, a saturated fill,
 * and a white glyph. Solid rather than tinted — at this size a 12% wash goes
 * muddy, and the saturated square is what makes the row scannable.
 */
export function RowIcon({ children, tint = 'brand', className }) {
  const tints = {
    brand: 'bg-brand-600 text-white',
    blue: 'bg-ios-blue text-white',
    green: 'bg-ios-green text-white',
    orange: 'bg-ios-orange text-white',
    red: 'bg-ios-red text-white',
    purple: 'bg-ios-purple text-white',
    gray: 'bg-fill text-white',
    quiet: 'bg-surface-3 text-label-2',
  }
  return (
    <span
      className={cn(
        'flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-[7px]',
        tints[tint] ?? tints.brand,
        className,
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  )
}
