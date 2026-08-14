import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  BadgeCheck,
  ChevronLeft,
  CircleHelp,
  Hash,
  ScanBarcode,
  SlashSquare,
  Truck,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, Section } from '@/components/ui/List'
import { Pill, SegmentedControl } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import ProductTile from '@/components/ProductTile'
import { VendorStatus } from '@/components/VendorBadge'
import { useData } from '@/hooks/useData'
import { findVendorPrices } from '@/lib/repository'
import { MATCH_CONFIDENCE } from '@/lib/demoData'
import { money, unitMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

const MATCH_ICON = { gtin: ScanBarcode, mpn: Hash, name: CircleHelp }

/** How a vendor's listing was tied to this exact product. */
function MatchBadge({ matchedBy, onExplain }) {
  const meta = MATCH_CONFIDENCE[matchedBy] ?? MATCH_CONFIDENCE.name
  const Icon = MATCH_ICON[matchedBy] ?? CircleHelp

  return (
    <button
      type="button"
      onClick={onExplain}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold',
        meta.verified ? 'bg-ios-blue/12 text-ios-blue' : 'bg-ios-yellow/20 text-[#8A6100] dark:text-ios-yellow',
      )}
    >
      <Icon size={11} strokeWidth={2.6} aria-hidden="true" />
      {meta.label}
    </button>
  )
}

