import { Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn, haptic } from '@/lib/utils'

const VARIANTS = {
  primary: 'bg-brand-600 text-white active:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'bg-surface-2 text-brand-600 dark:text-brand-400 active:bg-surface-3',
  tinted: 'bg-brand-600/12 text-brand-600 dark:text-brand-400 active:bg-brand-600/20',
  destructive: 'bg-ios-red text-white active:opacity-80',
  plain: 'text-brand-600 dark:text-brand-400 active:opacity-60',
}

const SIZES = {
  sm: 'h-9 px-3.5 text-subhead rounded-[9px]',
  md: 'h-11 px-4 text-callout rounded-ios',
  lg: 'h-[50px] px-5 text-body rounded-[14px]',
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
    'inline-flex select-none items-center justify-center gap-2 font-semibold',
    'transition-[opacity,background-color] duration-150',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  )

  const content = (
    <>
      {loading ? (
        <Loader2 size={17} className="animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon size={17} strokeWidth={2.2} aria-hidden="true" />
      ) : null}
      {children}
    </>
  )

  if (to && !disabled && !loading) {
    return (
      <Link to={to} className={classes} onClick={() => haptic()} {...rest}>
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
        haptic()
        onClick?.(e)
      }}
      {...rest}
    >
      {content}
    </button>
  )
}
