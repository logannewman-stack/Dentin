import { NavLink, useLocation } from 'react-router-dom'
import {
  Activity,
  Boxes,
  Building2,
  CalendarClock,
  ChartNoAxesColumn,
  FileSpreadsheet,
  LayoutGrid,
  ScanLine,
  Settings2,
  ShoppingCart,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react'
import { useData } from '@/hooks/useData'
import { getCurrentUser, isDemo } from '@/lib/repository'
import { cn } from '@/lib/utils'

const PRIMARY = [
  { to: '/', label: 'Today', Icon: LayoutGrid, end: true },
  { to: '/inventory', label: 'Inventory', Icon: Boxes },
  { to: '/scan', label: 'Scan', Icon: ScanLine },
  { to: '/orders', label: 'Orders', Icon: ShoppingCart },
  { to: '/insights', label: 'Insights', Icon: ChartNoAxesColumn },
]

const PURCHASING = [
  { to: '/vendors', label: 'Vendors', Icon: Building2, end: true },
  { to: '/vendors/compare', label: 'Competitive pricing', Icon: Sparkles },
  { to: '/vendors/import', label: 'Contract pricing', Icon: FileSpreadsheet },
]

const PRACTICE = [
  { to: '/procedures', label: 'Procedures', Icon: Activity },
  { to: '/equipment', label: 'Equipment', Icon: Wrench },
  { to: '/expiry', label: 'Lot expiry', Icon: CalendarClock },
  { to: '/team', label: 'Team', Icon: Users },
  { to: '/settings', label: 'Settings', Icon: Settings2 },
]

function NavItem({ to, label, Icon, end, badge }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-[3px] px-2.5 py-1.5 text-subhead font-medium transition-colors duration-100',
          isActive
            ? 'bg-brand-600/10 text-brand-700 dark:text-brand-400'
            : 'text-label-2 hover:bg-surface-2 hover:text-label',
        )
      }
    >
      <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className="tnum rounded-[2px] bg-ios-red px-1 text-[10px] font-bold leading-4 text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </NavLink>
  )
}

/**
 * Desktop navigation.
 *
 * On a wide viewport the bottom tab bar becomes a left sidebar — the shape
 * desktop software actually has — and the secondary surfaces that mobile
 * tucks behind Settings get first-class entries. Hidden below `lg`, where the
 * tab bar takes over; both react to viewport, so a resized window or an iPad
 * in landscape lands in the right layout without user-agent guessing.
 */
export default function SideNav({ badges = {} }) {
  const { pathname } = useLocation()
  const { data: user } = useData(() => getCurrentUser(), [])

  const HIDDEN = ['/scan', '/onboarding', '/welcome']
  if (HIDDEN.some((p) => pathname.startsWith(p))) return null

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-line bg-surface lg:flex"
    >
      <div className="flex h-navbar shrink-0 items-center gap-2 border-b border-line px-3">
        <img src="/icon.svg" alt="" className="h-[20px] w-[20px] rounded-[4px]" aria-hidden="true" />
        <span className="text-[15px] font-semibold tracking-[-0.01em]">Dentin</span>
      </div>

      <div className="scroll-area flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-0.5">
          {PRIMARY.map((item) => (
            <NavItem key={item.to} {...item} badge={badges[item.to]} />
          ))}
        </div>

        <p className="section-label px-2.5">Purchasing</p>
        <div className="flex flex-col gap-0.5">
          {PURCHASING.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </div>

        <p className="section-label px-2.5">Practice</p>
        <div className="flex flex-col gap-0.5">
          {PRACTICE.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </div>
      </div>

      <div className="border-t border-line p-2">
        <NavLink
          to="/account"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-[3px] px-2 py-1.5 transition-colors duration-100',
              isActive ? 'bg-brand-600/10' : 'hover:bg-surface-2',
            )
          }
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-brand-600 text-caption2 font-bold text-white">
            {user?.initials ?? '·'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-subhead font-medium text-label">
              {user?.name ?? 'Account'}
            </span>
            <span className="block truncate text-caption text-label-3">
              {user?.role ? user.role[0].toUpperCase() + user.role.slice(1) : 'Account settings'}
              {isDemo ? ' · Demo' : ''}
            </span>
          </span>
        </NavLink>
      </div>
    </nav>
  )
}
