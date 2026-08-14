import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn, haptic } from '@/lib/utils'

export function Section({ title, footer, children, className, action }) {
  return (
    <section className={cn('mb-2', className)}>
      {title || action ? (
        <div className="flex items-end justify-between">
          {title ? <h3 className="section-label">{title}</h3> : <span />}
          {action ? <div className="pb-2 pr-1 pt-6">{action}</div> : null}
        </div>
      ) : null}
      <div className="ios-group">{children}</div>
      {footer ? <p className="px-1 pt-2 text-footnote text-label-3">{footer}</p> : null}
    </section>
  )
}

/**
 * One row of a grouped list. Renders as a link, a button or a plain div
 * depending on what it's given, so the semantics stay honest.
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
          className={cn(
            'truncate text-body',
            destructive ? 'text-ios-red' : 'text-label',
            interactive && !destructive ? 'font-normal' : null,
          )}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="truncate text-footnote text-label-3">{subtitle}</span>
        ) : null}
        {children}
      </span>

      {detail ? (
        <span className="tnum shrink-0 text-callout text-label-3">{detail}</span>
      ) : null}
      {trailing}
      {showChevron ? (
        <ChevronRight size={17} className="shrink-0 text-label-3/70" aria-hidden="true" />
      ) : null}
    </>
  )

  const classes = cn(
    'ios-row',
    inset && leading ? 'ios-row-inset' : null,
    interactive && !disabled ? 'press active:bg-surface-2' : null,
    disabled ? 'opacity-40' : null,
    className,
  )

  if (to && !disabled) {
    return (
      <Link ref={ref} to={to} className={classes} onClick={() => haptic(6)} {...rest}>
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
          haptic(6)
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

/** Square art tile used as a row's leading element. */
export function RowIcon({ children, tint = 'brand', className }) {
  const tints = {
    brand: 'bg-brand-600 text-white',
    blue: 'bg-ios-blue text-white',
    green: 'bg-ios-green text-white',
    orange: 'bg-ios-orange text-white',
    red: 'bg-ios-red text-white',
    purple: 'bg-ios-purple text-white',
    gray: 'bg-ios-gray text-white',
    quiet: 'bg-surface-2 text-label-2',
  }
  return (
    <span
      className={cn(
        'flex h-[29px] w-[29px] items-center justify-center rounded-[7px]',
        tints[tint] ?? tints.brand,
        className,
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  )
}
