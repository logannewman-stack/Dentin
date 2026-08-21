import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, Info, TrendingDown } from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, Section } from '@/components/ui/List'
import { Pill, SegmentedControl } from '@/components/ui/Controls'
import StackedColumns from '@/components/charts/StackedColumns'
import BarList from '@/components/charts/BarList'
import HealthMeter from '@/components/charts/HealthMeter'
import Sparkline from '@/components/charts/Sparkline'
import ProductTile from '@/components/ProductTile'
import { useData } from '@/hooks/useData'
import { getInsights, getSpendBenchmark } from '@/lib/repository'
import { negotiationLeverage } from '@/lib/benchmarks'
import { coverShort, money, moneyRound, percent } from '@/lib/format'
import { cn } from '@/lib/utils'

const RANGES = [
  { value: 3, label: '3M' },
  { value: 6, label: '6M' },
  { value: 12, label: '12M' },
]

/** Compact money for axis ticks, where four digits will not fit. */
function compactMoney(v) {
  if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
  return `$${Math.round(v)}`
}

function Card({ title, subtitle, children, footer, action }) {
  return (
    <section className="mt-3 rounded-card bg-surface shadow-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-headline font-semibold">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-footnote text-label-3">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
      {footer ? (
        <p className="mt-3 border-t border-separator/50 pt-3 text-footnote text-label-3">{footer}</p>
      ) : null}
    </section>
  )
}

