import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  ChevronLeft,
  Info,
  Layers,
  PlugZap,
  TriangleAlert,
} from 'lucide-react'
import Screen from '@/components/ios/Screen'
import { Row, Section } from '@/components/ios/List'
import { Pill, SegmentedControl } from '@/components/ios/Controls'
import Button from '@/components/ios/Button'
import Sheet from '@/components/ios/Sheet'
import ProductTile from '@/components/ProductTile'
import BarList from '@/components/charts/BarList'
import { useToast } from '@/components/ios/Toast'
import { useData } from '@/hooks/useData'
import {
  getProcedureConsumption,
  listProcedureTemplates,
  postProcedureConsumption,
} from '@/lib/repository'
import { money, moneyRound, qty } from '@/lib/format'

const WINDOWS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
]

/**
 * Procedure-driven consumption.
 *
 * The screen has two jobs: show what the procedure mix actually consumed, and
 * make the bill of materials editable, because the map is the part that has to
 * fit the practice rather than the other way round.
 */
export default function Procedures() {
  const navigate = useNavigate()
  const toast = useToast()

  const [days, setDays] = useState(30)
  const [detail, setDetail] = useState(null)
  const [posting, setPosting] = useState(false)

  const { data: usage, loading } = useData(() => getProcedureConsumption({ days }), [days])
  const { data: templates } = useData(() => listProcedureTemplates(), [])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const t of templates ?? []) {
      if (!map.has(t.category)) map.set(t.category, [])
      map.get(t.category).push(t)
    }
    return [...map.entries()]
  }, [templates])

  const post = async () => {
    setPosting(true)
    try {
      const { posted, skipped, procedures } = await postProcedureConsumption({ days: 7 })
      toast({
        title: `${posted} items drawn down`,
        body: `${procedures} procedures${skipped ? ` · ${skipped} not tracked` : ''}`,
      })
    } catch (e) {
      toast({ title: 'Could not post', body: e.message, tone: 'error' })
    } finally {
      setPosting(false)
    }
  }

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

  if (loading || !usage) {
    return (
      <Screen title="Procedures" largeTitle={false} leading={back}>
        <div className="space-y-3 pt-4">
          <div className="skeleton h-28 rounded-card" />
          <div className="skeleton h-64 rounded-card" />
        </div>
      </Screen>
    )
  }

  return (
    <Screen
      title="Procedures"
      subtitle={`${usage.procedureCount} completed in ${days} days`}
      largeTitle={false}
      leading={back}
    >
      <div className="pb-1 pt-3">
        <SegmentedControl value={days} onChange={setDays} options={WINDOWS} />
      </div>

      {/* What the mix consumed */}
      <div className="mt-3 rounded-card bg-surface p-4">
        <p className="text-caption font-medium uppercase tracking-[0.4px] text-label-3">
          Materials consumed
        </p>
        <div className="mt-1.5 flex items-end justify-between gap-4">
          <div>
            <p className="tnum text-title1 font-bold leading-none">
              {moneyRound(usage.materialCost)}
            </p>
            <p className="mt-1 text-footnote text-label-3">
              across {usage.mappedCount} mapped procedures
            </p>
          </div>
          <div className="text-right">
            <p className="tnum text-title3 font-semibold">{money(usage.costPerProcedure)}</p>
            <p className="text-caption text-label-3">per procedure</p>
          </div>
        </div>

        <p className="mt-3 border-t border-separator/50 pt-3 text-footnote text-label-3">
          Cost per procedure is the sharper metric where case fees are high — a percentage of
          collections can hide material inflation that this catches.
        </p>
      </div>

      {/* Coverage */}
      <div className="mt-2.5 rounded-card bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-headline font-semibold">
              {Math.round(usage.coverage)}% of procedures mapped
            </p>
            <p className="mt-0.5 text-footnote text-label-3">
              {usage.unmapped.length
                ? `${usage.unmapped.length} codes have no bill of materials yet`
                : 'Every completed code has a bill of materials'}
            </p>
          </div>
          <Pill tone={usage.coverage >= 95 ? 'good' : usage.coverage >= 80 ? 'warning' : 'critical'}>
            {usage.mappedCount}/{usage.procedureCount}
          </Pill>
        </div>

        {usage.unmapped.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-separator/50 pt-3">
            {usage.unmapped.slice(0, 8).map((u) => (
              <span
                key={u.code}
                className="rounded-full bg-ios-orange/12 px-2 py-0.5 font-mono text-caption font-semibold text-ios-orange"
              >
                {u.code} ×{u.count}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Post to stock */}
      <div className="mt-3">
        <Button className="w-full" size="lg" icon={Activity} loading={posting} onClick={post}>
          Draw down the last 7 days
        </Button>
        <p className="mt-2 px-1 text-center text-footnote text-label-3">
          Writes one ledger entry per product, not per procedure.
        </p>
      </div>

      {/* Biggest consumers */}
      {usage.consumption.length ? (
        <Section title="What it cost" footer="Estimated at each item's best available price.">
          <div className="p-4">
            <BarList
              items={usage.consumption.slice(0, 8).map((c) => ({
                label: c.productName,
                value: Math.round(c.estimatedCost),
                caption: `${qty(Math.round(c.packs * 10) / 10)}`,
              }))}
              formatValue={moneyRound}
              emptyLabel="Nothing consumed in this window"
            />
          </div>
        </Section>
      ) : null}

      {/* Procedure mix */}
      {usage.byCode.length ? (
        <Section title="Procedure mix">
          {usage.byCode.slice(0, 10).map((c) => (
            <Row
              key={c.code}
              chevron={false}
              onClick={() => setDetail((templates ?? []).find((t) => t.code === c.code) ?? null)}
              leading={
                <span className="font-mono text-caption font-semibold text-label-3">{c.code}</span>
              }
              title={c.name}
              detail={String(c.count)}
            />
          ))}
        </Section>
      ) : null}

      {/* The map itself */}
      <Section
        title="Bill of materials"
        footer="No standard CDT-to-materials mapping exists — it encodes each provider's preferences. Treat this as a starting template and correct it against real counts."
      >
        {grouped.map(([category, items]) => (
          <Row
            key={category}
            chevron={false}
            leading={<Layers size={16} className="text-label-3" aria-hidden="true" />}
            title={category.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
            detail={`${items.length} codes`}
          />
        ))}
      </Section>

      <Section>
        {(templates ?? []).map((t) => (
          <Row
            key={t.code}
            onClick={() => setDetail(t)}
            leading={
              <span className="font-mono text-caption font-semibold text-label-3">{t.code}</span>
            }
            title={t.name}
            subtitle={`${t.lineCount} materials${t.anesthetic ? ` · ${t.anesthetic} carpules` : ''}`}
            trailing={t.parametric ? <Pill tone="info">Parametric</Pill> : null}
          />
        ))}
      </Section>

      {/* PMS connection */}
      <Section
        title="Practice management system"
        footer="Open Dental exposes completed procedures over its REST API, including the code, surfaces and tooth number this map needs."
      >
        <Row
          leading={<PlugZap size={16} className="text-label-3" aria-hidden="true" />}
          title="Connect Open Dental"
          subtitle="Not connected — running on the demo procedure log"
          chevron={false}
          trailing={<Pill tone="quiet">Demo</Pill>}
        />
      </Section>

      <div className="mt-3 flex items-start gap-2 rounded-card bg-surface p-3.5">
        <Info size={15} className="mt-0.5 shrink-0 text-label-3" aria-hidden="true" />
        <p className="text-footnote text-label-3">
          Procedure codes are ADA intellectual property. A practice may use them in software it
          owns; distributing them in a commercial product needs an ADA licence.
        </p>
      </div>

      {/* BOM detail */}
      <Sheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.code} · ${detail.name}` : ''}
        detent="large"
      >
        {detail ? (
          <div className="py-2">
            <div className="rounded-card bg-surface p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill tone="brand">{detail.category.replace(/-/g, ' ')}</Pill>
                {detail.anesthetic ? (
                  <Pill tone="quiet">{detail.anesthetic} carpules</Pill>
                ) : null}
                {detail.canals ? <Pill tone="quiet">{detail.canals} canals</Pill> : null}
                {detail.setup === 'sterile' ? <Pill tone="warning">Sterile setup</Pill> : null}
              </div>
              {detail.parametric ? (
                <p className="mt-3 flex items-start gap-1.5 text-footnote text-label-2">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0 text-ios-blue" aria-hidden="true" />
                  Scales with the restored surfaces or canal count the PMS reports, so a
                  four-surface restoration draws more than a one-surface.
                </p>
              ) : null}
            </div>

            <Section title={`Materials (${detail.entries.length})`}>
              {detail.entries.map((e) => (
                <Row
                  key={e.sku}
                  chevron={false}
                  leading={<ProductTile product={e} size={34} />}
                  title={e.productName}
                  subtitle={`${e.sku} · ${e.unit ?? ''}`}
                  trailing={
                    <div className="text-right">
                      <p className="tnum text-callout font-semibold">{qty(e.each)}</p>
                      <p className="text-caption text-label-3">
                        {(e.each / (e.packSize || 1)).toFixed(3)} pack
                      </p>
                    </div>
                  }
                />
              ))}
            </Section>

            <p className="px-1 pb-2 pt-3 text-footnote text-label-3">
              Quantities are individual units. Dentin divides by pack size when it posts, and
              accumulates fractions across the batch rather than rounding each procedure — a tenth
              of a glove box rounded up every visit would overstate usage tenfold.
            </p>
          </div>
        ) : null}
      </Sheet>
    </Screen>
  )
}
