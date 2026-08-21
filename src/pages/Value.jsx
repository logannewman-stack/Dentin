import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ArrowRight, Clock, Info, PartyPopper, Sparkles, TrendingDown } from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, Section } from '@/components/ui/List'
import { EmptyState, Pill, SegmentedControl } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import BarList from '@/components/charts/BarList'
import ProductTile from '@/components/ProductTile'
import { useData } from '@/hooks/useData'
import {
  getPriceOpportunities,
  getValueSummary,
  isDemo,
  snapshotFoundSavings,
} from '@/lib/repository'
import { money, moneyRound, percent } from '@/lib/format'
import { cn } from '@/lib/utils'

const RANGES = [
  { value: 3, label: '3M' },
  { value: 6, label: '6M' },
  { value: 12, label: '12M' },
]

/**
 * Found is drawn in the same orange the price scan uses for money left on the
 * table; captured wears the brand teal, because it is the only one of the two
 * that is actually in the bank.
 */
const SERIES = [
  { key: 'found', label: 'Found', slot: 2 },
  { key: 'captured', label: 'Captured', slot: 1 },
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

/**
 * Found and captured, side by side rather than stacked.
 *
 * StackedColumns treats a column as one whole split into parts, which is the
 * right picture for paid-against-list on Insights and the wrong one here:
 * stacking would draw a column worth the sum of these two numbers, and their
 * sum is the single thing this screen exists not to claim. Everything else —
 * the tick rounding, the hairline gridlines, the tooltip — is that chart's.
 */
function FoundVsCaptured({ data, height = 172 }) {
  const [active, setActive] = useState(null)

  const max = Math.max(...data.map((d) => Math.max(d.found, d.captured)), 1)
  const magnitude = 10 ** Math.floor(Math.log10(max))
  const axisMax = Math.ceil(max / (magnitude / 2)) * (magnitude / 2)
  const ticks = [0, axisMax / 2, axisMax]

  return (
    <div className="w-full">
      <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ background: `rgb(var(--viz-${s.slot}))` }}
              aria-hidden="true"
            />
            <span className="text-caption text-label-2">{s.label}</span>
          </li>
        ))}
      </ul>

      <div className="relative flex" style={{ height }}>
        {/* Y ticks */}
        <div className="mr-2 flex w-11 shrink-0 flex-col justify-between py-[1px]">
          {[...ticks].reverse().map((t) => (
            <span key={t} className="tnum text-right text-caption2 leading-none text-viz-muted">
              {compactMoney(t)}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute inset-x-0 h-px bg-viz-grid"
              style={{ bottom: `${(t / axisMax) * 100}%` }}
              aria-hidden="true"
            />
          ))}

          <div className="absolute inset-0 flex items-end justify-between gap-1">
            {data.map((d, i) => {
              const isActive = active === i
              return (
                <button
                  type="button"
                  key={d.key}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="relative flex h-full flex-1 items-end justify-center gap-[3px] outline-none"
                  aria-label={`${d.label}: found ${money(d.found)}, captured ${money(d.captured)}`}
                >
                  {SERIES.map((s) => (
                    <span
                      key={s.key}
                      className="w-full max-w-[10px] rounded-t-[3px] transition-opacity duration-150"
                      style={{
                        height: d[s.key] > 0 ? `${Math.max((d[s.key] / axisMax) * 100, 1.5)}%` : 0,
                        background: `rgb(var(--viz-${s.slot}))`,
                        opacity: active == null || isActive ? 1 : 0.4,
                      }}
                    />
                  ))}

                  {isActive ? (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max -translate-x-1/2 rounded-[3px] bg-surface px-2.5 py-2 shadow-raised"
                    >
                      <span className="block text-caption font-semibold text-label">{d.label}</span>
                      {SERIES.map((s) => (
                        <span key={s.key} className="mt-1 flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-[2px]"
                            style={{ background: `rgb(var(--viz-${s.slot}))` }}
                          />
                          <span className="text-caption text-label-2">{s.label}</span>
                          <span className="tnum ml-auto pl-2 text-caption font-semibold text-label">
                            {money(d[s.key])}
                          </span>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex pl-[52px]">
        {data.map((d) => (
          <span
            key={d.key}
            className="flex-1 text-center text-caption2 leading-none text-viz-muted"
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * The renewal question, answered out loud.
 *
 * Three states, and the weak one is not hidden. Most practices reading this
 * are weeks old, so "too early to tell" is the state that gets the care: it
 * says what is missing and where to go, rather than showing a bad ratio that
 * measures the calendar instead of the product.
 */
function VerdictCard({ comparison, subscription, hasGap }) {
  if (!comparison) return null

  const { verdict, multiple, cost, captured } = comparison
  const rate = subscription
    ? `${money(subscription.perLocationMonthly)} per location per month${
        subscription.quantity > 1 ? ` · ${subscription.quantity} locations` : ''
      }${subscription.interval === 'year' ? ' · annual plan' : ''}`
    : null

  if (verdict === 'too-early') {
    const weeks = Math.max(0, Math.round(comparison.monthsBilled * 4.35))
    return (
      <section className="mt-3 rounded-card bg-surface shadow-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-footnote text-label-3">
              Is it paying for itself
            </p>
            <p className="mt-1.5 text-title3 font-semibold text-label">Too early to tell</p>
          </div>
          <Pill tone="quiet" icon={Clock}>
            {weeks < 1 ? 'In trial' : `${weeks} ${weeks === 1 ? 'week' : 'weeks'} in`}
          </Pill>
        </div>

        <p className="mt-2 text-footnote leading-snug text-label-2">
          {cost > 0
            ? `Dentin has billed ${moneyRound(cost)} so far. A ratio against that says more about the calendar than about the software — it is worth reading after a full ordering cycle.`
            : 'Nothing has been billed yet. The trial is still running, so there is no cost to measure against.'}{' '}
          What matters this month is the found column, and whether anyone is acting on it.
        </p>

        <div className="mt-3 border-t border-separator/50 pt-3">
          <Button to="/vendors/compare" size="md" variant="secondary" className="w-full">
            See what is on the table
          </Button>
        </div>
      </section>
    )
  }

  const ahead = verdict === 'ahead'
  return (
    <section
      className={cn(
        'mt-3 rounded-card bg-surface shadow-card p-4',
        ahead && 'border-l-2 border-l-ios-green',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-footnote text-label-3">
            Is it paying for itself
          </p>
          <p
            className={cn(
              'tnum mt-1 text-[40px] font-bold leading-[44px] tracking-tight',
              ahead ? 'text-ios-green' : 'text-label',
            )}
          >
            {ahead
              ? `${multiple >= 10 ? Math.round(multiple) : multiple.toFixed(1)}×`
              : percent(multiple * 100)}
          </p>
        </div>
        <Pill tone={ahead ? 'good' : 'warning'} icon={ahead ? TrendingDown : Clock}>
          {ahead ? 'Ahead' : 'Not yet'}
        </Pill>
      </div>

      <p className="mt-2 text-footnote leading-snug text-label-2">
        You captured <strong className="tnum text-label">{moneyRound(captured)}</strong> against{' '}
        <strong className="tnum text-label">{moneyRound(cost)}</strong> of Dentin over the same
        period.{' '}
        {ahead
          ? 'That gap is what the subscription bought.'
          : hasGap
            ? 'The items below are where the difference is — most of it is usually one or two vendors.'
            : 'Nothing is on the table today, so the way to close this is to keep pricing restocks here before you place them.'}
      </p>

      {rate ? <p className="mt-2 text-caption text-label-3">{rate}</p> : null}
    </section>
  )
}

export default function Value() {
  const [months, setMonths] = useState(12)
  const [showMethod, setShowMethod] = useState(false)

  const { data, loading } = useData(async () => {
    const opportunities = await getPriceOpportunities()
    // Accrue today's gaps before reading the ledger back, so the number the
    // practice is about to read includes what is on the table right now. The
    // ledger is the record, not the renderer: if the write fails the screen
    // still has to draw.
    try {
      await snapshotFoundSavings(opportunities)
    } catch {
      // Deliberately swallowed — see above.
    }
    const summary = await getValueSummary({ months, opportunities })
    return { summary, opportunities }
  }, [months])

  if (loading || !data) {
    return (
      <Screen title="Value">
        <div className="space-y-3 pt-4">
          <div className="skeleton h-32 rounded-card" />
          <div className="skeleton h-28 rounded-card" />
          <div className="skeleton h-56 rounded-card" />
        </div>
      </Screen>
    )
  }

  const { summary } = data
  const since = summary.sinceDate ? parseISO(summary.sinceDate) : null
  const windowStart = parseISO(summary.windowStart)
  // "Since March" only holds while March is inside the window being measured.
  const joinedInWindow = since && since >= windowStart
  const sinceLabel = joinedInWindow
    ? `Since ${format(since, 'MMMM')}`
    : `Over the last ${months} months`
  const open = summary.open
  const nothingYet = summary.found.window <= 0 && summary.captured.window <= 0

  const method = (
    <Sheet open={showMethod} onClose={() => setShowMethod(false)} title="How this is counted">
      <div className="space-y-4 py-3">
        <div>
          <p className="text-subhead font-semibold text-label">What counts as found</p>
          <p className="mt-1 text-footnote leading-snug text-label-2">
            A cheaper source for something you already stock, an overcharge spotted on an invoice,
            or a contract price sitting above the market. Each one is counted once per item per
            restock cycle, not once per visit — a gap you have not acted on is still the same gap
            tomorrow, and counting it again every day would turn a real number into a fiction.
          </p>
        </div>

        <div>
          <p className="text-subhead font-semibold text-label">What counts as captured</p>
          <p className="mt-1 text-footnote leading-snug text-label-2">
            Money that actually moved. An order placed below the highest in-stock offer at the time
            you placed it, or an overcharge a vendor credited back. Each order and each invoice line
            is counted once.
          </p>
        </div>

        <div>
          <p className="text-subhead font-semibold text-label">What is not counted</p>
          <p className="mt-1 text-footnote leading-snug text-label-2">
            Found and captured are never added together, and found money is never described as
            saved. Time saved, stockouts avoided and expiry write-offs prevented are real, and none
            of them are in these figures. Neither are rebates, manufacturer promotions or anything
            negotiated outside Dentin.
          </p>
        </div>

        <div>
          <p className="text-subhead font-semibold text-label">How the cost is worked out</p>
          <p className="mt-1 text-footnote leading-snug text-label-2">
            {summary.subscription
              ? `Your plan rate — ${money(summary.subscription.perLocationMonthly)} per location per month across ${summary.subscription.quantity} ${summary.subscription.quantity === 1 ? 'location' : 'locations'} — accrued over the months you have been billed. It is the run rate, not a copy of your invoices, and it starts when the trial ends.`
              : 'Your plan could not be read, so no comparison against the subscription is shown. A guessed price would be worse than none.'}
          </p>
        </div>

        {isDemo ? (
          <p className="text-footnote leading-snug text-label-3">
            This is the demo practice. Every figure here is sample data.
          </p>
        ) : null}
      </div>
    </Sheet>
  )

  if (nothingYet && !open?.count) {
    return (
      <Screen title="Value" subtitle={sinceLabel}>
        <EmptyState
          icon={PartyPopper}
          title="Nothing to report yet"
          body="Once Dentin finds a cheaper source or you place an order below the market, both numbers start here. Neither is guessed at, so both stay empty until something real happens."
          action={<Button to="/vendors/compare">Check today&apos;s prices</Button>}
        />
        <button
          type="button"
          onClick={() => setShowMethod(true)}
          className="press mt-2 flex w-full items-center justify-center gap-1.5 rounded-card bg-surface shadow-card p-3 text-footnote text-label-3"
        >
          <Info size={14} aria-hidden="true" />
          How this is counted
        </button>
        {method}
      </Screen>
    )
  }

  return (
    <Screen title="Value" subtitle={sinceLabel}>
      <div className="pb-1 pt-2">
        <SegmentedControl value={months} onChange={setMonths} options={RANGES} />
      </div>

      {/* The sentence a practice repeats to their partner */}
      <section className="mt-2 rounded-card bg-surface shadow-card p-4">
        <p className="text-body leading-snug text-label-2">
          {sinceLabel}, Dentin found{' '}
          <strong className="tnum font-semibold text-label">
            {moneyRound(summary.found.window)}
          </strong>{' '}
          and you captured{' '}
          <strong className="tnum font-semibold text-label">
            {moneyRound(summary.captured.window)}
          </strong>
          .
        </p>

        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[3px] border border-line bg-line">
          <div className="bg-surface p-3">
            <span className="flex items-center gap-1 text-footnote text-label-3">
              <Sparkles size={11} strokeWidth={2.1} aria-hidden="true" />
              Found
            </span>
            <span
              className="tnum mt-1 block text-title2 font-bold leading-tight"
              style={{ color: 'rgb(var(--viz-2))' }}
            >
              {moneyRound(summary.found.window)}
            </span>
            <span className="mt-0.5 block text-caption text-label-3">put in front of you</span>
          </div>
          <div className="bg-surface p-3">
            <span className="flex items-center gap-1 text-footnote text-label-3">
              <TrendingDown size={11} strokeWidth={2.1} aria-hidden="true" />
              Captured
            </span>
            <span
              className="tnum mt-1 block text-title2 font-bold leading-tight"
              style={{ color: 'rgb(var(--viz-1))' }}
            >
              {moneyRound(summary.captured.window)}
            </span>
            <span className="mt-0.5 block text-caption text-label-3">actually moved</span>
          </div>
        </div>

        <p className="mt-3 border-t border-separator/50 pt-3 text-footnote leading-snug text-label-3">
          Found is money Dentin put in front of you — a cheaper source, an overcharge, a contract
          price above the market. Captured is money that left your account and came back. The two
          are never added together.
          {summary.captureRate != null ? (
            <>
              {' '}
              You have acted on{' '}
              <strong className="text-label-2">{percent(summary.captureRate * 100)}</strong> of what
              was found.
            </>
          ) : null}
        </p>
      </section>

      <VerdictCard
        comparison={summary.comparison}
        subscription={summary.subscription}
        hasGap={Boolean(open?.count)}
      />

      {/* Month by month, side by side and never stacked */}
      <Card
        title="Month by month"
        subtitle="Found against captured, never added together"
        footer="A month with a tall left bar and a short right one is a month where the work was done and nobody acted on it."
      >
        <FoundVsCaptured data={summary.series} />
      </Card>

      {/* The gap, made actionable — this is the part that earns next month */}
      {open?.count ? (
        <Section
          title={`Found, not captured · ${moneyRound(open.value)}`}
          action={
            open.count > 8 ? (
              <Link
                to="/vendors/compare"
                className="press text-footnote font-medium text-brand-700 dark:text-brand-400"
              >
                View all {open.count}
              </Link>
            ) : null
          }
          footer="Every one of these needs an account with a vendor you do not hold yet. Opening one usually captures most of the list."
        >
          {open.rows.slice(0, 8).map((row) => (
            <Row
              key={row.inventoryItemId ?? row.productId}
              // Each of these is a cheaper source outside the accounts the
              // practice holds, so the place to act is the vendor comparison,
              // not the order builder.
              to="/vendors/compare"
              leading={<ProductTile product={row} size={38} imageUrl={row.imageUrl} />}
              title={row.productName}
              subtitle={`${row.marketSupplierName} · ${Math.round(row.pctCheaper)}% under ${row.accountSupplierName}`}
              trailing={
                <span className="shrink-0 text-right">
                  <span
                    className="tnum block text-callout font-bold"
                    style={{ color: 'rgb(var(--viz-2))' }}
                  >
                    {money(row.savingsPerOrder)}
                  </span>
                  <span className="block text-caption text-label-3">per restock</span>
                </span>
              }
            />
          ))}
        </Section>
      ) : null}

      {open?.count ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button to="/vendors/compare" size="lg" className="w-full sm:flex-1">
            Open the cheaper vendor
          </Button>
          <Button to="/orders/new" variant="secondary" size="lg" className="w-full sm:flex-1">
            Reorder at the better price
          </Button>
        </div>
      ) : summary.found.window > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-card bg-surface shadow-card p-3">
          <PartyPopper size={15} className="mt-0.5 shrink-0 text-ios-green" aria-hidden="true" />
          <p className="text-footnote leading-snug text-label-2">
            Nothing is sitting on the table today. Across every tracked item, no vendor outside your
            accounts beats what you can order right now.
          </p>
        </div>
      ) : null}

      {/* What made up each column */}
      {summary.topFound.length || summary.topCaptured.length ? (
        <Card
          title="What made up the numbers"
          subtitle={`Biggest contributors over ${months === 12 ? 'the last 12 months' : `the last ${months} months`}`}
        >
          <div className="lg:grid lg:grid-cols-2 lg:gap-6">
            <div>
              <p className="mb-3 text-footnote text-label-3">
                Found · by item
              </p>
              <BarList
                items={summary.topFound}
                formatValue={moneyRound}
                emptyLabel="Nothing found yet"
              />
            </div>
            <div className="mt-5 lg:mt-0">
              <p className="mb-3 text-footnote text-label-3">
                Captured · by vendor
              </p>
              <BarList
                items={summary.topCaptured}
                formatValue={moneyRound}
                emptyLabel="Nothing captured yet"
              />
            </div>
          </div>
        </Card>
      ) : null}

      {/* Lifetime, kept out of the headline so the window stays honest */}
      {summary.found.lifetime > summary.found.window ||
      summary.captured.lifetime > summary.captured.window ? (
        <p className="px-1 pt-3 text-footnote text-label-3">
          Since you joined: {moneyRound(summary.found.lifetime)} found,{' '}
          {moneyRound(summary.captured.lifetime)} captured.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setShowMethod(true)}
        className="press mt-3 flex w-full items-center justify-between gap-3 rounded-card bg-surface shadow-card p-3 text-left"
      >
        <span className="flex min-w-0 items-start gap-2">
          <Info size={15} className="mt-0.5 shrink-0 text-label-3" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-subhead font-medium text-label">How this is counted</span>
            <span className="block text-footnote text-label-3">
              What counts as found, what counts as captured, and what is left out
            </span>
          </span>
        </span>
        <ArrowRight size={16} className="shrink-0 text-label-3" aria-hidden="true" />
      </button>

      {isDemo ? (
        <p className="px-1 pb-2 pt-4 text-center text-caption text-label-3">
          Demo practice — every figure on this screen is sample data.
        </p>
      ) : null}

      <Link
        to="/insights"
        className="press mt-3 flex items-center justify-between rounded-card bg-surface shadow-card p-3"
      >
        <span className="min-w-0">
          <span className="block text-headline font-semibold">Where the money goes</span>
          <span className="block text-footnote text-label-3">
            Spend by category, vendor and item
          </span>
        </span>
        <ArrowRight size={18} className="shrink-0 text-label-3" aria-hidden="true" />
      </Link>

      {method}
    </Screen>
  )
}
