import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useSkin } from '@/lib/skin'
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
  const [skin] = useSkin()
  const sharp = skin === 'software'

  // Software inks the glyph on a faint wash; iOS fills the tile and knocks the
  // glyph out in white. At 29pt a 12% wash goes muddy, and at 24px a solid
  // fill shouts — each language needs the opposite treatment.
  const sharpTints = {
    brand: 'bg-brand-600/12 text-brand-700 dark:text-brand-400',
    blue: 'bg-ios-blue/12 text-ios-blue',
    green: 'bg-ios-green/12 text-ios-green',
    orange: 'bg-ios-orange/14 text-ios-orange',
    red: 'bg-ios-red/12 text-ios-red',
    purple: 'bg-ios-purple/12 text-ios-purple',
    gray: 'bg-fill/12 text-label-2',
    quiet: 'bg-surface-2 text-label-2',
  }

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
        'flex shrink-0 items-center justify-center',
        sharp ? 'h-6 w-6 rounded-ios' : 'h-[29px] w-[29px] rounded-[7px]',
        (sharp ? sharpTints : tints)[tint] ?? (sharp ? sharpTints : tints).brand,
        className,
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  )
}
