import { Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn, haptic } from '@/lib/utils'

/**
 * Buttons are bordered and square-ish rather than filled pills. Secondary and
 * tinted variants carry a visible edge so they still read as controls on a
 * dense surface, where a tint alone disappears.
 */
const VARIANTS = {
  primary:
    'bg-brand-600 text-white border border-brand-700 hover:bg-brand-500 active:bg-brand-700 disabled:bg-brand-600/45 disabled:border-transparent',
  secondary:
    'bg-surface text-label border border-line hover:bg-surface-2 active:bg-surface-3',
  tinted:
    'bg-brand-600/10 text-brand-700 dark:text-brand-400 border border-brand-600/25 hover:bg-brand-600/16',
  destructive:
    'bg-ios-red text-white border border-ios-red hover:opacity-90 active:opacity-80',
  plain: 'text-brand-700 dark:text-brand-400 border border-transparent hover:bg-surface-2',
}

const SIZES = {
  sm: 'h-7 px-2.5 text-footnote rounded-[4px] gap-1.5',
  md: 'h-8 px-3 text-subhead rounded-[5px] gap-1.5',
  lg: 'h-10 px-4 text-body rounded-[6px] gap-2',
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
    'focus-ring inline-flex select-none items-center justify-center font-medium',
    'transition-colors duration-100',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  )

  const content = (
    <>
      {loading ? (
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
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
