import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  CalendarClock,
  PackageCheck,
  ScanLine,
  Search,
  Settings2,
  TrendingDown,
  Truck,
  Wrench,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Gauge, Pill } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import { useAuth } from '@/lib/AuthContext'
import Sparkline from '@/components/charts/Sparkline'
import InstallPrompt from '@/components/InstallPrompt'
import Walkthrough from '@/components/Walkthrough'
import { useData } from '@/hooks/useData'
import {
  getPractice,
  getSpendHistory,
  isDemo,
  listAlerts,
  listAssets,
  listInventory,
  listOrders,
} from '@/lib/repository'
import { coverShort, money, moneyRound, qty } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * One cell of the KPI grid. The grid itself draws the dividers, so cells are
 * just content — micro-label, the number, one line of context.
 */
function Kpi({ label, icon: Icon, value, caption, tone = 'label', to }) {
  const tones = {
    label: 'text-label',
    critical: 'text-ios-red',
    warning: 'text-ios-orange',
    good: 'text-ios-green',
    brand: 'text-brand-700 dark:text-brand-400',
  }

  const inner = (
    <>
      <span className="flex items-center gap-1.5 text-footnote text-label-3">
        {Icon ? <Icon size={13} strokeWidth={2.1} aria-hidden="true" /> : null}
        {label}
      </span>
      <span className={cn('tnum mt-1 block text-title1 font-semibold leading-tight', tones[tone])}>
        {value}
      </span>
      {caption ? (
        <span className="mt-0.5 block truncate text-footnote text-label-3">{caption}</span>
      ) : null}
    </>
  )

  return to ? (
    <Link to={to} className="press block min-w-0 bg-surface p-4">
      {inner}
    </Link>
  ) : (
    <div className="min-w-0 bg-surface p-4">{inner}</div>
  )
}

const TABLE_COLS = 'grid-cols-[minmax(0,1fr)_2.75rem_3.25rem]'

