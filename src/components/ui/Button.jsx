import { Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn, haptic } from '@/lib/utils'

/**
 * Filled, borderless, and rounded — UIKit buttons, not bordered web controls.
 * A press dims the whole control rather than swapping its fill, which is what
 * makes an iOS tap feel immediate instead of stateful.
 */
const VARIANTS = {
  primary: 'bg-brand-600 text-white disabled:bg-brand-600/40',
  secondary: 'bg-fill/[0.10] text-label dark:bg-fill/[0.24]',
  tinted: 'bg-brand-600/12 text-brand-600 dark:text-brand-400 dark:bg-brand-400/16',
  destructive: 'bg-ios-red text-white',
  plain: 'text-brand-600 dark:text-brand-400',
}

const SIZES = {
  sm: 'h-8 px-3 text-footnote rounded-[8px] gap-1.5',
  md: 'h-9 px-3.5 text-subhead rounded-[9px] gap-1.5',
  lg: 'h-[50px] px-5 text-body rounded-field gap-2',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  className,
  children,
  to,
  icon: Icon,
  onClick,
  ...rest
}) {
  const classes = cn(
    'focus-ring inline-flex select-none items-center justify-center font-semibold',
    // The press is an opacity dip, instantly on and eased off.
    'transition-opacity duration-200 ease-out active:opacity-55 active:duration-0',
    'disabled:pointer-events-none disabled:opacity-45',
    VARIANTS[variant],
    SIZES[size],
    className,
  )

  const glyph = size === 'lg' ? 18 : 15

  const content = (
    <>
      {loading ? (
        <Loader2 size={glyph} className="animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon size={glyph} strokeWidth={2.2} aria-hidden="true" />
      ) : null}
      {children}
    </>
  )

  if (to && !disabled && !loading) {
    return (
      <Link to={to} className={classes} onClick={() => haptic(4)} {...rest}>
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || loading}
      onClick={(e) => {
        haptic(4)
        onClick?.(e)
      }}
      {...rest}
    >
      {content}
    </button>
  )
}