export default function PriceCheck() {
  const { productId } = useParams()
  const navigate = useNavigate()

  const { data, loading } = useData(() => findVendorPrices(productId), [productId])
  const [sort, setSort] = useState('unit')
  const [explain, setExplain] = useState(null)
  // Vendors answer at different speeds; a brief scan state makes the fan-out
  // legible instead of the list just appearing.
  const [scanning, setScanning] = useState(true)

  useEffect(() => {
    setScanning(true)
    const t = setTimeout(() => setScanning(false), 700)
    return () => clearTimeout(t)
  }, [productId])

  const offers = useMemo(() => {
    const list = [...(data?.offers ?? [])]
    if (sort === 'unit') {
      list.sort((a, b) => {
        if (a.inStock !== b.inStock) return a.inStock ? -1 : 1
        return a.unitPrice - b.unitPrice
      })
    } else if (sort === 'speed') {
      list.sort((a, b) => {
        if (a.inStock !== b.inStock) return a.inStock ? -1 : 1
        return (a.leadDays ?? 99) - (b.leadDays ?? 99)
      })
    } else {
      list.sort((a, b) => {
        if (a.hasAccount !== b.hasAccount) return a.hasAccount ? -1 : 1
        return a.unitPrice - b.unitPrice
      })
    }
    return list
  }, [data, sort])

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
      <Screen title="Price check" largeTitle={false} leading={back}>
        <div className="space-y-3 pt-4">
          <div className="skeleton h-28 rounded-card" />
          <div className="skeleton h-64 rounded-card" />
        </div>
      </Screen>
    )
  }

  const { product, nonCarriers, accountBest, marketBest } = data
  const checked = offers.length + nonCarriers.length
  const spread =
    offers.length > 1
      ? offers[offers.length - 1].unitPrice - offers[0].unitPrice
      : 0

  return (
    <Screen
      title="Price check"
      subtitle={`${offers.length} of ${checked} vendors carry it`}
      largeTitle={false}
      leading={back}
    >
      {/* What exactly are we pricing */}
      <div className="mt-3 rounded-card border border-line bg-surface p-3">
        <div className="flex items-start gap-3.5">
          <ProductTile product={{ ...product, categorySlug: product.categorySlug }} size={54} />
          <div className="min-w-0 flex-1">
            <h2 className="text-headline font-semibold leading-snug">{product.name}</h2>
            <p className="mt-0.5 text-subhead text-label-3">
              {product.brand} · {product.unit}
            </p>
          </div>
        </div>

        {/* The identity keys the match is built on */}
        <dl className="mt-3.5 grid grid-cols-2 gap-2 border-t border-separator/50 pt-3">
          <div>
            <dt className="flex items-center gap-1 text-caption text-label-3">
              <ScanBarcode size={11} aria-hidden="true" /> Barcode
            </dt>
            <dd className="font-mono text-footnote text-label">{product.gtin ?? '—'}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-caption text-label-3">
              <Hash size={11} aria-hidden="true" /> Part number
            </dt>
            <dd className="font-mono text-footnote text-label">{product.mfrSku ?? '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Scan state, then the spread */}
      {scanning ? (
        <div className="mt-3 flex items-center gap-3 rounded-card border border-line bg-surface p-3">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand-600/25 border-t-brand-600" />
          <p className="text-subhead text-label-2">Checking {checked} vendors for this exact item…</p>
        </div>
      ) : offers.length > 1 ? (
        <div className="mt-3 rounded-card border border-line bg-surface p-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-caption font-medium uppercase tracking-[0.4px] text-label-3">
                Spread across {offers.length} vendors
              </p>
              <p className="tnum mt-1 text-title2 font-bold">
                {unitMoney(offers[0].unitPrice)}
                <span className="text-title3 font-medium text-label-3"> — </span>
                {unitMoney(offers[offers.length - 1].unitPrice)}
              </p>
              <p className="mt-0.5 text-footnote text-label-3">per unit</p>
            </div>
            {spread > 0 ? (
              <div className="text-right">
                <p className="tnum text-title3 font-bold text-ios-green">
                  {Math.round((spread / offers[offers.length - 1].unitPrice) * 100)}%
                </p>
                <p className="text-caption text-label-3">cheapest to dearest</p>
              </div>
            ) : null}
          </div>

          {accountBest && marketBest && accountBest.supplierId !== marketBest.supplierId ? (
            <p className="mt-3 border-t border-separator/50 pt-3 text-footnote text-label-2">
              Cheapest overall is <strong>{marketBest.supplierName}</strong>, where you have no
              account. Best you can order today is{' '}
              <strong>{accountBest.supplierName}</strong> at {money(accountBest.price)}.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="pb-1 pt-3">
        <SegmentedControl
          value={sort}
          onChange={setSort}
          options={[
            { value: 'unit', label: 'Unit price' },
            { value: 'account', label: 'Orderable' },
            { value: 'speed', label: 'Fastest' },
          ]}
        />
      </div>

      {/* Vendors that carry it */}
      <Section
        title={`Carries this item (${offers.length})`}
        footer="Unit price divides by pack size, so a box of 200 and a box of 50 compare honestly."
      >
        {offers.map((offer) => (
          <Row
            key={offer.supplierId}
            chevron={false}
            className={cn(!offer.inStock && 'opacity-45')}
            title={offer.supplierName}
            subtitle={
              offer.inStock
                ? `${offer.leadDays}d · their SKU ${offer.vendorSku ?? '—'}`
                : 'Out of stock'
            }
            trailing={
              <div className="text-right">
                <p className="tnum text-callout font-semibold">{money(offer.price)}</p>
                <p className="tnum text-caption text-label-3">
                  {unitMoney(offer.unitPrice)}/unit
                </p>
              </div>
            }
          >
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <VendorStatus hasAccount={offer.hasAccount} />
              <MatchBadge
                matchedBy={offer.matchedBy}
                onExplain={() => setExplain(offer.matchedBy)}
              />
              {offer.isMarketBest ? <Pill tone="good">Cheapest</Pill> : null}
            </span>
          </Row>
        ))}
      </Section>

      {/* Vendors that do not — stated, not omitted */}
      {nonCarriers.length > 0 ? (
        <Section
          title={`Does not carry it (${nonCarriers.length})`}
          footer="Checked and confirmed absent, so an empty result is never mistaken for an unchecked one."
        >
          {nonCarriers.map((v) => (
            <Row
              key={v.supplierId}
              chevron={false}
              className="opacity-70"
              leading={
                <SlashSquare size={15} className="text-label-3" strokeWidth={2} aria-hidden="true" />
              }
              title={v.supplierName}
              subtitle={v.reason}
            />
          ))}
        </Section>
      ) : null}

      <div className="mt-4 flex flex-col gap-2">
        {accountBest ? (
          <Button to="/orders/new" size="lg" className="w-full">
            Order from {accountBest.supplierName} · {money(accountBest.price)}
          </Button>
        ) : null}
        {marketBest && !marketBest.hasAccount ? (
          <Button to="/vendors?tab=new" variant="secondary" size="lg" className="w-full">
            Open a {marketBest.supplierName} account
          </Button>
        ) : null}
      </div>

      {/* How matching works */}
      <Sheet
        open={Boolean(explain)}
        onClose={() => setExplain(null)}
        title="How this was matched"
        detent="medium"
      >
        <div className="py-2">
          <p className="px-1 pb-3 text-subhead text-label-2">
            Every distributor renumbers the same product, so Dentin matches on manufacturer
            identity rather than on catalog numbers. The strongest key that resolves wins.
          </p>

          <Section>
            {Object.entries(MATCH_CONFIDENCE).map(([key, meta]) => {
              const Icon = MATCH_ICON[key] ?? CircleHelp
              return (
                <Row
                  key={key}
                  chevron={false}
                  className={explain === key ? 'bg-brand-600/8' : undefined}
                  leading={
                    <Icon
                      size={16}
                      className={meta.verified ? 'text-ios-blue' : 'text-ios-orange'}
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                  }
                  title={meta.label}
                  subtitle={meta.detail}
                  trailing={
                    meta.verified ? (
                      <Pill tone="info" icon={BadgeCheck}>
                        Verified
                      </Pill>
                    ) : (
                      <Pill tone="caution">Verify</Pill>
                    )
                  }
                />
              )
            })}
          </Section>

          <p className="px-1 pb-2 pt-4 text-footnote text-label-3">
            A likely match is a guess made on brand, description and pack size. Confirm the pack
            and formulation before you buy on price alone.
          </p>
        </div>
      </Sheet>
    </Screen>
  )
}
