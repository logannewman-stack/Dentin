import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  Clock,
  Minus,
  Plus,
  ShoppingCart,
  Sparkles,
  TrendingDown,
} from 'lucide-react'
import Screen from '@/components/ios/Screen'
import { Row, Section } from '@/components/ios/List'
import { Gauge, Pill, Stepper } from '@/components/ios/Controls'
import Button from '@/components/ios/Button'
import Sheet from '@/components/ios/Sheet'
import ProductTile from '@/components/ProductTile'
import { VendorStatus } from '@/components/VendorBadge'
import { useData } from '@/hooks/useData'
import {
  compareOffers,
  getInventoryItem,
  recordMovement,
  updateInventorySettings,
} from '@/lib/repository'
import { STOCK_STATUS, coverLabel, fullDate, money, qty, unitMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function ItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: item, loading } = useData(() => getInventoryItem(id), [id])
  const { data: offers } = useData(
    () => (item ? compareOffers(item.productId) : Promise.resolve([])),
    [item?.productId],
  )

  const [sheet, setSheet] = useState(null) // 'receive' | 'consume' | 'count' | 'settings'
  const [amount, setAmount] = useState(1)
  const [busy, setBusy] = useState(false)

  const [par, setPar] = useState(0)
  const [reorderPoint, setReorderPoint] = useState(0)

  if (loading || !item) {
    return (
      <Screen title="Item" largeTitle={false}>
        <div className="space-y-3 pt-4">
          <div className="skeleton h-28 rounded-card" />
          <div className="skeleton h-44 rounded-card" />
        </div>
      </Screen>
    )
  }

  const status = STOCK_STATUS[item.stockStatus]
  const best = (offers ?? []).find((o) => o.isBest)
  const marketBest = (offers ?? []).find((o) => o.isMarketBest)
  const inStockOffers = (offers ?? []).filter((o) => o.inStock)
  const worst = inStockOffers.length ? inStockOffers[inStockOffers.length - 1] : null
  const suggestedQty = Math.max(item.reorderQty, item.parLevel - item.onHand)

  // A cheaper price at a vendor you cannot order from is an opportunity, not
  // a saving — it is reported separately so the two never blur together.
  const unlockable =
    best && marketBest && !marketBest.hasAccount ? best.price - marketBest.price : 0

  const tone =
    item.stockStatus === 'out' ? 'critical' : item.stockStatus === 'ok' ? 'good' : 'warning'

  const openSheet = (kind) => {
    setAmount(kind === 'receive' ? item.reorderQty : kind === 'count' ? item.onHand : 1)
    if (kind === 'settings') {
      setPar(item.parLevel)
      setReorderPoint(item.reorderPoint)
    }
    setSheet(kind)
  }

  const submitMovement = async (type) => {
    setBusy(true)
    try {
      if (type === 'counted') {
        // A count sets an absolute figure; store the delta that gets there.
        const delta = amount - item.onHand
        await recordMovement({
          inventoryItemId: item.id,
          type: 'counted',
          quantity: delta,
          reason: `Counted ${amount} ${item.unit}`,
        })
      } else {
        await recordMovement({ inventoryItemId: item.id, type, quantity: amount })
      }
      setSheet(null)
    } finally {
      setBusy(false)
    }
  }

  const saveSettings = async () => {
    setBusy(true)
    try {
      await updateInventorySettings(item.id, { parLevel: par, reorderPoint })
      setSheet(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      title={item.productName}
      largeTitle={false}
      leading={
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="press flex items-center gap-0.5 pl-1 text-brand-600 dark:text-brand-400"
        >
          <ChevronLeft size={24} strokeWidth={2.2} />
          <span className="text-body">Back</span>
        </button>
      }
    >
      {/* Identity + stock */}
      <div className="mt-3 rounded-card bg-surface p-4">
        <div className="flex items-start gap-3.5">
          <ProductTile product={item} size={64} imageUrl={item.imageUrl} />
          <div className="min-w-0 flex-1">
            <h2 className="text-headline font-semibold leading-snug">{item.productName}</h2>
            <p className="mt-0.5 text-subhead text-label-3">
              {item.brand} · {item.unit}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Pill tone={tone}>{status.label}</Pill>
              {item.daysOfCover != null ? (
                <Pill tone="quiet" icon={Clock}>
                  {coverLabel(item.daysOfCover)}
                </Pill>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 border-t border-separator/50 pt-4">
          <Gauge value={item.pctOfPar ?? 0} size={58} stroke={5} tone={tone} />
          <div className="flex-1">
            <p className="tnum text-title1 font-bold leading-none">
              {qty(item.onHand)}
              <span className="text-title3 font-medium text-label-3"> / {qty(item.parLevel)}</span>
            </p>
            <p className="mt-1 text-footnote text-label-3">
              on hand vs. par · reorder at {qty(item.reorderPoint)}
            </p>
          </div>
        </div>

        {/* Fast paths a clinician actually uses mid-day */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button variant="secondary" size="sm" onClick={() => openSheet('consume')} icon={Minus}>
            Use
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openSheet('receive')} icon={Plus}>
            Receive
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openSheet('count')} icon={Check}>
            Count
          </Button>
        </div>
      </div>

      {/* The price engine */}
      {best ? (
        <>
          <div className="mt-3 overflow-hidden rounded-card bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} strokeWidth={2.4} aria-hidden="true" />
              <span className="text-caption font-semibold uppercase tracking-[0.4px] text-white/90">
                Best price you can order
              </span>
            </div>

            <div className="mt-2 flex items-end justify-between">
              <div>
                <p className="tnum text-large font-bold leading-none">{money(best.price)}</p>
                <p className="mt-1 text-footnote text-white/80">
                  {best.supplierName} · {unitMoney(best.unitPrice)} per {item.unit.replace(/^(box|bag|case|pack) of \d+$/, 'unit')}
                </p>
              </div>
              {worst && worst.unitPrice > best.unitPrice ? (
                <div className="text-right">
                  <p className="tnum text-title3 font-bold text-white">
                    −{money((worst.unitPrice - best.unitPrice) * suggestedQty * (best.packSize ?? 1))}
                  </p>
                  <p className="text-caption text-white/75">on a restock of {qty(suggestedQty)}</p>
                </div>
              ) : null}
            </div>

            <Button
              to="/orders/new"
              variant="secondary"
              className="mt-3.5 w-full !bg-white !text-brand-700"
              icon={ShoppingCart}
            >
              Add to order
            </Button>
          </div>

          {/* Money you cannot reach without opening an account */}
          {unlockable > 0.005 ? (
            <Link
              to="/vendors/compare"
              className="press mt-2.5 flex items-center gap-3 rounded-card p-3.5"
              style={{ background: 'rgb(var(--viz-2) / 0.12)' }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: 'rgb(var(--viz-2))' }}
                aria-hidden="true"
              >
                <Sparkles size={16} strokeWidth={2.6} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-subhead font-semibold text-label">
                  {marketBest.supplierName} is {money(unlockable)} cheaper
                </span>
                <span className="block text-caption text-label-3">
                  You have no account there — {money(unlockable * suggestedQty)} on this restock
                </span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-label-3" aria-hidden="true" />
            </Link>
          ) : null}

          <Section
            title={`Vendors carrying this (${offers.length})`}
            footer="Unit price normalizes pack sizes, so a box of 200 and a box of 50 compare honestly. Vendors marked NEW need an account opened before you can order."
            action={
              <Link
                to={`/price-check/${item.productId}`}
                className="press text-subhead font-medium text-brand-600 dark:text-brand-400"
              >
                Check all
              </Link>
            }
          >
            {offers.map((offer) => (
              <Row
                key={offer.supplierId}
                chevron={false}
                className={cn(!offer.inStock && 'opacity-45')}
                title={offer.supplierName}
                subtitle={
                  offer.inStock
                    ? `Ships in ${offer.leadDays} ${offer.leadDays === 1 ? 'day' : 'days'}`
                    : 'Out of stock'
                }
                leading={
                  <span
                    className={cn(
                      'flex h-[29px] w-[29px] items-center justify-center rounded-[7px] text-caption font-bold',
                      offer.isBest
                        ? 'bg-ios-green text-white'
                        : offer.hasAccount
                          ? 'bg-surface-2 text-label-2'
                          : 'text-white',
                    )}
                    style={
                      !offer.isBest && !offer.hasAccount
                        ? { background: 'rgb(var(--viz-2))' }
                        : undefined
                    }
                    aria-hidden="true"
                  >
                    {offer.isBest ? (
                      <TrendingDown size={15} strokeWidth={2.6} />
                    ) : (
                      offer.supplierName[0]
                    )}
                  </span>
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
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <VendorStatus hasAccount={offer.hasAccount} />
                  {offer.isBest ? <Pill tone="good">Best you can order</Pill> : null}
                  {offer.isMarketBest && !offer.hasAccount ? (
                    <Pill tone="quiet">Cheapest on the market</Pill>
                  ) : null}
                </span>
              </Row>
            ))}
          </Section>
        </>
      ) : null}

      {/* Where it lives + controls */}
      <Section title="Stock settings">
        <Row title="Location" detail={item.locationName} chevron={false} />
        <Row title="Bin" detail={item.bin ?? 'Not set'} chevron={false} />
        <Row
          title="Par level"
          detail={`${qty(item.parLevel)} ${item.unit}`}
          onClick={() => openSheet('settings')}
        />
        <Row
          title="Reorder point"
          detail={qty(item.reorderPoint)}
          onClick={() => openSheet('settings')}
        />
        <Row
          title="Barcode"
          detail={item.gtin ?? '—'}
          to={`/price-check/${item.productId}`}
        />
        <Row title="Last counted" detail={fullDate(item.lastCountedAt)} chevron={false} />
        {item.expiresAt ? (
          <Row
            title="Earliest expiry"
            detail={fullDate(item.expiresAt)}
            chevron={false}
            trailing={<Pill tone="warning">Lot tracked</Pill>}
          />
        ) : null}
      </Section>

      <Section>
        <Row
          title="Consumption"
          subtitle={
            item.dailyBurn > 0
              ? `${item.dailyBurn.toFixed(2)} ${item.unit} per day, trailing 30 days`
              : 'No consumption recorded in the last 30 days'
          }
          chevron={false}
        />
      </Section>

      {/* Movement sheets */}
      <Sheet
        open={sheet === 'receive' || sheet === 'consume' || sheet === 'count'}
        onClose={() => setSheet(null)}
        title={
          sheet === 'receive' ? 'Receive stock' : sheet === 'consume' ? 'Use stock' : 'Count stock'
        }
        detent="small"
        footer={
          <Button
            className="w-full"
            size="lg"
            loading={busy}
            onClick={() =>
              submitMovement(
                sheet === 'receive' ? 'received' : sheet === 'consume' ? 'consumed' : 'counted',
              )
            }
          >
            {sheet === 'receive'
              ? `Receive ${qty(amount)}`
              : sheet === 'consume'
                ? `Use ${qty(amount)}`
                : `Set count to ${qty(amount)}`}
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-1 py-6">
          <p className="text-subhead text-label-3">
            {sheet === 'count' ? 'What is actually on the shelf?' : `How many ${item.unit}?`}
          </p>
          <div className="py-4">
            <Stepper value={amount} onChange={setAmount} min={0} max={9999} />
          </div>
          <p className="text-footnote text-label-3">
            {sheet === 'count'
              ? `Currently recorded: ${qty(item.onHand)}`
              : `On hand after: ${qty(
                  sheet === 'receive' ? item.onHand + amount : Math.max(0, item.onHand - amount),
                )}`}
          </p>
        </div>
      </Sheet>

      {/* Par settings */}
      <Sheet
        open={sheet === 'settings'}
        onClose={() => setSheet(null)}
        title="Stock levels"
        detent="medium"
        footer={
          <Button className="w-full" size="lg" loading={busy} onClick={saveSettings}>
            Save
          </Button>
        }
      >
        <div className="space-y-5 py-4">
          <div className="rounded-card bg-surface p-4">
            <p className="text-headline font-semibold">Par level</p>
            <p className="mb-3 mt-0.5 text-footnote text-label-3">
              The quantity a restock brings you back up to.
            </p>
            <Stepper value={par} onChange={setPar} min={0} unit={item.unit} />
          </div>

          <div className="rounded-card bg-surface p-4">
            <p className="text-headline font-semibold">Reorder point</p>
            <p className="mb-3 mt-0.5 text-footnote text-label-3">
              Drop to this and Dentin alerts you.
              {item.dailyBurn > 0 && best
                ? ` At today's burn that is about ${Math.round(
                    reorderPoint / item.dailyBurn,
                  )} days of cover — ${best.leadDays} days of which is shipping.`
                : ''}
            </p>
            <Stepper value={reorderPoint} onChange={setReorderPoint} min={0} max={par || 9999} />
            {best && item.dailyBurn > 0 && reorderPoint / item.dailyBurn < best.leadDays ? (
              <p className="mt-3 flex items-start gap-1.5 text-footnote text-ios-orange">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                You will run out before the delivery lands. Consider at least{' '}
                {Math.ceil(best.leadDays * item.dailyBurn)}.
              </p>
            ) : null}
          </div>
        </div>
      </Sheet>
    </Screen>
  )
}
