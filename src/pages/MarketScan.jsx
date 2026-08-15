import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronLeft, PartyPopper, Sparkles, Truck } from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Section } from '@/components/ui/List'
import { EmptyState, Pill, SegmentedControl } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import ProductTile from '@/components/ProductTile'
import AddToOrder from '@/components/AddToOrder'
import { VendorStatus } from '@/components/VendorBadge'
import { useData } from '@/hooks/useData'
import { getPriceOpportunities } from '@/lib/repository'
import { money, qty, unitMoney } from '@/lib/format'

/**
 * One row of the scan, built as an explicit side-by-side rather than a table.
 *
 * A practice owner reads this as a sentence: "today I pay Darby this, the
 * market says this, the gap is worth that." Putting the two prices adjacent
 * with the delta on the end is what makes it legible on a phone.
 */
function OpportunityRow({ row }) {
  return (
    <div className="border-t border-separator/50 p-4 first:border-t-0">
      <div className="flex items-start gap-3">
        <ProductTile product={row} size={40} imageUrl={row.imageUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-callout font-semibold text-label">{row.productName}</p>
          <p className="truncate text-caption text-label-3">
            {row.brand} · restocking {qty(row.quantity)} {row.unit}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-stretch gap-2">
        {/* What you can buy today */}
        <div className="min-w-0 flex-1 rounded-[3px] bg-surface-2 p-2.5">
          <p className="truncate text-caption2 uppercase tracking-[0.4px] text-label-3">
            You pay today
          </p>
          <p className="tnum mt-0.5 text-callout font-semibold text-label">
            {money(row.accountPrice)}
          </p>
          <p className="truncate text-caption text-label-3">{row.accountSupplierName}</p>
        </div>

        <div className="flex items-center px-0.5 text-label-3" aria-hidden="true">
          <ArrowRight size={15} strokeWidth={2.4} />
        </div>

        {/* What the market says */}
        <div
          className="min-w-0 flex-1 rounded-[3px] p-2.5"
          style={{ background: 'rgb(var(--viz-2) / 0.12)' }}
        >
          <p
            className="truncate text-caption2 font-bold uppercase tracking-[0.4px]"
            style={{ color: 'rgb(var(--viz-2))' }}
          >
            New vendor
          </p>
          <p className="tnum mt-0.5 text-callout font-bold text-label">
            {money(row.marketPrice)}
          </p>
          <p className="truncate text-caption text-label-3">{row.marketSupplierName}</p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-caption text-label-3">
          <Truck size={11} aria-hidden="true" />
          {row.marketLeadDays}d · {unitMoney(row.marketUnitPrice)}/unit
        </span>
        <span className="tnum text-subhead font-bold" style={{ color: 'rgb(var(--viz-2))' }}>
          save {money(row.savingsPerOrder)}
          <span className="ml-1 font-medium text-label-3">
            ({Math.round(row.pctCheaper)}%)
          </span>
        </span>
      </div>

      {/* Act on it now — at the best price an existing account can place */}
      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-separator/50 pt-2.5">
        <AddToOrder
          productId={row.productId}
          productName={row.productName}
          supplierId={row.accountSupplierId}
          supplierName={row.accountSupplierName}
          unitPrice={row.accountPrice}
          quantity={row.quantity}
          label={`Add ${qty(row.quantity)} to order`}
        />
        <span className="min-w-0 truncate text-caption text-label-3">
          at {money(row.accountPrice)} · {row.accountSupplierName}
        </span>
      </div>
    </div>
  )
}

export default function MarketScan() {
  const navigate = useNavigate()
  const { data, loading } = useData(() => getPriceOpportunities(), [])
  const [vendorFilter, setVendorFilter] = useState('all')

  const rows = useMemo(() => {
    if (!data) return []
    return vendorFilter === 'all'
      ? data.rows
      : data.rows.filter((r) => r.marketSupplierId === vendorFilter)
  }, [data, vendorFilter])

  if (loading) {
    return (
      <Screen title="Competitive pricing" largeTitle={false}>
        <div className="space-y-3 pt-4">
          <div className="skeleton h-32 rounded-card" />
          <div className="skeleton h-64 rounded-card" />
        </div>
      </Screen>
    )
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

  if (!data?.rows.length) {
    return (
      <Screen title="Competitive pricing" largeTitle={false} leading={back}>
        <EmptyState
          icon={PartyPopper}
          title="You are already on the best price"
          body={`Across every tracked item, no vendor outside your ${data?.accountCount ?? 0} accounts beats what you can order today.`}
          action={<Button to="/orders/new">Build a restock</Button>}
        />
      </Screen>
    )
  }

  return (
    <Screen
      title="Competitive pricing"
      subtitle={`${data.rows.length} items across ${data.byVendor.length} vendors`}
      largeTitle={false}
      leading={back}
    >
      {/* The headline number */}
      <div
        className="mt-3 rounded-card p-5 text-white"
        style={{
          background:
            'linear-gradient(135deg, rgb(var(--viz-2)) 0%, rgb(var(--viz-2) / 0.8) 100%)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} strokeWidth={2.6} aria-hidden="true" />
          <span className="text-caption font-bold uppercase tracking-[0.5px]">
            Left on the table
          </span>
        </div>
        <p className="tnum mt-1.5 text-[40px] font-bold leading-[44px]">
          {money(data.totalSavings)}
        </p>
        <p className="mt-1.5 text-footnote text-white/90">
          on one full restock, if you could order from every vendor Dentin prices. You hold{' '}
          {data.accountCount} of {data.vendorCount} accounts.
        </p>
      </div>

      {/* Which account unlocks what */}
      <Section
        title="By vendor"
        footer="Opening one account usually captures most of this — the list is ordered by what each unlocks."
      >
        {data.byVendor.map((v) => (
          <button
            key={v.supplierId}
            type="button"
            onClick={() => setVendorFilter(v.supplierId)}
            className="row press w-full justify-between py-3"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-body text-label">{v.name}</span>
              <VendorStatus hasAccount={false} />
            </span>
            <span className="shrink-0 text-right">
              <span
                className="tnum block text-callout font-bold"
                style={{ color: 'rgb(var(--viz-2))' }}
              >
                {money(v.savings)}
              </span>
              <span className="block text-caption text-label-3">{v.items} items</span>
            </span>
          </button>
        ))}
      </Section>

      <div className="pb-2 pt-4">
        <SegmentedControl
          value={vendorFilter}
          onChange={setVendorFilter}
          options={[
            { value: 'all', label: 'All', count: data.rows.length },
            // Full vendor names — "Dental City" clipped to "Dental" reads as
            // a category, not a supplier.
            ...data.byVendor.slice(0, 2).map((v) => ({
              value: v.supplierId,
              label: v.name,
            })),
          ]}
        />
      </div>

      {/* Item-by-item */}
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {rows.map((row) => (
          <OpportunityRow key={row.inventoryItemId} row={row} />
        ))}
      </div>

      <p className="px-1 pb-1 pt-3 text-footnote text-label-3">
        Prices compare like for like on pack size. Savings assume a full restock to par at
        today&apos;s quoted prices; shipping thresholds are applied when you build the order.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <Button to="/vendors" size="lg" className="w-full">
          Add a vendor account
        </Button>
        <Button to="/orders/new" variant="secondary" size="lg" className="w-full">
          Build order from current accounts
        </Button>
      </div>
    </Screen>
  )
}