export default function Dashboard() {
  const { previewing, signOut } = useAuth()
  const { data: practice } = useData(() => getPractice(), [])
  const { data: inventory } = useData(() => listInventory(), [])
  const { data: alerts } = useData(() => listAlerts(), [])
  const { data: orders } = useData(() => listOrders(), [])
  const { data: assets } = useData(() => listAssets(), [])
  const { data: spend } = useData(() => getSpendHistory(), [])

  const stats = useMemo(() => {
    const rows = inventory ?? []
    const out = rows.filter((r) => r.stockStatus === 'out')
    const low = rows.filter((r) => r.stockStatus === 'low')
    const attention = rows.filter((r) => ['out', 'low', 'below_par'].includes(r.stockStatus))

    // What restoring everything to par costs at today's best orderable prices.
    const restoreCost = attention.reduce(
      (sum, r) => sum + Math.max(r.reorderQty, r.parLevel - r.onHand) * (r.bestUnitPrice ?? 0),
      0,
    )

    const potentialSavings = attention.reduce((sum, r) => {
      if (r.maxUnitPrice == null || r.bestUnitPrice == null) return sum
      const units = Math.max(r.reorderQty, r.parLevel - r.onHand)
      return sum + (r.maxUnitPrice - r.bestUnitPrice) * units
    }, 0)

    const inTransit = (orders ?? []).filter((o) =>
      ['submitted', 'confirmed', 'partial'].includes(o.status),
    )
    const savedYtd = (orders ?? []).reduce((sum, o) => sum + (o.savings ?? 0), 0)

    const soonest = rows
      .filter((r) => r.daysOfCover != null && r.onHand > 0)
      .sort((a, b) => a.daysOfCover - b.daysOfCover)[0]

    const supplierCount = rows.reduce((max, r) => Math.max(max, r.offerCount ?? 0), 0)

    return { out, low, attention, restoreCost, potentialSavings, inTransit, savedYtd, soonest, supplierCount }
  }, [inventory, orders])

  const serviceDue = (assets ?? [])
    .filter((a) => Math.round((new Date(a.nextServiceAt) - new Date()) / 86400000) <= 30)
    .sort((a, b) => new Date(a.nextServiceAt) - new Date(b.nextServiceAt))

  const criticalCount = (alerts ?? []).filter((a) => a.severity === 'critical').length
  const topAttention = stats.attention.slice(0, 6)
  const saved12 = (spend ?? []).reduce((s, m) => s + m.saved, 0)

  return (
    <Screen
      logo
      title="Today"
      subtitle={practice?.name}
      trailing={
        <>
          <Link
            to="/search"
            aria-label="Search"
            className="flex h-8 w-8 items-center justify-center rounded-[3px] text-label-2 transition-colors hover:bg-surface-2 hover:text-label"
          >
            <Search size={17} strokeWidth={2} />
          </Link>
          <Link
            to="/alerts"
            aria-label={`Alerts${criticalCount ? `, ${criticalCount} critical` : ''}`}
            className="relative flex h-8 w-8 items-center justify-center rounded-[3px] text-label-2 transition-colors hover:bg-surface-2 hover:text-label"
          >
            <Bell size={17} strokeWidth={2} />
            {criticalCount ? (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-ios-red" />
            ) : null}
          </Link>
          <Link
            to="/settings"
            aria-label="Practice settings"
            className="flex h-8 w-8 items-center justify-center rounded-[3px] text-label-2 transition-colors hover:bg-surface-2 hover:text-label"
          >
            <Settings2 size={17} strokeWidth={2} />
          </Link>
        </>
      }
    >
      <Walkthrough />
      <InstallPrompt />

      <p className="section-label pt-3">{format(new Date(), 'EEEE, MMMM d')}</p>

      {/* The one thing that stops clinical work today */}
      {stats.out.length > 0 ? (
        <Link
          to="/orders/new"
          className="panel press mb-2 flex items-center gap-2.5 border-l-2 border-l-ios-red p-3"
        >
          <AlertTriangle size={16} strokeWidth={2.1} className="shrink-0 text-ios-red" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-subhead font-semibold text-label">
              {stats.out.length} {stats.out.length === 1 ? 'item' : 'items'} out of stock
            </span>
            <span className="block truncate text-caption text-label-3">
              {stats.out.slice(0, 2).map((r) => r.productName).join(', ')}
              {stats.out.length > 2 ? ` +${stats.out.length - 2} more` : ''}
            </span>
          </span>
          <ArrowRight size={14} className="shrink-0 text-label-3" aria-hidden="true" />
        </Link>
      ) : null}

      {/* Instrument panel — one bordered grid, not four floating cards */}
      <div className="panel grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
        <Kpi
          label="Needs action"
          icon={PackageCheck}
          value={stats.attention.length}
          caption={stats.low.length ? `${stats.low.length} at reorder point` : 'All above par'}
          tone={stats.out.length ? 'critical' : stats.attention.length ? 'warning' : 'good'}
          to="/inventory?filter=attention"
        />
        <Kpi
          label="Saved"
          icon={TrendingDown}
          value={money(stats.savedYtd)}
          caption="vs list price, all orders"
          tone="brand"
          to="/orders"
        />
        <Kpi
          label="In transit"
          icon={Truck}
          value={stats.inTransit.length}
          caption={
            stats.inTransit.length ? `Next: ${stats.inTransit[0].supplierName}` : 'Nothing on the way'
          }
          to="/orders"
        />
        <Kpi
          label="Soonest out"
          icon={CalendarClock}
          value={stats.soonest?.daysOfCover != null ? `${stats.soonest.daysOfCover}d` : '—'}
          caption={stats.soonest ? stats.soonest.productName.split(',')[0] : 'No burn data yet'}
          tone={
            stats.soonest?.daysOfCover != null && stats.soonest.daysOfCover <= 7
              ? 'critical'
              : 'label'
          }
          to="/inventory"
        />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-x-4">
      <div className="min-w-0">
      {/* Needs attention — a table, because this is a working list */}
      {topAttention.length > 0 ? (
        <section className="mt-1">
          <div className="flex items-baseline justify-between">
            <h3 className="section-label">Needs attention</h3>
            <Link
              to="/inventory?filter=attention"
              className="pb-1.5 pt-5 text-footnote font-medium text-brand-700 dark:text-brand-400"
            >
              View all {stats.attention.length}
            </Link>
          </div>

          <div className="panel">
            {/* Column headers in sentence case and no fill — a grouped list
                that happens to have columns, not a data table. */}
            <div
              className={cn(
                'grid items-center gap-2 px-4 pb-1 pt-2.5',
                'text-caption text-label-3',
                TABLE_COLS,
              )}
            >
              <span>Item</span>
              <span className="text-right">Cover</span>
              <span className="text-right">Par</span>
            </div>

            {topAttention.map((item, i) => (
              <Link
                key={item.id}
                to={`/inventory/${item.id}`}
                className={cn(
                  'press grid items-center gap-2 px-3 py-2',
                  TABLE_COLS,
                  i > 0 && 'border-t border-line',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-subhead font-medium text-label">
                    {item.productName}
                  </span>
                  <span className="block truncate text-caption text-label-3">
                    {qty(item.onHand)} of {qty(item.parLevel)} {item.unit}
                  </span>
                </span>
                <span
                  className={cn(
                    'tnum text-right text-subhead font-semibold',
                    item.stockStatus === 'out' ? 'text-ios-red' : 'text-ios-orange',
                  )}
                >
                  {item.stockStatus === 'out' ? 'Out' : coverShort(item.daysOfCover)}
                </span>
                <span className="flex justify-end">
                  <Gauge
                    value={item.pctOfPar ?? 0}
                    size={44}
                    stroke={4}
                    tone={
                      item.stockStatus === 'out'
                        ? 'critical'
                        : item.stockStatus === 'low'
                          ? 'warning'
                          : 'brand'
                    }
                  />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      </div>
      <div className="min-w-0">
      {/* The purchase decision, priced */}
      {stats.attention.length > 0 ? (
        <div className="panel mt-2">
          <div className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-headline">Restock to par</p>
              <p className="mt-0.5 text-caption text-label-3">
                {stats.attention.length} items · best price across {stats.supplierCount} suppliers
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tnum text-title3 font-semibold">{money(stats.restoreCost)}</p>
              {stats.potentialSavings > 0 ? (
                <p className="tnum text-caption font-medium text-ios-green">
                  saves {money(stats.potentialSavings)}
                </p>
              ) : null}
            </div>
          </div>
          <div className="border-t border-line p-2">
            <Button to="/orders/new" className="w-full">
              Build the order
            </Button>
          </div>
        </div>
      ) : null}

      {/* Savings trend. Points at the value screen rather than Insights: this
          number is the answer to "is Dentin worth paying for", and that screen
          is the one that shows it against what the practice actually pays. */}
      {spend?.length ? (
        <Link to="/insights/value" className="panel press mt-2 flex items-center gap-3 p-4">
          <span className="min-w-0 flex-1">
            <span className="block text-footnote text-label-3">Captured · 12 months</span>
            <span className="tnum mt-1 block text-title1 font-semibold">
              {moneyRound(saved12)}
            </span>
          </span>
          <Sparkline values={spend.map((m) => m.saved)} width={88} height={30} />
          <ArrowRight size={14} className="shrink-0 text-label-3" aria-hidden="true" />
        </Link>
      ) : null}

      </div>
      </div>

      {/* Compliance */}
      {serviceDue.length > 0 ? (
        <section className="mt-1">
          <h3 className="section-label">Equipment &amp; compliance</h3>
          <div className="panel">
            {serviceDue.map((asset, i) => {
              const days = Math.round((new Date(asset.nextServiceAt) - new Date()) / 86400000)
              return (
                <Link
                  key={asset.id}
                  to="/equipment"
                  className={cn(
                    'press flex items-center gap-2.5 px-3 py-2',
                    i > 0 && 'border-t border-line',
                  )}
                >
                  <Wrench
                    size={15}
                    strokeWidth={1.9}
                    className={days < 0 ? 'shrink-0 text-ios-red' : 'shrink-0 text-label-3'}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-subhead font-medium text-label">
                      {asset.name}
                    </span>
                    <span className="ident block truncate text-label-3">{asset.serialNumber}</span>
                  </span>
                  <Pill tone={days < 0 ? 'critical' : 'warning'}>
                    {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                  </Pill>
                </Link>
              )
            })}
          </div>
          <p className="px-0.5 pt-1.5 text-footnote leading-snug text-label-3">
            Service records are the first thing a board inspection asks for.
          </p>
        </section>
      ) : null}

      {/* Quick actions — monochrome, tools not toys */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { to: '/scan', Icon: ScanLine, label: 'Scan' },
          { to: '/inventory', Icon: Boxes, label: 'Count' },
          { to: '/equipment', Icon: Wrench, label: 'Equipment' },
        ].map(({ to, Icon, label }) => (
          <Link key={to} to={to} className="panel press flex flex-col items-center gap-1.5 py-3">
            <Icon size={17} strokeWidth={1.9} className="text-label-2" aria-hidden="true" />
            <span className="text-caption font-medium text-label-2">{label}</span>
          </Link>
        ))}
      </div>

      {isDemo ? (
        previewing ? (
          <div className="mt-5 rounded-card bg-surface shadow-card p-3.5 text-center">
            <p className="text-subhead font-semibold text-label">
              This is a demo practice
            </p>
            <p className="mt-1 text-footnote text-label-3">
              Everything here is sample data — the inventory, the orders, the prices. Nothing you
              do is saved, and no account or card is involved.
            </p>
            <Button className="mt-3" size="md" onClick={signOut}>
              Leave the demo and set up my practice
            </Button>
          </div>
        ) : (
          <p className="px-1 pb-2 pt-5 text-center text-caption text-label-3">
            Demo practice — connect Supabase to run on live data.
          </p>
        )
      ) : null}
    </Screen>
  )
}
