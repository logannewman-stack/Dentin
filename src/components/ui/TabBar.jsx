import { NavLink, useLocation } from 'react-router-dom'
import { Boxes, ChartNoAxesColumn, LayoutGrid, ScanLine, ShoppingCart } from 'lucide-react'
import { useSkin } from '@/lib/skin'
import { cn, haptic } from '@/lib/utils'

// Practice settings live behind the Today screen's header rather than taking
// a slot here.
const TABS = [
  { to: '/', label: 'Today', Icon: LayoutGrid, end: true },
  { to: '/inventory', label: 'Inventory', Icon: Boxes },
  { to: '/scan', label: 'Scan', Icon: ScanLine },
  { to: '/orders', label: 'Orders', Icon: ShoppingCart },
  { to: '/insights', label: 'Insights', Icon: ChartNoAxesColumn },
]

/**
 * Translucent tab bar, 49pt, that content scrolls under. The active tab is
 * marked by colour and a heavier glyph — no keyline, because iOS has never
 * used one and it reads as web navigation the moment you add it.
 */
export default function TabBar({ badges = {} }) {
  const { pathname } = useLocation()
  const [skin] = useSkin()
  const sharp = skin === 'software'

  const HIDDEN = ['/scan', '/onboarding', '/welcome']
  if (HIDDEN.some((p) => pathname.startsWith(p))) return null

  return (
    <nav
      className="material-chrome fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: 'inset 0 0.5px 0 rgb(var(--separator))',
      }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex h-tabbar w-full max-w-2xl items-stretch">
        {TABS.map(({ to, label, Icon, end }) => {
          const badge = badges[to]
          return (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                onClick={(e) => {
                  haptic(4)
                  // Tapping the tab you are already on returns that screen to
                  // the top rather than doing nothing. Every iOS app does it,
                  // and once you know it exists you use it constantly.
                  const alreadyHere = end ? pathname === to : pathname.startsWith(to)
                  if (!alreadyHere) return
                  e.preventDefault()
                  document
                    .querySelector('.scroll-area')
                    ?.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-full flex-col items-center justify-center gap-[3px] transition-colors duration-150 active:opacity-45',
                    isActive ? 'text-brand-600 dark:text-brand-400' : 'text-label-3',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Software marks the active tab with a top keyline; iOS
                        never has, and adding one reads as web navigation. */}
                    {sharp && isActive ? (
                      <span className="absolute inset-x-3 top-0 h-[2px] bg-brand-600" aria-hidden="true" />
                    ) : null}
                    <span className="relative">
                      <Icon
                        size={sharp ? 17 : 25}
                        strokeWidth={isActive ? 2.1 : 1.7}
                        aria-hidden="true"
                      />
                      {badge ? (
                        <span
                          className={cn(
                            'tnum absolute -right-2.5 -top-1 bg-ios-red text-center font-semibold text-white',
                            sharp
                              ? 'min-w-[15px] rounded-[2px] px-1 text-[9px] leading-[14px]'
                              : 'min-w-[17px] rounded-full px-[5px] text-[11px] leading-[17px]',
                          )}
                          aria-hidden="true"
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'font-medium leading-none',
                        sharp ? 'text-caption2' : 'text-[10px] tracking-[0.005em]',
                      )}
                    >
                      {label}
                    </span>
                    {badge ? <span className="sr-only">{badge} needing attention</span> : null}
                  </>
                )}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
