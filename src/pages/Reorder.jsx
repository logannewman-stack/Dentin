import { useEffect, useMemo, useState } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Plus,
  RotateCcw,
  Scale,
  Sparkles,
  TrendingDown,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import BackButton from '@/components/ui/BackButton'
import { Row, Section } from '@/components/ui/List'
import { Pill, SearchField, SegmentedControl, Stepper } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import ProductTile from '@/components/ProductTile'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import {
  compareOffersBatch,
  createOrder,
  getBasketLandedAnalysis,
  getLastOrder,
  listCatalog,
  reorderSuggestions,
} from '@/lib/repository'
import { money, qty, relativeTime, unitMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Two procurement strategies, priced side by side:
 *
 *  split       — buy every line from whoever is cheapest. Lowest goods cost,
 *                but one shipment per supplier.
 *  consolidate — put the whole basket with the single supplier that can fill
 *                it for the least all-in, shipping included. Usually costs a
 *                little more on goods and saves on freight and receiving time.
 */
function priceBasket(lines, offersByProduct, vendorChoice = {}) {
  const split = { supplierGroups: new Map(), goods: 0, shipping: 0 }

  for (const line of lines) {
    // Default: the cheapest vendor the practice can order from today. A
    // cheaper quote behind an account application is not a basket this order
    // can use — unless the buyer explicitly picks that vendor for this line,
    // in which case any in-stock vendor is theirs to choose.
    const all = (offersByProduct[line.productId] ?? []).filter((o) => o.inStock)
    const offers = all.filter((o) => o.hasAccount)
    const chosen = vendorChoice[line.id]
      ? all.find((o) => o.supplierId === vendorChoice[line.id])
      : null
    const best = chosen ?? offers[0]
    if (!best) continue
    const cost = best.price * line.quantity
    split.goods += cost

    const group = split.supplierGroups.get(best.supplierId) ?? {
      supplierId: best.supplierId,
      supplierName: best.supplierName,
      lines: [],
      goods: 0,
      shipFee: best.shipFee ?? 0,
      freeShipOver: best.freeShipOver ?? 0,
    }
    group.lines.push({ ...line, offer: best, cost })
    group.goods += cost
    split.supplierGroups.set(best.supplierId, group)
  }

  for (const g of split.supplierGroups.values()) {
    g.shipping = g.freeShipOver > 0 && g.goods >= g.freeShipOver ? 0 : g.shipFee
    split.shipping += g.shipping
  }
  split.total = split.goods + split.shipping

  // Every supplier that can fill the entire basket, priced all-in.
  const candidates = new Map()
  for (const line of lines) {
    for (const offer of offersByProduct[line.productId] ?? []) {
      if (!offer.inStock || !offer.hasAccount) continue
      const c = candidates.get(offer.supplierId) ?? {
        supplierId: offer.supplierId,
        supplierName: offer.supplierName,
        lines: [],
        goods: 0,
        shipFee: offer.shipFee ?? 0,
        freeShipOver: offer.freeShipOver ?? 0,
        filled: 0,
      }
      c.lines.push({ ...line, offer, cost: offer.price * line.quantity })
      c.goods += offer.price * line.quantity
      c.filled += 1
      candidates.set(offer.supplierId, c)
    }
  }

  const complete = [...candidates.values()].filter((c) => c.filled === lines.length)
  for (const c of complete) {
    c.shipping = c.freeShipOver > 0 && c.goods >= c.freeShipOver ? 0 : c.shipFee
    c.total = c.goods + c.shipping
  }
  const consolidate = complete.sort((a, b) => a.total - b.total)[0] ?? null

  return { split, consolidate }
}

export default function Reorder() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: suggestions, loading } = useData(() => reorderSuggestions(), [])

  // Everything orderable, not just what is already tracked — a practice that
  // has counted nothing yet still needs to be able to buy gloves today.
  const { data: catalog } = useData(() => listCatalog(), [])
  const { data: lastOrder } = useData(() => getLastOrder(), [])
  const [repeated, setRepeated] = useState(false)

  const [selected, setSelected] = useState({})
  const [quantities, setQuantities] = useState({})
  // Catalog additions: productId → quantity, for things not tracked yet.
  const [extras, setExtras] = useState({})
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 250) // Debounce search input to reduce re-renders
  // Per-line vendor overrides: line id → supplierId the buyer picked.
  const [vendorChoice, setVendorChoice] = useState({})
  const [strategy, setStrategy] = useState('split')
  const [offersByProduct, setOffers] = useState({})
  const [pricingLoading, setPricingLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [placing, setPlacing] = useState(false)
  const [placed, setPlaced] = useState(null)

  // Seed selection with everything that needs attention.
  useEffect(() => {
    if (!suggestions) return
    setSelected(Object.fromEntries(suggestions.map((s) => [s.id, true])))
    setQuantities(Object.fromEntries(suggestions.map((s) => [s.id, Math.max(1, s.suggestedQty)])))
  }, [suggestions])

  // Price only what is actually on the order — pulling every vendor's price
  // for the whole catalog would be a lot of work nobody asked for.
  const pricedIds = useMemo(() => {
    const ids = new Set()
    for (const s of suggestions ?? []) if (selected[s.id]) ids.add(s.productId)
    for (const pid of Object.keys(extras)) ids.add(pid)
    return [...ids]
  }, [suggestions, selected, extras])
  const pricedKey = pricedIds.join(',')

  useEffect(() => {
    if (!pricedIds.length) {
      setPricingLoading(false)
      return undefined
    }
    let cancelled = false
    setPricingLoading(true)
    compareOffersBatch(pricedIds).then((offersByProductId) => {
      if (!cancelled) {
        setOffers((prev) => ({ ...prev, ...offersByProductId }))
        setPricingLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setPricingLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricedKey])

  const lines = useMemo(() => {
    const fromStock = (suggestions ?? [])
      .filter((s) => selected[s.id])
      .map((s) => ({ ...s, quantity: quantities[s.id] ?? s.suggestedQty }))
    const tracked = new Set(fromStock.map((l) => l.productId))
    const fromCatalog = Object.entries(extras)
      .filter(([pid]) => !tracked.has(pid))
      .map(([pid, quantity]) => {
        const p = (catalog ?? []).find((c) => c.productId === pid)
        return {
          id: `add-${pid}`,
          productId: pid,
          productName: p?.productName ?? pid,
          brand: p?.brand,
          unit: p?.unit,
          imageUrl: p?.imageUrl,
          parLevel: 0,
          onHand: 0,
          quantity,
        }
      })
    return [...fromStock, ...fromCatalog]
  }, [suggestions, selected, quantities, extras, catalog])

  /** Load last time's basket into this one, still fully editable. */
  const repeatLastOrder = () => {
    if (!lastOrder?.lines?.length) return
    const bySuggestion = new Map((suggestions ?? []).map((s) => [s.productId, s]))
    const nextExtras = {}
    const nextSelected = {}
    const nextQuantities = {}
    for (const line of lastOrder.lines) {
      const match = bySuggestion.get(line.productId)
      if (match) {
        // Already tracked and on the suggestion list — reuse that row so the
        // par context stays visible rather than duplicating the line.
        nextSelected[match.id] = true
        nextQuantities[match.id] = line.quantity
      } else {
        nextExtras[line.productId] = line.quantity
      }
    }
    setSelected((prev) => ({ ...prev, ...nextSelected }))
    setQuantities((prev) => ({ ...prev, ...nextQuantities }))
    setExtras((prev) => ({ ...prev, ...nextExtras }))
    setRepeated(true)
    toast({
      title: `${lastOrder.reference} loaded`,
      body: `${lastOrder.lines.length} item${
        lastOrder.lines.length === 1 ? '' : 's'
      } — change any quantity or vendor before you create the PO.`,
    })
  }

  // The orderable catalog, filtered and grouped by first letter.
  const browse = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    const rows = (catalog ?? [])
      .filter(
        (p) =>
          !q ||
          p.productName.toLowerCase().includes(q) ||
          (p.brand ?? '').toLowerCase().includes(q) ||
          (p.categoryName ?? '').toLowerCase().includes(q) ||
          (p.gtin ?? '').includes(q),
      )
      .sort((a, b) => a.productName.localeCompare(b.productName))
    const groups = new Map()
    for (const p of rows) {
      const letter = (p.productName[0] ?? '#').toUpperCase()
      if (!groups.has(letter)) groups.set(letter, [])
      groups.get(letter).push(p)
    }
    return { rows, groups: [...groups.entries()] }
  }, [catalog, debouncedQuery])

  const pricing = useMemo(
    () => (lines.length ? priceBasket(lines, offersByProduct, vendorChoice) : null),
    [lines, offersByProduct, vendorChoice],
  )

  // The deeper truth: landed totals (shipping thresholds, minimums,
  // surcharges, tax) per vendor, plus the free-shipping verdict and flags.
  const [landed, setLanded] = useState(null)
  useEffect(() => {
    if (!lines.length) {
      setLanded(null)
      return undefined
    }
    let cancelled = false
    getBasketLandedAnalysis(
      lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        name: l.productName,
        quantity: l.quantity,
        onHand: l.onHand,
        dailyBurn: l.dailyBurn,
      })),
    ).then((r) => {
      if (!cancelled) setLanded(r)
    })
    return () => {
      cancelled = true
    }
  }, [lines])

  const active =
    strategy === 'split'
      ? pricing?.split
      : pricing?.consolidate
        ? { ...pricing.consolidate, supplierGroups: new Map([[pricing.consolidate.supplierId, pricing.consolidate]]) }
        : null

  // Savings measured against buying everything at the priciest supplier.
  const benchmark = useMemo(() => {
    let sum = 0
    for (const line of lines) {
      const offers = (offersByProduct[line.productId] ?? []).filter(
        (o) => o.inStock && o.hasAccount,
      )
      if (!offers.length) continue
      sum += offers[offers.length - 1].price * line.quantity
    }
    return sum
  }, [lines, offersByProduct])

  const savings = active ? Math.max(0, benchmark - active.goods) : 0

  // What this same basket would cost if every vendor were open to you.
  const unlockable = useMemo(() => {
    let sum = 0
    for (const line of lines) {
      const all = (offersByProduct[line.productId] ?? []).filter((o) => o.inStock)
      const mine = all.filter((o) => o.hasAccount)
      if (!all.length || !mine.length) continue
      const gap = mine[0].price - all[0].price
      if (gap > 0) sum += gap * line.quantity
    }
    return Number(sum.toFixed(2))
  }, [lines, offersByProduct])

  const place = async () => {
    if (!active) return
    setPlacing(true)
    try {
      const groups = [...active.supplierGroups.values()]
      const orders = []
      for (const g of groups) {
        const worstByProduct = Object.fromEntries(
          g.lines.map((l) => {
            const inStock = (offersByProduct[l.productId] ?? []).filter((o) => o.inStock)
            return [l.productId, inStock.length ? inStock[inStock.length - 1].unitPrice : null]
          }),
        )
        const order = await createOrder({
          supplierId: g.supplierId,
          supplierName: g.supplierName,
          locationId: g.lines[0]?.locationId,
          lines: g.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.offer.price,
            packSize: l.offer.packSize,
            benchmarkUnitPrice: worstByProduct[l.productId],
          })),
        })
        orders.push(order)
      }
      setPlaced({ count: orders.length, total: active.total, savings })
    } catch (e) {
      // Without this, a failed insert just stops the spinner and the buyer
      // has no idea whether the order went through.
      toast({ title: 'Order failed', body: e.message, tone: 'error' })
    } finally {
      setPlacing(false)
    }
  }

  if (loading) {
    return (
      <Screen title="Reorder" largeTitle={false}>
        <div className="space-y-3 pt-4">
          <div className="skeleton h-24 rounded-card" />
          <div className="skeleton h-64 rounded-card" />
        </div>
      </Screen>
    )
  }

  const groups = active ? [...active.supplierGroups.values()] : []

  return (
    <Screen
      title="Build order"
      subtitle={
        lines.length
          ? `${lines.length} item${lines.length === 1 ? '' : 's'} on this order`
          : 'Search or browse everything you can order'
      }
      largeTitle={false}
      leading={
        <BackButton />
      }
      toolbar={
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search everything you can order"
        />
      }
    >
      {/* Same as last time — how most restocking actually works */}
      {lastOrder?.lines?.length && !repeated && !query.trim() ? (
        <div className="mt-3 rounded-card bg-surface shadow-card p-3.5">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-brand-600/12 text-brand-700 dark:text-brand-400"
              aria-hidden="true"
            >
              <RotateCcw size={17} strokeWidth={2.1} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-callout font-semibold text-label">Reorder your last order</p>
              <p className="mt-0.5 text-footnote text-label-3">
                {lastOrder.reference} · {lastOrder.supplierName} · {lastOrder.lines.length} item
                {lastOrder.lines.length === 1 ? '' : 's'}
                {lastOrder.total ? ` · ${money(lastOrder.total)}` : ''}
                {lastOrder.placedAt ? ` · ${relativeTime(lastOrder.placedAt)}` : ''}
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex gap-2">
            <Button size="md" className="flex-1" icon={RotateCcw} onClick={repeatLastOrder}>
              Load these items
            </Button>
            <Button size="md" variant="secondary" to={`/orders/${lastOrder.id}`}>
              View it
            </Button>
          </div>
          <p className="mt-2 text-caption text-label-3">
            Everything stays editable — quantities, vendors, and what is on it.
          </p>
        </div>
      ) : null}

      {/* Strategy — only meaningful once something is on the order */}
      {lines.length ? (
        <div className="pb-1 pt-3">
          <SegmentedControl
            value={strategy}
            onChange={setStrategy}
            options={[
              { value: 'split', label: 'Lowest price' },
              { value: 'consolidate', label: 'Fewest shipments' },
            ]}
          />
        </div>
      ) : null}

      {pricing && !pricing.consolidate && strategy === 'consolidate' ? (
        <p className="px-1 pt-2 text-footnote text-ios-orange">
          No single supplier stocks every item on this list. Switch back to lowest price to split
          the order.
        </p>
      ) : null}

      {/* Basket summary */}
      {active || pricingLoading ? (
        <div className="mt-3 rounded-card bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
          {pricingLoading ? (
            <div className="flex items-center gap-2.5">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <p className="text-body text-white/90">Pricing your order...</p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-caption font-semibold uppercase tracking-[0.4px] text-white/85">
                    {strategy === 'split'
                      ? `${groups.length} ${groups.length === 1 ? 'shipment' : 'shipments'}`
                      : active.supplierName}
                  </p>
                  <p className="tnum mt-1 text-large font-bold leading-none">{money(active.total)}</p>
                  <p className="mt-1.5 text-footnote text-white/80">
                    {money(active.goods)} goods + {money(active.shipping)} shipping
                  </p>
                </div>
            {savings > 0 ? (
              <div className="text-right">
                <div className="flex items-center justify-end gap-1 text-white">
                  <TrendingDown size={15} strokeWidth={2.6} />
                  <span className="tnum text-title3 font-bold">{money(savings)}</span>
                </div>
                <p className="text-caption text-white/75">below list price</p>
              </div>
            ) : null}
          </div>

          {/* Strategy trade-off, priced honestly */}
          {pricing.consolidate && pricing.split ? (
            <p className="mt-3 border-t border-white/20 pt-3 text-footnote text-white/85">
              {strategy === 'split' ? (
                <>
                  Consolidating with {pricing.consolidate.supplierName} would cost{' '}
                  {money(pricing.consolidate.total - pricing.split.total)} more but arrive in one
                  delivery.
                </>
              ) : (
                <>
                  Splitting across {pricing.split.supplierGroups.size} suppliers would save{' '}
                  {money(pricing.consolidate.total - pricing.split.total)} across{' '}
                  {pricing.split.supplierGroups.size} deliveries.
                </>
              )}
            </p>
          ) : null}

          <Button
            className="mt-3.5 w-full !bg-white !text-brand-700"
            size="md"
            loading={placing}
            disabled={!lines.length}
            onClick={place}
          >
            {strategy === 'split' && groups.length > 1
              ? `Create ${groups.length} purchase orders`
              : 'Create the purchase order'}
          </Button>
          {/* Say it before the tap, not after: Dentin writes the PO, the
              practice places it on their own vendor account. */}
              <p className="mt-2 text-center text-caption text-white/75">
                Dentin writes and prices the PO — you place it with{' '}
                {groups.length === 1 ? groups[0].supplierName : 'each vendor'} on your own account,
                then check it in when it lands.
              </p>
            </>
          )}
        </div>
      ) : null}

      {/* Landed cost: the whole basket priced all-in per vendor, so "free
          shipping" only wins when the landed math says it does */}
      {landed?.winner ? (
        <Section
          title="Landed cost, vendor by vendor"
          footer={`Landed = goods + shipping + surcharges ${
            landed.tax?.exempt
              ? '(practice is tax-exempt)'
              : `+ ${(100 * (landed.tax?.rate ?? 0)).toFixed(2).replace(/\.?0+$/, '')}% tax${
                  landed.tax?.taxShipping ? ' incl. shipping' : ''
                }`
          }, from your accounts only. Each row prices the whole basket at one vendor.`}
        >
          {landed.vendors.map((v) => (
            <Row
              key={v.vendorId}
              chevron={false}
              className={cn(!v.eligible && 'opacity-45')}
              title={v.vendorName}
              subtitle={
                v.eligible
                  ? `${money(v.subtotal)} goods · ${
                      v.shipping === 0 ? 'free ship' : `${money(v.shipping)} ship`
                    } · ${money(v.tax)} tax · ${v.leadDays}d`
                  : v.ineligibleReason
              }
              trailing={
                v.eligible ? (
                  <div className="text-right">
                    <p className="tnum text-callout font-semibold">{money(v.landedTotal)}</p>
                    {v.vendorId === landed.winner.vendorId ? (
                      <Pill tone="good">Lowest landed</Pill>
                    ) : v.shipsFree ? (
                      <Pill tone="quiet">Ships free</Pill>
                    ) : null}
                  </div>
                ) : (
                  <Pill tone="quiet">Ineligible</Pill>
                )
              }
            />
          ))}

          <div className="row block py-2.5">
            <p className="text-footnote text-label-2">
              <Scale size={13} className="mr-1 inline-block align-[-2px]" aria-hidden="true" />
              {landed.trueSavings != null ? (
                <>
                  <b>{landed.winner.vendorName}</b> wins by{' '}
                  <b className="tnum">{money(landed.trueSavings)}</b> (
                  {landed.trueSavingsPct}%) over {landed.runnerUp.vendorName}, landed to landed.
                </>
              ) : (
                <>
                  <b>{landed.winner.vendorName}</b> is the only vendor that can take this whole
                  basket.
                </>
              )}{' '}
              {landed.freeShipDelta != null ? (
                <>
                  {landed.freeShipVendor.vendorName} ships free but lands{' '}
                  <b className="tnum">{money(landed.freeShipDelta)}</b> higher — the freight is
                  hiding in the prices, not the shipping line.
                </>
              ) : landed.winner.shipsFree ? (
                <>Free shipping confirmed as the real winner, all-in.</>
              ) : null}
            </p>
          </div>

          {landed.flags.map((f) => (
            <div key={f.kind + (f.vendorId ?? '')} className="row block py-2.5">
              <p
                className={cn(
                  'text-footnote',
                  f.kind === 'lead-time' || (f.kind === 'padding' && !f.worthIt)
                    ? 'text-ios-orange'
                    : f.kind === 'split' || (f.kind === 'padding' && f.worthIt)
                      ? 'text-brand-700 dark:text-brand-400'
                      : 'text-label-2',
                )}
              >
                {f.message}
              </p>
            </div>
          ))}
        </Section>
      ) : null}

      {/* Priced from your accounts only — say so, and price the alternative */}
      {unlockable > 0.005 ? (
        <Link
          to="/vendors/compare"
          className="press mt-3 flex items-center gap-3 rounded-card p-3.5"
          style={{ background: 'rgb(var(--viz-2) / 0.12)' }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] text-white"
            style={{ background: 'rgb(var(--viz-2))' }}
            aria-hidden="true"
          >
            <Sparkles size={16} strokeWidth={2.6} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-subhead font-semibold text-label">
              {money(unlockable)} more available elsewhere
            </span>
            <span className="block text-caption text-label-3">
              Priced from your accounts only — see which vendors beat them
            </span>
          </span>
          <ArrowRight size={16} className="shrink-0 text-label-3" aria-hidden="true" />
        </Link>
      ) : null}

      {/* Lines, grouped by who is filling them */}
      {groups.map((group) => (
        <Section
          key={group.supplierId}
          title={group.supplierName}
          footer={
            group.shipping === 0
              ? `Free shipping — basket clears ${money(group.freeShipOver)}`
              : `${money(group.shipping)} shipping · free over ${money(group.freeShipOver)}`
          }
        >
          {group.lines.map((line) => (
            <Row
              key={line.id}
              chevron={false}
              onClick={() => setEditing(line)}
              leading={<ProductTile product={line} size={40} imageUrl={line.imageUrl} />}
              title={line.productName}
              subtitle={`${qty(line.quantity)} × ${money(line.offer.price)} · ${unitMoney(
                line.offer.unitPrice,
              )}/unit`}
              trailing={
                <div className="text-right">
                  <p className="tnum text-callout font-semibold">{money(line.cost)}</p>
                  <p className="text-caption text-label-3">{line.offer.leadDays}d</p>
                </div>
              }
            />
          ))}
        </Section>
      ))}

      {/* Below par — the reason this screen usually gets opened */}
      {suggestions?.length ? (
        <Section
          title="Below par"
          footer="Tap to include or exclude an item from this order."
        >
          {suggestions.map((s) => {
          const on = Boolean(selected[s.id])
          return (
            <Row
              key={s.id}
              chevron={false}
              onClick={() => setSelected((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
              leading={
                <span
                  className={cn(
                    'flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border-2 transition-colors',
                    on ? 'border-brand-600 bg-brand-600 text-white' : 'border-separator',
                  )}
                  aria-hidden="true"
                >
                  {on ? <Check size={15} strokeWidth={3} /> : null}
                </span>
              }
              title={s.productName}
              subtitle={`${qty(s.onHand)} on hand · par ${qty(s.parLevel)}`}
              trailing={
                <Pill
                  tone={
                    s.stockStatus === 'out'
                      ? 'critical'
                      : s.stockStatus === 'low'
                        ? 'warning'
                        : 'caution'
                  }
                >
                  {qty(quantities[s.id] ?? s.suggestedQty)}
                </Pill>
              }
            />
            )
          })}
        </Section>
      ) : null}

      {/* Everything a practice can order, A to Z */}
      <Section
        title={query.trim() ? `Results · ${browse.rows.length}` : 'Everything you can order'}
        footer={
          query.trim()
            ? undefined
            : 'The full catalog, alphabetically. Add anything — it does not have to be tracked first.'
        }
      >
        {browse.rows.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-subhead text-label-2">
              Nothing matches “{query.trim()}”.
            </p>
            <p className="mt-1 text-footnote text-label-3">
              Try a brand or a category — or scan the barcode to add it.
            </p>
          </div>
        ) : (
          browse.groups.map(([letter, items]) => (
            <div key={letter}>
              <p className="border-b border-line bg-surface-2/60 px-3 py-1 text-caption font-bold uppercase tracking-[0.06em] text-label-3">
                {letter}
              </p>
              {items.map((p) => {
                const onOrder = extras[p.productId]
                return (
                  <Row
                    key={p.productId}
                    chevron={false}
                    leading={<ProductTile product={p} size={36} imageUrl={p.imageUrl} />}
                    title={p.productName}
                    subtitle={[p.brand, p.unit, p.categoryName].filter(Boolean).join(' · ')}
                    trailing={
                      onOrder ? (
                        <Stepper
                          value={onOrder}
                          onChange={(v) =>
                            setExtras((prev) => {
                              if (v <= 0) {
                                const next = { ...prev }
                                delete next[p.productId]
                                return next
                              }
                              return { ...prev, [p.productId]: v }
                            })
                          }
                          min={0}
                          max={999}
                        />
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={Plus}
                          onClick={() => setExtras((prev) => ({ ...prev, [p.productId]: 1 }))}
                        >
                          Add
                        </Button>
                      )
                    }
                  />
                )
              })}
            </div>
          ))
        )}
      </Section>

      {/* Line editor: how many, and from whom */}
      <Sheet
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.productName ?? ''}
        footer={
          <Button className="w-full" size="lg" onClick={() => setEditing(null)}>
            Done
          </Button>
        }
      >
        {editing ? (
          <div className="px-4 pb-2">
            <div className="flex flex-col items-center gap-1 pb-4 pt-5">
              <p className="text-subhead text-label-3">How many {editing.unit}?</p>
              <div className="py-3">
                <Stepper
                  value={quantities[editing.id] ?? editing.suggestedQty}
                  onChange={(v) => setQuantities((prev) => ({ ...prev, [editing.id]: v }))}
                  min={1}
                  max={999}
                />
              </div>
              <p className="text-footnote text-label-3">
                Par is {qty(editing.parLevel)} · {qty(editing.onHand)} on hand
              </p>
            </div>

            {/* Every vendor that stocks it — the buyer's pick beats the default */}
            <p className="section-label">Buy from</p>
            <div className="overflow-hidden rounded-card bg-surface shadow-card">
              {(offersByProduct[editing.productId] ?? [])
                .filter((o) => o.inStock)
                .map((o) => {
                  const defaultOffer = (offersByProduct[editing.productId] ?? []).find(
                    (x) => x.inStock && x.hasAccount,
                  )
                  const chosenId = vendorChoice[editing.id] ?? defaultOffer?.supplierId
                  const on = o.supplierId === chosenId
                  return (
                    <button
                      key={o.supplierId}
                      type="button"
                      onClick={() =>
                        setVendorChoice((prev) => ({ ...prev, [editing.id]: o.supplierId }))
                      }
                      className="row press w-full gap-3 py-2.5 text-left"
                    >
                      <span
                        className={cn(
                          'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2',
                          on ? 'border-brand-600 bg-brand-600 text-white' : 'border-separator',
                        )}
                        aria-hidden="true"
                      >
                        {on ? <Check size={13} strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-label">
                          {o.supplierName}
                        </span>
                        <span className="block truncate text-caption text-label-3">
                          {o.hasAccount
                            ? o.isContractPrice
                              ? 'Your contract price'
                              : 'Your account'
                            : 'No account — charged at checkout'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="tnum block text-callout font-semibold text-label">
                          {money(o.price)}
                        </span>
                        <span className="block text-caption text-label-3">
                          {unitMoney(o.unitPrice)}/unit · {o.leadDays}d
                        </span>
                      </span>
                    </button>
                  )
                })}
            </div>
            {strategy === 'consolidate' ? (
              <p className="px-1 pt-2 text-footnote text-label-3">
                Vendor picks apply to the Lowest price strategy — Fewest shipments always uses
                one vendor for everything.
              </p>
            ) : null}
          </div>
        ) : null}
      </Sheet>

      {/* Success */}
      <Sheet
        open={Boolean(placed)}
        onClose={() => {
          setPlaced(null)
          navigate('/orders')
        }}
        title="Order placed"
        detent="small"
        footer={
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              setPlaced(null)
              navigate('/orders')
            }}
          >
            View orders
          </Button>
        }
      >
        {placed ? (
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-[3px] bg-ios-green/12 text-ios-green">
              <Check size={30} strokeWidth={2.6} />
            </span>
            <h3 className="text-title3 font-semibold">
              {placed.count === 1
                ? 'Purchase order ready'
                : `${placed.count} purchase orders ready`}
            </h3>
            <p className="mt-1.5 text-subhead text-label-3">
              {money(placed.total)} total
              {placed.savings > 0 ? ` · ${money(placed.savings)} below list` : ''}
            </p>
            {/* Never let anyone leave this sheet thinking gloves are on a truck. */}
            <p className="mt-3 text-footnote text-label-2">
              Priced and written up — but not sent yet. Open{' '}
              {placed.count === 1 ? 'it' : 'each one'} to copy the PO into your vendor&apos;s
              portal or call it in, then mark it as placed.
            </p>
          </div>
        ) : null}
      </Sheet>
    </Screen>
  )
}
