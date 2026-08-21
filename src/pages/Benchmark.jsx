import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  Check,
  ChevronLeft,
  Copy,
  FileSpreadsheet,
  Scale,
  TrendingUp,
  Users,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, RowIcon, Section } from '@/components/ui/List'
import { EmptyState, Pill, Toggle } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import {
  MIN_BENCHMARK_COHORT,
  getBenchmarkForProduct,
  getNegotiationScript,
  getPriceBenchmarks,
  setBenchmarkSharing,
} from '@/lib/repository'
import { money, percent, unitMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

const STANDING = {
  above: { tone: 'warning', label: 'Above market' },
  typical: { tone: 'quiet', label: 'Typical' },
  below: { tone: 'good', label: 'Below market' },
}

/** Overpaying is reported in the same accent the rest of the app gives money
 *  left on the table; sitting under the median is plain good news. */
function impactColor(amount) {
  return amount > 0 ? 'rgb(var(--viz-2))' : undefined
}

/**
 * Where this practice sits in the published distribution.
 *
 * Only the quartiles are drawn, because only the quartiles exist — there is no
 * whisker to either end, and inventing one would imply Dentin holds the
 * extremes. The scale is padded off the practice's own price so a contract
 * well outside the band still lands on the track.
 */
function QuartileStrip({ row }) {
  const lo = Math.min(row.p25UnitPrice, row.yourUnitPrice)
  const hi = Math.max(row.p75UnitPrice, row.yourUnitPrice)
  const pad = (hi - lo || hi * 0.1 || 1) * 0.25
  const min = lo - pad
  const span = hi + pad - min
  const at = (v) => Math.max(0, Math.min(100, ((v - min) / span) * 100))

  return (
    <div className="pb-1 pt-6">
      <div className="relative h-2 rounded-[2px] bg-fill/12">
        <span
          className="absolute inset-y-0 rounded-[2px] bg-brand-600/25"
          style={{ left: `${at(row.p25UnitPrice)}%`, right: `${100 - at(row.p75UnitPrice)}%` }}
        />
        <span
          className="absolute inset-y-[-3px] w-[2px] bg-brand-700 dark:bg-brand-400"
          style={{ left: `${at(row.medianUnitPrice)}%` }}
          aria-hidden="true"
        />

        {/* The practice's own price, labelled above the track so it reads as a
            position rather than another quartile. */}
        <span
          className="absolute -top-5 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${at(row.yourUnitPrice)}%` }}
        >
          <span className="tnum whitespace-nowrap text-caption2 font-bold text-label">
            you {unitMoney(row.yourUnitPrice)}
          </span>
          <span className="mt-0.5 h-2 w-[2px] bg-label" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-2 flex justify-between text-caption2 text-label-3">
        <span className="tnum">{unitMoney(row.p25UnitPrice)}</span>
        <span className="tnum font-semibold text-label-2">
          median {unitMoney(row.medianUnitPrice)}
        </span>
        <span className="tnum">{unitMoney(row.p75UnitPrice)}</span>
      </div>
    </div>
  )
}

/** One tracked item's standing, worst first down the list. */
function BenchmarkRow({ row, onOpen }) {
  const standing = STANDING[row.standing] ?? STANDING.typical

  return (
    <Row
      onClick={onOpen}
      chevron
      title={row.productName}
      subtitle={[row.brand, row.supplierName].filter(Boolean).join(' · ')}
      trailing={
        <span className="shrink-0 text-right">
          {row.annualImpact == null ? (
            <span className="block text-caption text-label-3">No usage yet</span>
          ) : (
            <>
              <span
                className="tnum block text-callout font-bold"
                style={{ color: impactColor(row.annualImpact) }}
              >
                {row.annualImpact > 0 ? money(row.annualImpact) : money(Math.abs(row.annualImpact))}
              </span>
              <span className="block text-caption text-label-3">
                {row.annualImpact > 0 ? 'a year over' : 'a year under'}
              </span>
            </>
          )}
        </span>
      }
    >
      {/* Inline rather than a flex row: the comparison must wrap inside itself
          on a phone, not overflow as one unbreakable block. */}
      <span className="mt-1.5 block leading-relaxed">
        <Pill tone={standing.tone} className="mr-1.5 align-middle">
          {standing.label}
        </Pill>
        <span className="tnum text-caption text-label-3">
          you {unitMoney(row.yourUnitPrice)} · median of {row.practices} practices{' '}
          {unitMoney(row.medianUnitPrice)}
        </span>
      </span>
    </Row>
  )
}

export default function Benchmark() {
  const navigate = useNavigate()
  const toast = useToast()

  const { data, loading } = useData(() => getPriceBenchmarks(), [])
  const [openId, setOpenId] = useState(null)
  const { data: loaded } = useData(
    () => (openId ? getBenchmarkForProduct(openId) : Promise.resolve(null)),
    [openId],
  )
  // useData holds the previous value while the next one loads, which would
  // otherwise show one item's quartiles under another item's name.
  const detail = loaded?.productId === openId ? loaded : null

  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => setCopied(false), [openId])

  const back = (
    <button
      type="button"
      onClick={() => navigate(-1)}
      className="press flex items-center gap-0.5 pl-1 text-brand-600 dark:text-brand-400"
    >
      <ChevronLeft size={24} strokeWidth={2.2} />
      <span className="text-body">Back</span>
    </button>
  )

  if (loading || !data) {
    return (
      <Screen title="Price benchmarks" largeTitle={false} leading={back}>
        <div className="space-y-3 pt-4">
          <div className="skeleton h-32 rounded-card" />
          <div className="skeleton h-64 rounded-card" />
        </div>
      </Screen>
    )
  }

  const script = detail ? getNegotiationScript(detail) : null

  const toggleSharing = async (next) => {
    if (busy) return
    setBusy(true)
    try {
      await setBenchmarkSharing(next)
      toast({
        title: next ? 'Pooling on' : 'Pooling off',
        body: next
          ? 'Your contracted prices join the anonymized aggregates'
          : 'Your prices are out of every aggregate, and benchmarks are hidden',
      })
    } catch (e) {
      toast({ title: 'Could not save', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast({ title: 'Could not copy', body: 'Select the text and copy it manually', tone: 'error' })
    }
  }

  const sharingPanel = (
    <Section
      title="Pooling"
      footer={`Dentin contributes your contracted unit prices and nothing else — never your practice name, and never a price on its own. An item is published only once at least ${MIN_BENCHMARK_COHORT} practices hold a contract for it, and only ever as quartiles. Switching this off takes your prices out of every aggregate, and switches off the benchmarks you can see in return.`}
    >
      <Row
        title="Share anonymized contract prices"
        subtitle={
          data.sharing
            ? 'On — you contribute, and you can read the market'
            : 'Off — you contribute nothing, and see no benchmark'
        }
        chevron={false}
        leading={
          <RowIcon tint={data.sharing ? 'brand' : 'quiet'}>
            <Scale size={13} strokeWidth={2.2} />
          </RowIcon>
        }
        trailing={
          <Toggle
            checked={data.sharing}
            onChange={toggleSharing}
            label="Share anonymized contract prices"
          />
        }
      />
    </Section>
  )

  // --- sharing off: the reciprocal half of the deal, said plainly ---------
  if (!data.sharing) {
    return (
      <Screen title="Price benchmarks" largeTitle={false} leading={back}>
        <EmptyState
          icon={Scale}
          title="Benchmarks are off for this practice"
          body="Pooling runs both ways. Your contracted prices are excluded from every aggregate, so Dentin does not show you what other practices pay either. Turning it back on takes effect on the next read."
        />
        {sharingPanel}
      </Screen>
    )
  }

  // --- the pool is not deep enough yet -----------------------------------
  if (!data.unlocked) {
    return (
      <Screen title="Price benchmarks" largeTitle={false} leading={back}>
        <div className="mt-3 rounded-card bg-surface shadow-card p-4">
          <div className="flex items-center gap-1.5 text-label-3">
            <Users size={13} strokeWidth={2.6} aria-hidden="true" />
            <span className="text-caption font-bold uppercase tracking-[0.5px]">
              The pool is still filling
            </span>
          </div>
          <p className="tnum mt-1.5 text-title2 font-bold leading-tight">
            {data.contributingPractices} practices sharing ·{' '}
            <span className="text-label-3">{data.comparableProducts} items comparable yet</span>
          </p>
          <p className="mt-1 text-footnote text-label-3">
            {data.pricedProducts} item{data.pricedProducts === 1 ? ' has' : 's have'} a contracted
            price loaded across the pool. None has reached {MIN_BENCHMARK_COHORT} practices yet.
          </p>
          <p className="mt-3 text-subhead leading-relaxed text-label-2">
            A price becomes comparable once at least {MIN_BENCHMARK_COHORT} practices hold a
            contract for the same item — below that, one practice could work another&apos;s price
            out by subtraction, so the row is not published at all. Importing your own contract
            file is what pushes the items you actually buy over that line: it adds your prices to
            the count, and it is the same file that earns you a benchmark back.
          </p>
        </div>

        <div className="mt-4">
          <Button to="/vendors/import" size="lg" icon={FileSpreadsheet} className="w-full">
            Import a contract file
          </Button>
          <p className="px-1 pt-2 text-footnote text-label-3">
            {data.contractedItems > 0
              ? `Your ${data.contractedItems} contracted item${data.contractedItems === 1 ? ' is' : 's are'} already counted. Every further file — yours or another practice's — moves more items over the line.`
              : 'Ask your rep for the contracted-price file. It is the same CSV that already powers your price comparisons.'}
          </p>
        </div>

        {sharingPanel}
      </Screen>
    )
  }

  // --- unlocked, but nothing of yours overlaps the pool -------------------
  if (!data.rows.length) {
    return (
      <Screen
        title="Price benchmarks"
        subtitle={`${data.contributingPractices} practices sharing`}
        largeTitle={false}
        leading={back}
      >
        <EmptyState
          icon={Scale}
          title={
            data.contractedItems
              ? 'None of your items are comparable yet'
              : 'No contract prices loaded yet'
          }
          body={
            data.contractedItems
              ? `${data.comparableProducts} items are comparable across the pool, but none of them overlap the ${data.contractedItems} you have loaded. That changes as more practices import the items you buy.`
              : `${data.comparableProducts} items are comparable across the pool. Load your contracted prices and Dentin can tell you where each of them sits.`
          }
          action={
            <Button to="/vendors/import" icon={FileSpreadsheet}>
              Import a contract file
            </Button>
          }
        />
        {sharingPanel}
      </Screen>
    )
  }

  return (
    <Screen
      title="Price benchmarks"
      subtitle={`${data.comparableItems} of ${data.contractedItems} contracted items comparable`}
      largeTitle={false}
      leading={back}
    >
      {/* The headline: what the gap to the median is worth over a year */}
      {data.annualImpact > 0 ? (
        <div
          className="mt-3 rounded-card p-5 text-white"
          style={{
            background:
              'linear-gradient(135deg, rgb(var(--viz-2)) 0%, rgb(var(--viz-2) / 0.8) 100%)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <TrendingUp size={13} strokeWidth={2.6} aria-hidden="true" />
            <span className="text-caption font-bold uppercase tracking-[0.5px]">
              Above the market median
            </span>
          </div>
          <p className="tnum mt-1.5 text-[40px] font-bold leading-[44px]">
            {money(data.annualImpact)}
          </p>
          <p className="mt-1.5 text-footnote text-white/90">
            a year across {data.overMedianCount} item{data.overMedianCount === 1 ? '' : 's'} priced
            over the median, at the rate you use them.{' '}
            {data.aboveCount > 0
              ? `${data.aboveCount} of those sit above the top quartile.`
              : 'None sit above the top quartile.'}
          </p>
        </div>
      ) : (
        /* Over the median on paper, but with no usage history behind it, there
           is no annual figure to lead with — and inventing one here would be
           the one lie this whole screen exists to avoid. */
        <div className="mt-3 rounded-card bg-surface shadow-card p-4">
          <div
            className={cn(
              'flex items-center gap-1.5',
              data.overMedianCount > 0 ? 'text-label-3' : 'text-ios-green',
            )}
          >
            {data.overMedianCount > 0 ? (
              <TrendingUp size={13} strokeWidth={2.6} aria-hidden="true" />
            ) : (
              <Check size={13} strokeWidth={2.8} aria-hidden="true" />
            )}
            <span className="text-caption font-bold uppercase tracking-[0.5px]">
              {data.overMedianCount > 0 ? 'Above the market median' : 'At or under the market'}
            </span>
          </div>
          <p className="mt-1.5 text-headline leading-snug">
            {data.overMedianCount > 0
              ? `${data.overMedianCount} item${data.overMedianCount === 1 ? ' is' : 's are'} priced over the median, with no usage history yet to put a year's figure on.`
              : 'Every comparable item is priced at or below the market median.'}
          </p>
          <p className="mt-1 text-footnote text-label-3">
            {data.comparableItems} of your {data.contractedItems} contracted item
            {data.contractedItems === 1 ? '' : 's'} can be compared today
            {data.comparableItems < data.contractedItems
              ? `; the rest have not reached ${MIN_BENCHMARK_COHORT} practices yet.`
              : '.'}
          </p>
        </div>
      )}

      <Section
        title="Worst first"
        footer="The annual figure is your price minus the market median, at the quantity your movement history says you actually consume. Items with no usage history yet are listed without one rather than estimated."
      >
        {data.rows.map((row) => (
          <BenchmarkRow key={row.productId} row={row} onOpen={() => setOpenId(row.productId)} />
        ))}
      </Section>

      {data.missingBurnCount > 0 ? (
        <p className="px-1 pb-1 pt-2 text-footnote text-label-3">
          {data.missingBurnCount} item{data.missingBurnCount === 1 ? ' has' : 's have'} no usage
          history yet, so no annual figure is claimed for {data.missingBurnCount === 1 ? 'it' : 'them'}.
        </p>
      ) : null}

      {sharingPanel}

      {/* One item, in full: the quartiles, the vendor split, the script */}
      <Sheet
        open={Boolean(openId)}
        onClose={() => setOpenId(null)}
        title={detail?.productName ?? 'Benchmark'}
        detent="large"
        footer={
          script?.text ? (
            <Button
              className="w-full"
              size="lg"
              icon={copied ? Check : Copy}
              onClick={copyScript}
            >
              {copied ? 'Copied' : 'Copy the script'}
            </Button>
          ) : null
        }
      >
        {detail ? (
          <div className="py-2">
            <div className="rounded-card bg-surface shadow-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-headline font-semibold leading-snug">
                    {detail.productName}
                  </h3>
                  <p className="mt-0.5 text-footnote text-label-3">
                    {[detail.brand, detail.unit].filter(Boolean).join(' · ')} · contracted with{' '}
                    {detail.supplierName}
                  </p>
                </div>
                <Pill tone={(STANDING[detail.standing] ?? STANDING.typical).tone}>
                  {(STANDING[detail.standing] ?? STANDING.typical).label}
                </Pill>
              </div>

              <QuartileStrip row={detail} />

              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-separator/50 pt-3">
                <div>
                  <dt className="text-caption text-label-3">You pay</dt>
                  <dd className="tnum text-callout font-semibold">
                    {unitMoney(detail.yourUnitPrice)}
                    {detail.packSize > 1 ? (
                      <span className="text-caption font-normal text-label-3">
                        {' '}
                        · {money(detail.yourPackPrice)} a pack
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-label-3">Versus the median</dt>
                  <dd
                    className="tnum text-callout font-semibold"
                    style={{ color: impactColor(detail.deltaPct ?? 0) }}
                  >
                    {detail.deltaPct == null
                      ? '—'
                      : `${detail.deltaPct > 0 ? '+' : '−'}${percent(Math.abs(detail.deltaPct))}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-label-3">Cohort</dt>
                  <dd className="tnum text-callout font-semibold">
                    {detail.practices} practices
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-label-3">Annual difference</dt>
                  <dd
                    className="tnum text-callout font-semibold"
                    style={{ color: impactColor(detail.annualImpact ?? 0) }}
                  >
                    {detail.annualImpact == null
                      ? 'No usage history'
                      : money(Math.abs(detail.annualImpact))}
                  </dd>
                </div>
              </dl>

              <p className="mt-3 border-t border-separator/50 pt-3 text-footnote leading-snug text-label-3">
                Quartiles only, from {detail.practices} practices that hold a contract for this
                item. Dentin never publishes an individual practice&apos;s price, a minimum, a
                maximum, or who is in the group.
              </p>
            </div>

            {/* The actionable split — a rep has to answer their own median */}
            {detail.byVendor.length ? (
              <Section
                title="By vendor"
                footer={`Each vendor's own median, from the accounts that price this item. A vendor appears only once at least ${MIN_BENCHMARK_COHORT} practices hold a contract with them for it.`}
              >
                {detail.byVendor.map((v) => (
                  <Row
                    key={v.supplierId}
                    chevron={false}
                    leading={
                      <RowIcon tint={v.isYours ? 'brand' : 'quiet'}>
                        <Building2 size={13} strokeWidth={2.2} />
                      </RowIcon>
                    }
                    title={v.supplierName}
                    subtitle={`median of ${v.practices} practices${v.isYours ? ' · your account' : ''}`}
                    trailing={
                      <span className="shrink-0 text-right">
                        <span className="tnum block text-callout font-semibold">
                          {unitMoney(v.medianUnitPrice)}
                        </span>
                        {v.yourUnitPrice != null ? (
                          <span className="tnum block text-caption text-label-3">
                            you {unitMoney(v.yourUnitPrice)}
                          </span>
                        ) : (
                          <span className="block text-caption text-label-3">no account</span>
                        )}
                      </span>
                    }
                  />
                ))}
              </Section>
            ) : (
              <p className="px-1 pb-1 pt-4 text-footnote text-label-3">
                No single vendor has reached {MIN_BENCHMARK_COHORT} practices on this item yet, so
                there is no vendor-by-vendor split to show.
              </p>
            )}

            {/* Read it to the rep as written */}
            <Section
              title="What to say"
              footer="Numbers and an ask. Nothing here names another practice, and nothing here is a price Dentin holds on its own."
            >
              <div className="row block space-y-2.5 py-3">
                {script.lines.map((line, i) => (
                  <p key={i} className="text-subhead leading-relaxed text-label-2">
                    {line}
                  </p>
                ))}
              </div>
            </Section>
          </div>
        ) : (
          <div className="space-y-3 py-3">
            <div className="skeleton h-40 rounded-card" />
            <div className="skeleton h-32 rounded-card" />
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
