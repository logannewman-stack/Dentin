import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * The iOS screen shell: a translucent nav bar whose large title collapses
 * into the compact title as content scrolls under it, and a hairline that
 * only appears once there is something above the fold.
 *
 * The scroll container lives here (not on the document) so the bar can stay
 * fixed without the page rubber-banding behind it.
 */
export default function Screen({
  title,
  subtitle,
  largeTitle = true,
  leading,
  trailing,
  toolbar,
  children,
  className,
  contentClassName,
  bottomInset = true,
}) {
  const scrollerRef = useRef(null)
  const frame = useRef(0)
  const [progress, setProgress] = useState(0)

  const onScroll = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const top = scrollerRef.current?.scrollTop ?? 0
      // 52px of travel is roughly the height of the large title itself.
      setProgress(Math.min(1, Math.max(0, top / 52)))
    })
  }, [])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const collapsed = progress > 0.6

  return (
    <div className={cn('relative flex h-[100dvh] flex-col bg-canvas', className)}>
      {/* Nav bar */}
      <header
        className={cn(
          'absolute inset-x-0 top-0 z-30 transition-shadow duration-200',
          progress > 0.02 ? 'material-chrome' : 'bg-transparent',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="relative flex h-navbar items-center justify-between px-2">
          <div className="flex min-w-[68px] items-center justify-start">{leading}</div>

          {/* Bounded so a long product name truncates instead of running
              underneath the back button or the trailing action. */}
          <h1
            className={cn(
              'pointer-events-none absolute left-1/2 max-w-[calc(100%-184px)] -translate-x-1/2',
              'truncate text-center text-headline font-semibold transition-opacity duration-200',
            )}
            style={{ opacity: largeTitle ? (collapsed ? 1 : 0) : 1 }}
          >
            {title}
          </h1>

          <div className="flex min-w-[68px] items-center justify-end gap-1">{trailing}</div>
        </div>

        {toolbar ? <div className="px-4 pb-2">{toolbar}</div> : null}

        {/* Hairline appears only once the content sits beneath the bar */}
        <div
          className="h-[0.5px] bg-separator/60 transition-opacity duration-200"
          style={{ opacity: progress > 0.02 ? 1 : 0 }}
        />
      </header>

      {/* Scrolling content */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="scroll-area flex-1 overflow-y-auto"
        style={{ paddingTop: `calc(env(safe-area-inset-top) + ${toolbar ? 96 : 44}px)` }}
      >
        {largeTitle ? (
          <div className="px-4 pb-1 pt-2">
            <h2
              className="text-large font-bold tracking-tight"
              style={{
                opacity: 1 - progress,
                transform: `translateY(${progress * -8}px)`,
              }}
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-subhead text-label-3" style={{ opacity: 1 - progress }}>
                {subtitle}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={cn('px-4', contentClassName)}>{children}</div>

        {/* Clear the tab bar and the home indicator */}
        {bottomInset ? (
          <div style={{ height: 'calc(env(safe-area-inset-bottom) + 84px)' }} />
        ) : (
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        )}
      </div>
    </div>
  )
}
