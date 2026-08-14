import { cn } from '@/lib/utils'

/**
 * Screen shell.
 *
 * The iOS build collapsed a 34px large title into a translucent bar on scroll.
 * Software does not do that: the header is a fixed, opaque strip with a
 * hairline rule, the title sits small and left-aligned beside its metadata,
 * and content starts immediately beneath. Nothing moves as you scroll, which
 * is what makes a dense screen feel stable rather than springy.
 *
 * `largeTitle` is accepted and ignored, so screens carried over from the iOS
 * branch render unchanged.
 */
export default function Screen({
  title,
  subtitle,
  // eslint-disable-next-line no-unused-vars
  largeTitle,
  leading,
  trailing,
  toolbar,
  children,
  className,
  contentClassName,
  bottomInset = true,
}) {
  return (
    <div className={cn('flex h-[100dvh] flex-col bg-canvas', className)}>
      <header
        className="material-chrome z-30 shrink-0 border-b border-line"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex h-navbar items-center gap-2 px-3">
          {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}

          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <h1 className="truncate text-title3 font-semibold tracking-tight">{title}</h1>
            {subtitle ? (
              <span className="hidden truncate text-footnote text-label-3 sm:block">
                {subtitle}
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">{trailing}</div>
        </div>

        {/* On narrow screens the subtitle drops to its own line rather than
            truncating the title it describes. */}
        {subtitle ? (
          <p className="truncate px-3 pb-2 text-footnote text-label-3 sm:hidden">{subtitle}</p>
        ) : null}

        {toolbar ? <div className="px-3 pb-2.5">{toolbar}</div> : null}
      </header>

      <div className="scroll-area flex-1 overflow-y-auto">
        <div className={cn('px-3 pt-1', contentClassName)}>{children}</div>

        {bottomInset ? (
          <div style={{ height: 'calc(env(safe-area-inset-bottom) + 76px)' }} />
        ) : (
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        )}
      </div>
    </div>
  )
}
