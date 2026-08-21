import { NavLink, useLocation } from 'react-router-dom'
import { Boxes, ChartNoAxesColumn, LayoutGrid, ScanLine, ShoppingCart } from 'lucide-react'
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
                    <span className="relative">
                      <Icon size={25} strokeWidth={isActive ? 2.1 : 1.7} aria-hidden="true" />
                      {badge ? (
                        <span
                          className="tnum absolute -right-2.5 -top-1 min-w-[17px] rounded-full bg-ios-red px-[5px] text-center text-[11px] font-semibold leading-[17px] text-white"
                          aria-hidden="true"
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[10px] font-medium leading-none tracking-[0.005em]">
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
