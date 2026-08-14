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
 * Opaque, rule-separated nav. The active tab is marked by a top keyline and a
 * colour shift rather than by a filled glyph, which keeps the row quiet on a
 * dense screen.
 */
export default function TabBar({ badges = {} }) {
  const { pathname } = useLocation()

  const HIDDEN = ['/scan', '/onboarding', '/welcome']
  if (HIDDEN.some((p) => pathname.startsWith(p))) return null

  return (
    <nav
      className="material-chrome fixed inset-x-0 bottom-0 z-40 border-t border-line"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
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
                onClick={() => haptic(4)}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-full flex-col items-center justify-center gap-1 transition-colors duration-100',
                    isActive ? 'text-brand-700 dark:text-brand-400' : 'text-label-3',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <span
                        className="absolute inset-x-3 top-0 h-[2px] bg-brand-600"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="relative">
                      <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                      {badge ? (
                        <span
                          className="tnum absolute -right-2.5 -top-1.5 min-w-[15px] rounded-[2px] bg-ios-red px-1 text-center text-[9px] font-bold leading-[14px] text-white"
                          aria-hidden="true"
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-caption2 font-medium leading-none tracking-[0.01em]">
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
