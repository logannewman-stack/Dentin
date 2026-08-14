import { NavLink, useLocation } from 'react-router-dom'
import { Boxes, LayoutGrid, ScanLine, ShoppingCart, Settings2 } from 'lucide-react'
import { cn, haptic } from '@/lib/utils'

const TABS = [
  { to: '/', label: 'Today', Icon: LayoutGrid, end: true },
  { to: '/inventory', label: 'Inventory', Icon: Boxes },
  { to: '/scan', label: 'Scan', Icon: ScanLine, prominent: true },
  { to: '/orders', label: 'Orders', Icon: ShoppingCart },
  { to: '/settings', label: 'Practice', Icon: Settings2 },
]

export default function TabBar({ badges = {} }) {
  const { pathname } = useLocation()

  // The scanner is a full-bleed camera surface; chrome would fight it.
  if (pathname.startsWith('/scan')) return null

  return (
    <nav
      className="material-chrome fixed inset-x-0 bottom-0 z-40 border-t border-separator/50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <ul className="flex h-tabbar items-stretch">
        {TABS.map(({ to, label, Icon, end, prominent }) => {
          const badge = badges[to]
          return (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                onClick={() => haptic(6)}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-full flex-col items-center justify-center gap-[2px] press',
                    isActive ? 'text-brand-600 dark:text-brand-400' : 'text-label-3',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <Icon
                        size={prominent ? 26 : 24}
                        strokeWidth={isActive ? 2.4 : 1.9}
                        aria-hidden="true"
                      />
                      {badge ? (
                        <span
                          className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-ios-red px-1 text-center text-[10px] font-semibold leading-4 text-white"
                          aria-hidden="true"
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[10px] font-medium leading-none tracking-[0.06px]">
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
