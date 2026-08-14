import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  PackageCheck,
  ScanLine,
  Settings2,
  TrendingDown,
  Truck,
  Wrench,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, RowIcon, Section } from '@/components/ui/List'
import { Gauge, Pill } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sparkline from '@/components/charts/Sparkline'
import ProductTile from '@/components/ProductTile'
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
import { coverShort, money, qty } from '@/lib/format'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function StatCard({ label, value, caption, tone = 'label', icon: Icon, to }) {
  const tones = {
    label: 'text-label',
    critical: 'text-ios-red',
    warning: 'text-ios-orange',
    good: 'text-ios-green',
    brand: 'text-brand-600 dark:text-brand-400',
  }

  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-label-3">
        {Icon ? <Icon size={13} strokeWidth={2.2} aria-hidden="true" /> : null}
        <span className="text-caption font-medium uppercase tracking-[0.4px]">{label}</span>
      </div>
      <p className={`tnum mt-1.5 text-title2 font-bold ${tones[tone]}`}>{value}</p>
      {caption ? <p className="mt-0.5 text-caption text-label-3">{caption}</p> : null}
    </>
  )

  return to ? (
    <Link to={to} className="press flex-1 rounded-card border border-line bg-surface p-3">
      {inner}
    </Link>
  ) : (
    <div className="flex-1 rounded-card border border-line bg-surface p-3">{inner}</div>
  )
}