export default function Insights() {
  const [months, setMonths] = useState(12)
  const { data, loading } = useData(() => getInsights(months), [months])
  const { data: benchmark } = useData(() => getSpendBenchmark(), [])

  if (loading || !data) {
    return (
      <Screen title="Insights">
        <div className="space-y-3 pt-4">
          <div className="skeleton h-32 rounded-card" />
          <div className="skeleton h-56 rounded-card" />
          <div className="skeleton h-48 rounded-card" />
        </div>
      </Screen>
    )
  }

  const rangeLabel = months === 12 ? 'the last 12 months' : `the last ${months} months`
  // The concentrated slice of spend worth negotiating on.
  const leverage = negotiationLeverage(
    data.categories.map((c) => ({ label: c.label, value: c.value, spend: c.value })),
  )

  return (
    <Screen title="Insights" subtitle={`${data.trackedCount} items tracked`}>
      {/* Range filter — one row above the charts it governs */}
      <div className="pb-1 pt-2">
        <SegmentedControl value={months} onChange={setMonths} options={RANGES} />
      </div>

      {/* Hero figure — exactly one per view */}
      <div className="mt-2 rounded-card bg-surface shadow-card p-4">
        <p className="text-footnote text-label-3">
          Saved over {rangeLabel}
        </p>
        <div className="mt-1.5 flex items-end justify-between gap-4">
          <p className="text-[44px] font-bold leading-[48px] tracking-tight text-label">
            {moneyRound(data.totalSaved)}
          </p>
          <Sparkline values={data.history.map((h) => h.saved)} width={76} height={30} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill tone="good" icon={TrendingDown}>
            {percent(data.savedPct)} below list
          </Pill>
          <span className="text-footnote text-label-3">
            on {moneyRound(data.totalSpend)} of purchasing
          </span>
        </div>
      </div>

      {/* This screen shows where the money went. The renewal question — was
          Dentin worth what it costs — is a different question with a different
          answer, and it gets its own screen rather than a corner of this one. */}
      <Link
        to="/insights/value"
        className="panel press mt-2 flex items-center gap-3 p-3"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-subhead font-semibold">Is Dentin paying for itself</span>
          <span className="mt-0.5 block text-footnote text-label-3">
            Money found against money captured, and what you have paid
          </span>
        </span>
        <ArrowRight size={14} className="shrink-0 text-label-3" aria-hidden="true" />
      </Link>

      {/* Supply spend against collections — the benchmark the industry runs on */}
      {benchmark?.band ? (
        <Card
          title="Supply spend vs. collections"
          subtitle={`Trailing ${benchmark.months} months · ${benchmark.band.label}`}
          footer={`${benchmark.band.note} Clinical supplies only — lab fees, equipment and office supplies are excluded, and folding those in is the usual reason a practice concludes it is overspending when it is not.`}
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <p
                className={cn(
                  'tnum text-large font-bold leading-none',
                  benchmark.status === 'over'
                    ? 'text-ios-orange'
                    : benchmark.status === 'under'
                      ? 'text-ios-green'
                      : 'text-label',
                )}
              >
                {benchmark.pct.toFixed(1)}%
              </p>
              <p className="mt-1 text-footnote text-label-3">
                {moneyRound(benchmark.supplySpend)} on {moneyRound(benchmark.collections)}
              </p>
            </div>
            <Pill
              tone={
                benchmark.status === 'over'
                  ? 'warning'
                  : benchmark.status === 'under'
                    ? 'good'
                    : 'brand'
              }
            >
              {benchmark.status === 'over'
                ? 'Above band'
                : benchmark.status === 'under'
                  ? 'Below band'
                  : 'On target'}
            </Pill>
          </div>

          {/* The target band, drawn against a 0–20% scale */}
          <div className="mt-4">
            <div className="relative h-2 w-full rounded-[3px] bg-fill/12">
              <span
                className="absolute inset-y-0 rounded-[3px] bg-ios-green/35"
                style={{
                  left: `${(benchmark.band.low / 20) * 100}%`,
                  width: `${((benchmark.band.high - benchmark.band.low) / 20) * 100}%`,
                }}
                aria-hidden="true"
              />
              <span
                className="absolute top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-label"
                style={{ left: `${Math.min(98, (benchmark.pct / 20) * 100)}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="mt-1.5 flex justify-between text-caption text-label-3">
              <span>0%</span>
              <span className="tnum">
                target {benchmark.band.low}–{benchmark.band.high}%
              </span>
              <span>20%</span>
            </div>
          </div>

          {benchmark.overBy > 0 ? (
            <p className="mt-3 border-t border-separator/50 pt-3 text-footnote text-label-2">
              Running <strong>{moneyRound(benchmark.overBy)}</strong> above the top of the band
              over {benchmark.months} months — about{' '}
              <strong>{moneyRound(benchmark.annualisedOverBy)}</strong> a year if it holds.
            </p>
          ) : null}

          {benchmark.usesCostPerProcedure ? (
            <p className="mt-3 text-footnote text-label-3">
              For this specialty, watch cost per procedure alongside this — high case fees can
              hide per-case material inflation that a percentage will not show.
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* Cost per procedure, straight off the completed-procedure feed */}
      {benchmark?.procedureCount ? (
        <Link
          to="/procedures"
          className="press mt-3 flex items-center justify-between rounded-card bg-surface shadow-card p-3"
        >
          <span className="min-w-0">
            <span className="block text-footnote text-label-3">
              Cost per procedure
            </span>
            <span className="tnum mt-1 block text-title2 font-bold">
              {money(benchmark.costPerProcedure)}
            </span>
            <span className="mt-0.5 block text-footnote text-label-3">
              across {benchmark.procedureCount} procedures in 30 days
            </span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-label-3" aria-hidden="true" />
        </Link>
      ) : null}

      {/* Spend vs list price */}
      <Card
        title="What you paid vs. list"
        subtitle="Each column is what the basket would have cost at the priciest supplier"
        footer="Savings are measured per line against the highest in-stock offer at the time of order, not against MSRP."
      >
        <StackedColumns
          data={data.history.map((h) => ({ label: h.month, paid: h.spend, saved: h.saved }))}
          series={[
            { key: 'paid', label: 'Paid', slot: 1 },
            { key: 'saved', label: 'Saved', slot: 2 },
          ]}
          formatValue={compactMoney}
          height={172}
        />
      </Card>

      {/* Stock health */}
      <Card
        title="Stock health"
        subtitle={`Across ${data.trackedCount} tracked items right now`}
        action={
          <Link
            to="/inventory?filter=attention"
            className="press shrink-0 text-subhead font-medium text-brand-600 dark:text-brand-400"
          >
            Review
          </Link>
        }
      >
        <HealthMeter counts={data.health} />
      </Card>

      {/* Category spend */}
      <Card
        title="Where the money goes"
        subtitle={`Spend by category, ${rangeLabel}`}
      >
        <BarList
          items={data.categories.slice(0, 8)}
          formatValue={moneyRound}
          emptyLabel="No spend recorded yet"
        />
      </Card>

      {/* Supplier mix */}
      <Card
        title="Supplier mix"
        subtitle="Share of spend by supplier"
        footer="Concentration is not automatically bad — volume with one supplier can clear free-shipping thresholds and simplify receiving."
      >
        <BarList
          items={data.suppliers}
          formatValue={moneyRound}
          emptyLabel="No orders placed yet"
        />
      </Card>

      {/* Top items */}
      <Card title="Highest-spend items" subtitle={`Top SKUs, ${rangeLabel}`}>
        <BarList items={data.items} formatValue={moneyRound} emptyLabel="No spend recorded yet" />
      </Card>

      {/* Where negotiation actually pays */}
      {leverage.items.length ? (
        <Card
          title="Negotiation leverage"
          subtitle={`${leverage.items.length} SKUs carry ${percent(leverage.share * 100)} of category spend`}
          footer="Take this list to a rep, not the whole catalog. Concentrated volume is what moves a price; a long tail of small lines does not."
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="tnum text-title1 font-bold leading-none">
                {moneyRound(leverage.total)}
              </p>
              <p className="mt-1 text-footnote text-label-3">
                in {leverage.items.length} of {data.categories.length} categories
              </p>
            </div>
            <Pill tone="brand">{percent(leverage.coversPct)} of lines</Pill>
          </div>

          <div className="mt-4">
            <BarList
              items={leverage.items}
              formatValue={moneyRound}
              emptyLabel="Not enough spend history yet"
            />
          </div>
        </Card>
      ) : null}

      {/* Cover risk */}
      {data.atRisk.length > 0 ? (
        <Section
          title="Will not survive shipping"
          footer="These items have less cover left than their best supplier's lead time. Reordering today still means a gap."
        >
          {data.atRisk.map((item) => (
            <Row
              key={item.id}
              to={`/inventory/${item.id}`}
              leading={<ProductTile product={item} size={38} imageUrl={item.imageUrl} />}
              title={item.productName}
              subtitle={`${coverShort(item.daysOfCover)} of cover · ${item.bestLeadDays}d to ship`}
              trailing={<Pill tone="critical" icon={Clock}>Gap</Pill>}
            />
          ))}
        </Section>
      ) : null}

      <div className="mt-4 flex items-start gap-2 rounded-card bg-surface shadow-card p-3">
        <Info size={15} className="mt-0.5 shrink-0 text-label-3" aria-hidden="true" />
        <p className="text-footnote text-label-3">
          Figures cover {rangeLabel} of purchasing across every location. Tap any chart column for
          exact values.
        </p>
      </div>

      <Link
        to="/orders/new"
        className="press mt-3 flex items-center justify-between rounded-card bg-surface shadow-card p-3"
      >
        <span className="min-w-0">
          <span className="block text-headline font-semibold">Price a restock</span>
          <span className="block text-footnote text-label-3">
            Compare every supplier before you buy
          </span>
        </span>
        <ArrowRight size={18} className="shrink-0 text-label-3" aria-hidden="true" />
      </Link>
    </Screen>
  )
}
