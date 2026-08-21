import { cn } from '@/lib/utils'

/**
 * Screen shell.
 *
 * A 44pt translucent nav bar with the iOS large title sitting below it, in
 * the scroll region — so the title reads as the top of the page rather than
 * as chrome, and slides away as you scroll. Pass `largeTitle={false}` on
 * pushed detail screens, which keep the compact bar only.
 *
 * At `lg` the sidebar owns the brand, content shifts right of it, and the
 * rail widens to a desktop working width. All viewport-driven, so a Mac
 * window or an iPad in landscape lands in the right layout with no
 * user-agent guessing.
 */
export default function Screen({
  title,
  subtitle,
  largeTitle = true,
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
        className="material-chrome z-30 shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex h-navbar w-full max-w-2xl items-center gap-2 px-4 lg:max-w-6xl lg:px-6">
          {leading ? <div className="-ml-2 flex shrink-0 items-center">{leading}</div> : null}

          <div className="flex min-w-0 flex-1 items-center gap-2">
            {logo ? (
              <img
                src="/icon.svg"
                alt=""
                className="h-[22px] w-[22px] shrink-0 rounded-[5px] lg:hidden"
                aria-hidden="true"
              />
            ) : null}
            {/* The large title below already names the screen; repeating it in
                the bar is the classic iOS double-title mistake. Kept for
                screen readers, and shown for real on desktop. */}
            <h1
              className={cn(
                'truncate font-semibold tracking-[-0.022em] text-body',
                largeTitle ? 'sr-only lg:not-sr-only' : null,
              )}
            >
              {title}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-1">{trailing}</div>
        </div>

        {/* With a large title the toolbar belongs under it, in the scroll
            region — a search bar pinned above the title is the giveaway that
            a layout was never really iOS. Detail screens keep it in the bar. */}
        {toolbar && !largeTitle ? (
          <div className="mx-auto w-full max-w-2xl px-4 pb-2.5 lg:max-w-6xl lg:px-6">{toolbar}</div>
        ) : null}
      </header>

      <div className="scroll-area flex-1 overflow-y-auto">
        {largeTitle ? (
          <div className="mx-auto w-full max-w-2xl px-4 pb-1 pt-2 lg:max-w-6xl lg:px-6 lg:pt-4">
            <h2 className="truncate text-large font-bold text-label lg:sr-only">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-footnote text-label-3">{subtitle}</p>
            ) : null}
            {toolbar ? <div className="pt-2.5">{toolbar}</div> : null}
          </div>
        ) : null}

        <div
          className={cn('mx-auto w-full max-w-2xl px-4 lg:max-w-6xl lg:px-6', contentClassName)}
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