export default function Dashboard() {
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
    const attention = rows.filter((r) =>
      ['out', 'low', 'below_par'].includes(r.stockStatus),
    )

    // What restoring everything to par would cost at today's best prices.
    const restoreCost = attention.reduce(
      (sum, r) => sum + Math.max(r.reorderQty, r.parLevel - r.onHand) * (r.bestUnitPrice ?? 0),
      0,
    )

    // What buying at the best price saves against the priciest supplier.
    const potentialSavings = attention.reduce((sum, r) => {
      if (r.maxUnitPrice == null || r.bestUnitPrice == null) return sum
      const units = Math.max(r.reorderQty, r.parLevel - r.onHand)
      return sum + (r.maxUnitPrice - r.bestUnitPrice) * units
    }, 0)

    const inTransit = (orders ?? []).filter((o) =>
      ['submitted', 'confirmed', 'partial'].includes(o.status),
    )

    const savedYtd = (orders ?? []).reduce((sum, o) => sum + (o.savings ?? 0), 0)

    // The soonest stock-out among items actually being consumed.
    const soonest = rows
      .filter((r) => r.daysOfCover != null && r.onHand > 0)
      .sort((a, b) => a.daysOfCover - b.daysOfCover)[0]

    // How many suppliers the practice is actually being quoted by.
    const supplierCount = rows.reduce((max, r) => Math.max(max, r.offerCount ?? 0), 0)

    return {
      out,
      low,
      attention,
      restoreCost,
      potentialSavings,
      inTransit,
      savedYtd,
      soonest,
      supplierCount,
    }
  }, [inventory, orders])

  const serviceDue = (assets ?? [])
    .filter((a) => {
      const days = Math.round((new Date(a.nextServiceAt) - new Date()) / 86400000)
      return days <= 30
    })
    .sort((a, b) => new Date(a.nextServiceAt) - new Date(b.nextServiceAt))

  const criticalCount = (alerts ?? []).filter((a) => a.severity === 'critical').length
  const topAttention = stats.attention.slice(0, 5)

  return (
    <Screen
      title="Today"
      subtitle={practice?.name}
      trailing={
        <>
          <Link
            to="/alerts"
            aria-label={`Alerts${criticalCount ? `, ${criticalCount} critical` : ''}`}
            className="press relative flex h-9 w-9 items-center justify-center text-brand-600 dark:text-brand-400"
          >
            <Bell size={21} strokeWidth={2} />
            {criticalCount ? (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-ios-red ring-2 ring-[rgb(var(--nav-material))]" />
            ) : null}
          </Link>
          <Link
            to="/settings"
            aria-label="Practice settings"
            className="press flex h-9 w-9 items-center justify-center text-brand-600 dark:text-brand-400"
          >
            <Settings2 size={21} strokeWidth={2} />
          </Link>
        </>
      }
    >
      <p className="pb-3 pt-1 text-subhead text-label-3">
        {greeting()} — here is where the practice stands.
      </p>

      {/* The one thing that stops clinical work today */}
      {stats.out.length > 0 ? (
        <Link
          to="/orders/new"
          className="press mb-3 flex items-center gap-3 rounded-card bg-ios-red p-4 text-white"
        >
          <AlertTriangle size={22} strokeWidth={2.2} className="shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-headline font-semibold">
              {stats.out.length} {stats.out.length === 1 ? 'item is' : 'items are'} out of stock
            </p>
            <p className="truncate text-footnote text-white/85">
              {stats.out
                .slice(0, 2)
                .map((r) => r.productName)
                .join(', ')}
              {stats.out.length > 2 ? ` +${stats.out.length - 2} more` : ''}
            </p>
          </div>
          <ArrowRight size={18} className="shrink-0" aria-hidden="true" />
        </Link>
      ) : null}

      {/* Headline numbers */}
      <div className="flex gap-2.5">
        <StatCard
          label="Needs action"
          value={stats.attention.length}
          caption={stats.low.length ? `${stats.low.length} at reorder point` : 'All above par'}
          tone={stats.out.length ? 'critical' : stats.attention.length ? 'warning' : 'good'}
          icon={PackageCheck}
          to="/inventory?filter=attention"
        />
        <StatCard
          label="Saved"
          value={money(stats.savedYtd)}
          caption="vs. list price, to date"
          tone="brand"
          icon={TrendingDown}
          to="/orders"
        />
      </div>

      <div className="mt-2.5 flex gap-2.5">
        <StatCard
          label="In transit"
          value={stats.inTransit.length}
          caption={
            stats.inTransit.length
              ? `Next: ${stats.inTransit[0].supplierName}`
              : 'Nothing on the way'
          }
          icon={Truck}
          to="/orders"
        />
        <StatCard
          label="Soonest out"
          value={stats.soonest?.daysOfCover != null ? `${stats.soonest.daysOfCover}d` : '—'}
          caption={stats.soonest ? stats.soonest.productName.split(',')[0] : 'No burn data yet'}
          tone={
            stats.soonest?.daysOfCover != null && stats.soonest.daysOfCover <= 7
              ? 'critical'
              : 'label'
          }
          icon={CalendarClock}
          to="/inventory"
        />
      </div>

      {/* Restock basket */}
      {stats.attention.length > 0 ? (
        <div className="mt-3 rounded-card border border-line bg-surface p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-headline font-semibold">Restock to par</h3>
              <p className="mt-0.5 text-footnote text-label-3">
                {stats.attention.length} items · best price across {stats.supplierCount} suppliers
              </p>
            </div>
            <div className="text-right">
              <p className="tnum text-title3 font-bold">{money(stats.restoreCost)}</p>
              {stats.potentialSavings > 0 ? (
                <p className="tnum text-caption font-semibold text-ios-green">
                  saves {money(stats.potentialSavings)}
                </p>
              ) : null}
            </div>
          </div>
          <Button to="/orders/new" className="mt-3.5 w-full" size="md">
            Build the order
          </Button>
        </div>
      ) : null}

      {/* Needs attention */}
      {topAttention.length > 0 ? (
        <Section
          title="Needs attention"
          action={
            <Link
              to="/inventory?filter=attention"
              className="press text-subhead font-medium text-brand-600 dark:text-brand-400"
            >
              See all
            </Link>
          }
        >
          {topAttention.map((item) => (
            <Row
              key={item.id}
              to={`/inventory/${item.id}`}
              leading={<ProductTile product={item} size={38} imageUrl={item.imageUrl} />}
              title={item.productName}
              subtitle={`${item.brand} · ${qty(item.onHand)} of ${qty(item.parLevel)} ${
                item.unit
              }`}
              trailing={
                <div className="flex items-center gap-2.5">
                  <span className="tnum w-8 text-right text-caption text-label-3">
                    {coverShort(item.daysOfCover)}
                  </span>
                  <Gauge
                    value={item.pctOfPar ?? 0}
                    size={30}
                    stroke={3.5}
                    tone={
                      item.stockStatus === 'out'
                        ? 'critical'
                        : item.stockStatus === 'low'
                          ? 'warning'
                          : 'brand'
                    }
                  />
                </div>
              }
            />
          ))}
        </Section>
      ) : null}

      {/* Savings trend — the detail lives on Insights; this is the headline */}
      {spend?.length ? (
        <Section title="Spend & savings">
          <Link to="/insights" className="press block p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="tnum text-title2 font-bold">
                  {money(spend.reduce((s, m) => s + m.saved, 0))}
                </p>
                <p className="text-footnote text-label-3">
                  saved over {spend.length} months
                </p>
                <Pill tone="good" icon={TrendingDown} className="mt-2">
                  {Math.round(
                    (spend.reduce((s, m) => s + m.saved, 0) /
                      spend.reduce((s, m) => s + m.spend + m.saved, 0)) *
                      100,
                  )}
                  % below list
                </Pill>
              </div>
              <Sparkline values={spend.map((m) => m.saved)} width={96} height={44} />
            </div>
            <p className="mt-3 flex items-center gap-1 text-subhead font-medium text-brand-600 dark:text-brand-400">
              See the full breakdown
              <ArrowRight size={14} strokeWidth={2.4} aria-hidden="true" />
            </p>
          </Link>
        </Section>
      ) : null}

      {/* Compliance / equipment */}
      {serviceDue.length > 0 ? (
        <Section
          title="Equipment & compliance"
          footer="Service records and spore-test logs are what a state board inspection asks for first."
        >
          {serviceDue.map((asset) => {
            const days = Math.round((new Date(asset.nextServiceAt) - new Date()) / 86400000)
            return (
              <Row
                key={asset.id}
                to="/equipment"
                leading={
                  <RowIcon tint={days < 0 ? 'red' : 'orange'}>
                    <Wrench size={16} strokeWidth={2.2} />
                  </RowIcon>
                }
                title={asset.name}
                subtitle={`${asset.manufacturer} · ${asset.serialNumber}`}
                trailing={
                  <Pill tone={days < 0 ? 'critical' : 'warning'}>
                    {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                  </Pill>
                }
              />
            )
          })}
        </Section>
      ) : null}

      {/* Quick actions */}
      <Section title="Quick actions">
        <Row
          to="/scan"
          leading={
            <RowIcon tint="brand">
              <ScanLine size={16} strokeWidth={2.2} />
            </RowIcon>
          }
          title="Scan a barcode"
          subtitle="Receive a delivery or draw stock down"
        />
        <Row
          to="/inventory"
          leading={
            <RowIcon tint="blue">
              <PackageCheck size={16} strokeWidth={2.2} />
            </RowIcon>
          }
          title="Count inventory"
          subtitle="Reconcile what is actually on the shelf"
        />
        <Row
          to="/equipment"
          leading={
            <RowIcon tint="gray">
              <Wrench size={16} strokeWidth={2.2} />
            </RowIcon>
          }
          title="Equipment register"
          subtitle="Serials, warranties and service history"
        />
      </Section>

      {isDemo ? (
        <p className="px-1 pb-2 pt-6 text-center text-caption text-label-3">
          Demo practice — connect Supabase to run on live data.
        </p>
      ) : null}
    </Screen>
  )
}
