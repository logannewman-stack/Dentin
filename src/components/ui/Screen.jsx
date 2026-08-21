import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Screen shell.
 *
 * A 44pt translucent nav bar with the iOS large title below it, inside the
 * scroll region — so the title reads as the top of the page rather than as
 * chrome. Scrolling collapses it: the large title fades up and out, the
 * compact title fades into the bar to replace it, and a hairline appears
 * under the bar to separate it from the content now passing beneath.
 *
 * Pass `largeTitle={false}` on pushed detail screens, which keep the compact
 * bar only and show their title in it from the start.
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
  const scrollRef = useRef(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !largeTitle) return undefined

    // Read in a frame rather than on every scroll event, and swap on a
    // boolean rather than per-pixel — CSS runs the crossfade, so scrolling
    // never re-renders the tree. The two thresholds are hysteresis: a title
    // parked exactly on the line would otherwise flicker as you nudge it.
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const y = el.scrollTop
        setCollapsed((was) => (was ? y > 14 : y > 30))
      })
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [largeTitle])

  // Detail screens have nothing to collapse, so their title is simply there.
  const showCompactTitle = !largeTitle || collapsed

  return (
    <div className={cn('flex h-[100dvh] flex-col bg-canvas lg:pl-56', className)}>
      <header
        className={cn(
          'material-chrome z-30 shrink-0 transition-shadow duration-200 ease-out',
          // The hairline is the bar's way of saying content is passing under
          // it. At the top there is nothing beneath, so there is no rule.
          showCompactTitle
            ? 'shadow-[0_0.5px_0_rgb(var(--separator))]'
            : 'shadow-[0_0.5px_0_transparent]',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex h-navbar w-full max-w-2xl items-center gap-2 px-4 lg:max-w-6xl lg:px-6">
          {leading ? <div className="-ml-2 flex shrink-0 items-center">{leading}</div> : null}

          <div className="flex min-w-0 flex-1 items-center gap-2">
            {logo ? (
              <img
                src="/icon.svg"
                alt=""
                className={cn(
                  'h-[22px] w-[22px] shrink-0 rounded-[5px] transition-opacity duration-200 lg:hidden',
                  collapsed ? 'opacity-0' : 'opacity-100',
                )}
                aria-hidden="true"
              />
            ) : null}
            {/* The compact title only exists once the large one has gone —
                two copies of the same word on screen at once is the classic
                iOS double-title mistake. Always present for screen readers,
                and always visible on desktop, which has no large title. */}
            <h1
              className={cn(
                'truncate font-semibold tracking-[-0.022em] text-body',
                'transition-[opacity,transform] duration-200 ease-out lg:translate-y-0 lg:opacity-100',
                largeTitle && !showCompactTitle
                  ? 'translate-y-1 opacity-0'
                  : 'translate-y-0 opacity-100',
                // Hidden from the pointer so it cannot eat a tap while faded.
                largeTitle && !collapsed ? 'pointer-events-none lg:pointer-events-auto' : null,
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

      <div ref={scrollRef} className="scroll-area flex-1 overflow-y-auto">
        {largeTitle ? (
          <div className="mx-auto w-full max-w-2xl px-4 pb-1 pt-2 lg:max-w-6xl lg:px-6 lg:pt-4">
            {/* Fades as it leaves rather than simply scrolling off, so the
                handover to the compact title reads as one movement. */}
            <h2
              className={cn(
                'truncate text-large font-bold text-label transition-opacity duration-200 ease-out lg:sr-only',
                collapsed ? 'opacity-0' : 'opacity-100',
              )}
            >
              {title}
            </h2>
            {subtitle ? (
              <p
                className={cn(
                  'mt-0.5 truncate text-footnote text-label-3 transition-opacity duration-200 ease-out',
                  collapsed ? 'opacity-0' : 'opacity-100',
                )}
              >
                {subtitle}
              </p>
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
