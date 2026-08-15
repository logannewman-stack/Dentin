import { cn } from '@/lib/utils'

/**
 * Screen shell.
 *
 * A fixed, opaque topbar with a hairline rule — nothing moves on scroll.
 * Root screens can show the workspace mark (`logo`) on phones; at `lg` the
 * sidebar owns the brand, the content shifts right of it, and the rail widens
 * from a phone column to a desktop working width. All of it is driven by
 * viewport, so a Mac window, an iPad in landscape, or a resized browser each
 * land in the right layout without user-agent guessing.
 *
 * `largeTitle` is accepted and ignored, so screens written against the iOS
 * shell render unchanged.
 */
export default function Screen({
  title,
  subtitle,
  // eslint-disable-next-line no-unused-vars
  largeTitle,
  logo = false,
  leading,
  trailing,
  toolbar,
  children,
  className,
  contentClassName,
  bottomInset = true,
}) {
  return (
    <div className={cn('flex h-[100dvh] flex-col bg-canvas lg:pl-56', className)}>
      <header
        className="material-chrome z-30 shrink-0 border-b border-line"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex h-navbar w-full max-w-2xl items-center gap-2 px-3 lg:max-w-6xl lg:px-6">
          {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}

          <div className="flex min-w-0 flex-1 items-center gap-2">
            {logo ? (
              <img
                src="/icon.svg"
                alt=""
                className="h-[20px] w-[20px] shrink-0 rounded-[4px] lg:hidden"
                aria-hidden="true"
              />
            ) : null}
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{title}</h1>
            {subtitle ? (
              <>
                <span className="hidden text-label-3/60 sm:block" aria-hidden="true">
                  /
                </span>
                <span className="hidden truncate text-footnote text-label-3 sm:block">
                  {subtitle}
                </span>
              </>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">{trailing}</div>
        </div>

        {/* On narrow screens the subtitle drops to its own line rather than
            truncating the title it describes. */}
        {subtitle ? (
          <p className="mx-auto w-full max-w-2xl truncate px-3 pb-2 text-footnote text-label-3 sm:hidden">
            {subtitle}
          </p>
        ) : null}

        {toolbar ? (
          <div className="mx-auto w-full max-w-2xl px-3 pb-2.5 lg:max-w-6xl lg:px-6">{toolbar}</div>
        ) : null}
      </header>

      <div className="scroll-area flex-1 overflow-y-auto">
        <div
          className={cn(
            'mx-auto w-full max-w-2xl px-3 pt-1 lg:max-w-6xl lg:px-6 lg:pt-2',
            contentClassName,
          )}
        >
          {children}
        </div>

        {bottomInset ? (
          <>
            <div className="lg:hidden" style={{ height: 'calc(env(safe-area-inset-bottom) + 76px)' }} />
            <div className="hidden h-8 lg:block" />
          </>
        ) : (
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        )}
      </div>
    </div>
  )
}
