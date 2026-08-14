/**
 * The single data seam.
 *
 * Every screen talks to this module and never to Supabase directly, so the
 * app behaves identically whether it is backed by a live project or by the
 * bundled demo practice.
 */
import { isSupabaseConfigured, supabase } from './supabase'
import {
  ASSETS,
  CATEGORIES,
  CATEGORY_SPEND,
  LOCATIONS,
  ORDERS,
  ORDER_ITEMS,
  PRACTICE,
  PRODUCTS,
  SPEND_HISTORY,
  SUPPLIERS,
  SUPPLIER_SPEND,
  TOP_ITEMS,
  buildInventory,
  offersFor,
  productByGtin,
  productById,
} from './demoData'

export const isDemo = !isSupabaseConfigured

// --- demo store -------------------------------------------------------------
let demoInventory = null
let demoOrders = null
let demoPractice = null
const movements = []
const listeners = new Set()

function store() {
  if (!demoInventory) demoInventory = buildInventory()
  if (!demoPractice) demoPractice = { ...PRACTICE }
  if (!demoOrders) {
    // Totals are derived from the line items rather than stored alongside
    // them, so an order can never disagree with what is on it.
    demoOrders = ORDERS.map((o) => {
      const lines = ORDER_ITEMS.filter(([orderId]) => orderId === o.id)
      if (!lines.length) return { ...o }

      const subtotal = lines.reduce((sum, [, , quantity, unitPrice]) => sum + quantity * unitPrice, 0)
      const tax = subtotal * 0.0825
      return {
        ...o,
        subtotal: Number(subtotal.toFixed(2)),
        tax: Number(tax.toFixed(2)),
        total: Number((subtotal + tax + o.shipping).toFixed(2)),
        // Roughly what the same basket would have cost at the priciest supplier.
        savings: Number((subtotal * 0.163).toFixed(2)),
        itemCount: lines.length,
      }
    })
  }
  return { inventory: demoInventory, orders: demoOrders, practice: demoPractice }
}

function emit() {
  listeners.forEach((fn) => fn())
}

/** Subscribe to local mutations so screens re-read after a write. */
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function recomputeRow(row) {
  const { onHand, parLevel, reorderPoint, dailyBurn } = row
  row.stockStatus =
    onHand <= 0 ? 'out' : onHand <= reorderPoint ? 'low' : onHand < parLevel ? 'below_par' : 'ok'
  row.pctOfPar = parLevel > 0 ? Math.round((onHand / parLevel) * 100) : null
  row.daysOfCover = dailyBurn > 0 ? Math.round(onHand / dailyBurn) : null
  return row
}

// --- mapping ----------------------------------------------------------------
function mapInventoryRow(r) {
  return {
    id: r.id,
    productId: r.product_id,
    locationId: r.location_id,
    locationName: r.location_name,
    productName: r.product_name,
    brand: r.brand,
    unit: r.unit,
    gtin: r.gtin,
    imageUrl: r.image_url,
    categorySlug: r.category_slug,
    categoryName: r.category_name,
    isEquipment: r.is_equipment,
    onHand: Number(r.on_hand),
    parLevel: Number(r.par_level),
    reorderPoint: Number(r.reorder_point),
    reorderQty: Number(r.reorder_qty),
    bin: r.bin,
    dailyBurn: Number(r.daily_burn ?? 0),
    stockStatus: r.stock_status,
    pctOfPar: r.pct_of_par == null ? null : Number(r.pct_of_par),
    daysOfCover: r.days_of_cover == null ? null : Number(r.days_of_cover),
    bestUnitPrice: r.best_unit_price == null ? null : Number(r.best_unit_price),
    bestPrice: r.best_price == null ? null : Number(r.best_price),
    bestSupplierId: r.best_supplier_id,
    bestSupplierName: r.best_supplier_name,
    bestLeadDays: r.best_lead_days,
    maxUnitPrice: r.max_unit_price == null ? null : Number(r.max_unit_price),
    offerCount: Number(r.offer_count ?? 0),
    lastCountedAt: r.last_counted_at,
    expiresAt: null,
  }
}

// --- reads ------------------------------------------------------------------
export async function listInventory({ locationId, status, query, category } = {}) {
  let rows

  if (isDemo) {
    rows = store().inventory
  } else {
    let q = supabase.from('v_inventory_status').select('*')
    if (locationId) q = q.eq('location_id', locationId)
    const { data, error } = await q
    if (error) throw error
    rows = data.map(mapInventoryRow)
  }

  let out = rows
  if (isDemo && locationId) out = out.filter((r) => r.locationId === locationId)
  if (category) out = out.filter((r) => r.categorySlug === category)
  if (status === 'attention') {
    out = out.filter((r) => ['out', 'low', 'below_par'].includes(r.stockStatus))
  } else if (status && status !== 'all') {
    out = out.filter((r) => r.stockStatus === status)
  }

  if (query) {
    const q = query.toLowerCase()
    out = out.filter(
      (r) =>
        r.productName.toLowerCase().includes(q) ||
        (r.brand ?? '').toLowerCase().includes(q) ||
        (r.bin ?? '').toLowerCase().includes(q) ||
        (r.gtin ?? '').includes(q),
    )
  }

  const rank = { out: 0, low: 1, below_par: 2, ok: 3 }
  return [...out].sort(
    (a, b) => rank[a.stockStatus] - rank[b.stockStatus] || a.productName.localeCompare(b.productName),
  )
}

export async function getInventoryItem(id) {
  if (isDemo) return store().inventory.find((r) => r.id === id) ?? null
  const { data, error } = await supabase.from('v_inventory_status').select('*').eq('id', id).single()
  if (error) throw error
  return mapInventoryRow(data)
}

export async function resolveGtin(gtin) {
  const code = String(gtin).trim()

  if (isDemo) {
    const product = productByGtin(code)
    if (!product) return { matched: false, gtin: code }
    const item = store().inventory.find((r) => r.productId === product.id)
    return {
      matched: true,
      gtin: code,
      productId: product.id,
      name: product.name,
      brand: product.brand,
      unit: product.unit,
      categoryName: product.category,
      inventoryItemId: item?.id ?? null,
      onHand: item?.onHand ?? 0,
      inInventory: Boolean(item),
    }
  }

  const { data, error } = await supabase.rpc('resolve_gtin', { p_gtin: code })
  if (error) throw error
  const row = data?.[0]
  if (!row) return { matched: false, gtin: code }
  return {
    matched: true,
    gtin: code,
    productId: row.product_id,
    name: row.name,
    brand: row.brand,
    unit: row.unit,
    categoryName: row.category_name,
    inventoryItemId: row.inventory_item_id,
    onHand: Number(row.on_hand ?? 0),
    inInventory: row.in_inventory,
  }
}

export async function compareOffers(productId) {
  if (isDemo) {
    const offers = offersFor(productId)
    const inStock = offers.filter((o) => o.inStock)
    const worst = inStock.length ? inStock[inStock.length - 1].unitPrice : null
    return offers.map((o, i) => ({
      ...o,
      isBest: o.inStock && i === 0,
      savingsVsWorst: worst != null ? worst - o.unitPrice : 0,
    }))
  }

  const { data, error } = await supabase.rpc('compare_offers', { p_product_id: productId })
  if (error) throw error
  return data.map((o) => ({
    offerId: o.offer_id,
    supplierId: o.supplier_id,
    supplierName: o.supplier_name,
    supplierLogo: o.supplier_logo,
    price: Number(o.price),
    packSize: o.pack_size,
    unitPrice: Number(o.unit_price),
    leadDays: o.lead_days,
    inStock: o.in_stock,
    productUrl: o.product_url,
    isBest: o.is_best,
    savingsVsWorst: Number(o.savings_vs_worst ?? 0),
  }))
}

export async function reorderSuggestions(locationId) {
  const rows = await listInventory({ locationId, status: 'attention' })
  return rows.map((r) => ({
    ...r,
    suggestedQty: Math.max(r.reorderQty, r.parLevel - r.onHand),
    lineCost: Math.max(r.reorderQty, r.parLevel - r.onHand) * (r.bestUnitPrice ?? 0) * 1,
  }))
}

export async function listAlerts() {
  const rows = await listInventory()
  const alerts = []

  for (const r of rows) {
    if (r.stockStatus === 'out') {
      alerts.push({
        id: `out-${r.id}`,
        type: 'out_of_stock',
        severity: 'critical',
        title: `${r.productName} is out`,
        body: `${r.locationName} · ${r.bin ?? 'No bin set'}`,
        item: r,
        createdAt: new Date().toISOString(),
      })
    } else if (r.stockStatus === 'low') {
      alerts.push({
        id: `low-${r.id}`,
        type: 'low_stock',
        severity: 'warning',
        title: `${r.productName} hit its reorder point`,
        body:
          r.daysOfCover != null
            ? `About ${r.daysOfCover} days of cover left`
            : `${r.onHand} of ${r.parLevel} par`,
        item: r,
        createdAt: new Date().toISOString(),
      })
    }

    if (r.expiresAt) {
      const days = Math.round((new Date(r.expiresAt) - new Date()) / 86400000)
      if (days <= 60) {
        alerts.push({
          id: `exp-${r.id}`,
          type: days < 0 ? 'expired' : 'expiring',
          severity: days < 0 ? 'critical' : days <= 30 ? 'warning' : 'info',
          title: days < 0 ? `${r.productName} lot expired` : `${r.productName} expires soon`,
          body: days < 0 ? `${Math.abs(days)} days ago` : `In ${days} days`,
          item: r,
          createdAt: new Date().toISOString(),
        })
      }
    }
  }

  for (const a of ASSETS) {
    const days = Math.round((new Date(a.nextServiceAt) - new Date()) / 86400000)
    if (days <= 30) {
      alerts.push({
        id: `svc-${a.id}`,
        type: 'service_due',
        severity: days < 0 ? 'critical' : 'warning',
        title: days < 0 ? `${a.name} service overdue` : `${a.name} service due`,
        body: days < 0 ? `${Math.abs(days)} days overdue` : `In ${days} days`,
        asset: a,
        createdAt: new Date().toISOString(),
      })
    }
  }

  const order = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => order[a.severity] - order[b.severity])
}

export async function listLocations() {
  if (isDemo) return LOCATIONS
  const { data, error } = await supabase.from('locations').select('*').order('name')
  if (error) throw error
  return data.map((l) => ({
    id: l.id,
    name: l.name,
    operatories: l.operatories,
    isPrimary: l.is_primary,
  }))
}

export async function listAssets() {
  if (isDemo) return ASSETS
  const { data, error } = await supabase.from('assets').select('*').order('next_service_at')
  if (error) throw error
  return data.map((a) => ({
    id: a.id,
    name: a.name,
    manufacturer: a.manufacturer,
    model: a.model,
    serialNumber: a.serial_number,
    locationId: a.location_id,
    status: a.status,
    purchasedAt: a.purchased_at,
    purchasePrice: a.purchase_price,
    warrantyExpiresAt: a.warranty_expires_at,
    nextServiceAt: a.next_service_at,
    lastServicedAt: a.last_serviced_at,
  }))
}

export async function listOrders() {
  if (isDemo) return store().orders
  const { data, error } = await supabase
    .from('orders')
    .select('*, suppliers(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((o) => ({
    id: o.id,
    reference: o.reference,
    supplierId: o.supplier_id,
    supplierName: o.suppliers?.name,
    locationId: o.location_id,
    status: o.status,
    subtotal: Number(o.subtotal),
    shipping: Number(o.shipping),
    tax: Number(o.tax),
    total: Number(o.total),
    savings: Number(o.savings),
    placedAt: o.placed_at,
    expectedAt: o.expected_at,
    receivedAt: o.received_at,
  }))
}

export async function getOrder(id) {
  if (isDemo) {
    const order = store().orders.find((o) => o.id === id)
    if (!order) return null

    const lines = ORDER_ITEMS.filter(([orderId]) => orderId === id).map(
      ([, sku, quantity, unitPrice, receivedQty]) => {
        const product = productById(sku)
        const item = store().inventory.find(
          (r) => r.productId === sku && r.locationId === order.locationId,
        )
        return {
          id: `${id}-${sku}`,
          productId: sku,
          inventoryItemId: item?.id ?? null,
          productName: product?.name ?? sku,
          brand: product?.brand,
          unit: product?.unit,
          categorySlug: product?.category,
          quantity,
          unitPrice,
          receivedQty,
          lineTotal: Number((quantity * unitPrice).toFixed(2)),
        }
      },
    )

    return { ...order, lines }
  }

  const { data, error } = await supabase
    .from('orders')
    .select('*, suppliers(name), order_items(*, products(name, brand, unit))')
    .eq('id', id)
    .single()
  if (error) throw error

  return {
    id: data.id,
    reference: data.reference,
    supplierId: data.supplier_id,
    supplierName: data.suppliers?.name,
    locationId: data.location_id,
    status: data.status,
    subtotal: Number(data.subtotal),
    shipping: Number(data.shipping),
    tax: Number(data.tax),
    total: Number(data.total),
    savings: Number(data.savings),
    placedAt: data.placed_at,
    expectedAt: data.expected_at,
    receivedAt: data.received_at,
    lines: (data.order_items ?? []).map((l) => ({
      id: l.id,
      productId: l.product_id,
      productName: l.products?.name,
      brand: l.products?.brand,
      unit: l.products?.unit,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unit_price),
      receivedQty: Number(l.received_qty),
      lineTotal: Number(l.line_total),
    })),
  }
}

/**
 * Check a delivery in. Each received line becomes a stock movement, so on-hand
 * stays derived from the ledger rather than being set directly.
 */
export async function receiveOrder(orderId, received) {
  if (isDemo) {
    const s = store()
    const order = s.orders.find((o) => o.id === orderId)
    if (!order) throw new Error('Order not found')

    for (const [lineId, qty] of Object.entries(received)) {
      if (!qty) continue
      const sku = lineId.replace(`${orderId}-`, '')
      const row = s.inventory.find(
        (r) => r.productId === sku && r.locationId === order.locationId,
      )
      if (!row) continue
      row.onHand += qty
      recomputeRow(row)
      movements.unshift({
        id: `mv-${movements.length + 1}`,
        inventoryItemId: row.id,
        type: 'received',
        quantity: qty,
        reason: `Received on ${order.reference}`,
        createdAt: new Date().toISOString(),
      })
    }

    order.status = 'received'
    order.receivedAt = new Date().toISOString()
    emit()
    return { ok: true }
  }

  const order = await getOrder(orderId)
  for (const line of order.lines) {
    const qty = received[line.id]
    if (!qty) continue
    const { data: item } = await supabase
      .from('inventory_items')
      .select('id')
      .eq('product_id', line.productId)
      .eq('location_id', order.locationId)
      .maybeSingle()
    if (!item) continue
    await supabase.rpc('record_movement', {
      p_inventory_item_id: item.id,
      p_type: 'received',
      p_quantity: qty,
      p_reason: `Received on ${order.reference ?? orderId}`,
    })
    await supabase
      .from('order_items')
      .update({ received_qty: line.receivedQty + qty })
      .eq('id', line.id)
  }

  const { error } = await supabase
    .from('orders')
    .update({ status: 'received', received_at: new Date().toISOString() })
    .eq('id', orderId)
  if (error) throw error
  return { ok: true }
}

/** The shared catalog, for adding new items to inventory. */
export async function listCatalog({ query, category } = {}) {
  if (isDemo) {
    const tracked = new Set(store().inventory.map((r) => r.productId))
    let out = PRODUCTS.map((p) => ({
      id: p.id,
      productId: p.id,
      productName: p.name,
      brand: p.brand,
      unit: p.unit,
      gtin: p.gtin,
      categorySlug: p.category,
      categoryName: CATEGORIES.find((c) => c.slug === p.category)?.name ?? '',
      isEquipment: p.isEquipment,
      tracked: tracked.has(p.id),
      bestUnitPrice: offersFor(p.id).find((o) => o.inStock)?.unitPrice ?? null,
      bestPrice: offersFor(p.id).find((o) => o.inStock)?.price ?? null,
      offerCount: offersFor(p.id).filter((o) => o.inStock).length,
    }))

    if (category) out = out.filter((p) => p.categorySlug === category)
    if (query) {
      const q = query.toLowerCase()
      out = out.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          (p.brand ?? '').toLowerCase().includes(q) ||
          (p.gtin ?? '').includes(q),
      )
    }
    return out.sort((a, b) => a.productName.localeCompare(b.productName))
  }

  let q = supabase
    .from('products')
    .select('id, name, brand, unit, gtin, is_equipment, categories(name, slug)')
    .limit(200)
  if (query) q = q.or(`name.ilike.%${query}%,brand.ilike.%${query}%`)
  const { data, error } = await q
  if (error) throw error

  return data.map((p) => ({
    id: p.id,
    productId: p.id,
    productName: p.name,
    brand: p.brand,
    unit: p.unit,
    gtin: p.gtin,
    categorySlug: p.categories?.slug,
    categoryName: p.categories?.name,
    isEquipment: p.is_equipment,
    tracked: false,
  }))
}

/** Start tracking a catalog product at a location. */
export async function addToInventory({ productId, locationId, parLevel, reorderPoint, onHand }) {
  if (isDemo) {
    const s = store()
    const product = productById(productId)
    if (!product) throw new Error('Product not found')

    const location = LOCATIONS.find((l) => l.id === locationId) ?? LOCATIONS[0]
    const offers = offersFor(productId).filter((o) => o.inStock)
    const best = offers[0] ?? null

    s.inventory.push(
      recomputeRow({
        id: `inv-${location.id}-${productId}`,
        productId,
        locationId: location.id,
        locationName: location.name,
        productName: product.name,
        brand: product.brand,
        unit: product.unit,
        gtin: product.gtin,
        categorySlug: product.category,
        categoryName: CATEGORIES.find((c) => c.slug === product.category)?.name ?? '',
        isEquipment: product.isEquipment,
        onHand: onHand ?? 0,
        parLevel: parLevel ?? 4,
        reorderPoint: reorderPoint ?? 2,
        reorderQty: Math.max(1, (parLevel ?? 4) - (onHand ?? 0)),
        bin: null,
        dailyBurn: 0,
        stockStatus: 'ok',
        pctOfPar: null,
        daysOfCover: null,
        bestUnitPrice: best?.unitPrice ?? null,
        bestPrice: best?.price ?? null,
        bestSupplierId: best?.supplierId ?? null,
        bestSupplierName: best?.supplierName ?? null,
        bestLeadDays: best?.leadDays ?? null,
        maxUnitPrice: offers.length ? offers[offers.length - 1].unitPrice : null,
        offerCount: offers.length,
        expiresAt: null,
        lastCountedAt: new Date().toISOString(),
      }),
    )
    emit()
    return { ok: true }
  }

  const { data: profile } = await supabase.from('profiles').select('practice_id').single()
  const { error } = await supabase.from('inventory_items').insert({
    practice_id: profile.practice_id,
    location_id: locationId,
    product_id: productId,
    on_hand: onHand ?? 0,
    par_level: parLevel ?? 4,
    reorder_point: reorderPoint ?? 2,
    reorder_qty: Math.max(1, (parLevel ?? 4) - (onHand ?? 0)),
  })
  if (error) throw error
  return { ok: true }
}

export async function getPractice() {
  if (isDemo) return store().practice
  const { data, error } = await supabase.from('practices').select('*').limit(1).single()
  if (error) throw error
  return {
    id: data.id,
    name: data.name,
    legalName: data.legal_name,
    phone: data.phone,
    email: data.email,
    address1: data.address_1,
    address2: data.address_2,
    city: data.city,
    region: data.region,
    postalCode: data.postal_code,
    country: data.country,
    timezone: data.timezone,
  }
}

export async function getSpendHistory(months = 12) {
  return SPEND_HISTORY.slice(-months)
}

/**
 * Analytics for the Insights screen. Demo mode serves the bundled history;
 * live mode derives the same shapes from order lines.
 */
export async function getInsights(months = 12) {
  const history = SPEND_HISTORY.slice(-months)
  const scale = months / 12

  const inventory = await listInventory()
  const health = inventory.reduce(
    (acc, r) => {
      acc[r.stockStatus] = (acc[r.stockStatus] ?? 0) + 1
      return acc
    },
    { out: 0, low: 0, below_par: 0, ok: 0 },
  )

  const categories = CATEGORY_SPEND.map((c) => ({
    label: CATEGORIES.find((x) => x.slug === c.slug)?.name ?? c.slug,
    value: Math.round(c.spend * scale),
  })).sort((a, b) => b.value - a.value)

  const totalSupplierSpend = SUPPLIER_SPEND.reduce((s, x) => s + x.spend, 0)
  const suppliers = SUPPLIER_SPEND.map((s) => ({
    label: SUPPLIERS.find((x) => x.id === s.id)?.name ?? s.id,
    value: Math.round(s.spend * scale),
    caption: `${Math.round((s.spend / totalSupplierSpend) * 100)}%`,
    orders: s.orders,
  })).sort((a, b) => b.value - a.value)

  const items = TOP_ITEMS.map((t) => ({
    label: productById(t.sku)?.name ?? t.sku,
    value: Math.round(t.spend * scale),
  })).sort((a, b) => b.value - a.value)

  const totalSpend = history.reduce((s, m) => s + m.spend, 0)
  const totalSaved = history.reduce((s, m) => s + m.saved, 0)

  // Items being consumed fast enough to run out before a restock could land.
  const atRisk = inventory
    .filter((r) => r.daysOfCover != null && r.bestLeadDays != null)
    .filter((r) => r.daysOfCover <= r.bestLeadDays + 3)
    .sort((a, b) => a.daysOfCover - b.daysOfCover)
    .slice(0, 6)

  return {
    history,
    totalSpend,
    totalSaved,
    savedPct: totalSpend + totalSaved > 0 ? (totalSaved / (totalSpend + totalSaved)) * 100 : 0,
    categories,
    suppliers,
    items,
    health,
    atRisk,
    trackedCount: inventory.length,
  }
}

// --- writes -----------------------------------------------------------------
export async function recordMovement({
  inventoryItemId,
  type,
  quantity,
  reason,
  lotNumber,
  expiresAt,
}) {
  if (isDemo) {
    const row = store().inventory.find((r) => r.id === inventoryItemId)
    if (!row) throw new Error('Item not found')
    const signed = ['consumed', 'wasted'].includes(type) ? -Math.abs(quantity) : Math.abs(quantity)
    row.onHand = Math.max(0, row.onHand + signed)
    if (type === 'counted') row.lastCountedAt = new Date().toISOString()
    if (expiresAt) row.expiresAt = expiresAt
    recomputeRow(row)
    movements.unshift({
      id: `mv-${movements.length + 1}`,
      inventoryItemId,
      type,
      quantity: signed,
      reason,
      lotNumber,
      createdAt: new Date().toISOString(),
    })
    emit()
    return { ok: true }
  }

  const { error } = await supabase.rpc('record_movement', {
    p_inventory_item_id: inventoryItemId,
    p_type: type,
    p_quantity: quantity,
    p_reason: reason ?? null,
    p_lot_number: lotNumber ?? null,
    p_expires_at: expiresAt ?? null,
  })
  if (error) throw error
  return { ok: true }
}

export async function updateInventorySettings(id, { parLevel, reorderPoint, reorderQty, bin }) {
  if (isDemo) {
    const row = store().inventory.find((r) => r.id === id)
    if (!row) throw new Error('Item not found')
    if (parLevel != null) row.parLevel = parLevel
    if (reorderPoint != null) row.reorderPoint = reorderPoint
    if (reorderQty != null) row.reorderQty = reorderQty
    if (bin != null) row.bin = bin
    recomputeRow(row)
    emit()
    return { ok: true }
  }

  const patch = {}
  if (parLevel != null) patch.par_level = parLevel
  if (reorderPoint != null) patch.reorder_point = reorderPoint
  if (reorderQty != null) patch.reorder_qty = reorderQty
  if (bin != null) patch.bin = bin

  const { error } = await supabase.from('inventory_items').update(patch).eq('id', id)
  if (error) throw error
  return { ok: true }
}

export async function createOrder({ supplierId, supplierName, locationId, lines }) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)
  const savings = lines.reduce(
    (sum, l) => sum + Math.max(0, (l.benchmarkUnitPrice ?? l.unitPrice) - l.unitPrice) * l.quantity,
    0,
  )

  if (isDemo) {
    const s = store()
    const order = {
      id: `ord-${1043 + s.orders.length}`,
      reference: `PO-${1043 + s.orders.length}`,
      supplierId,
      supplierName,
      locationId,
      status: 'submitted',
      subtotal: Number(subtotal.toFixed(2)),
      shipping: 0,
      tax: Number((subtotal * 0.0825).toFixed(2)),
      total: Number((subtotal * 1.0825).toFixed(2)),
      savings: Number(savings.toFixed(2)),
      placedAt: new Date().toISOString(),
      expectedAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      itemCount: lines.length,
    }
    s.orders.unshift(order)
    emit()
    return order
  }

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      supplier_id: supplierId,
      location_id: locationId,
      status: 'submitted',
      subtotal,
      tax: subtotal * 0.0825,
      total: subtotal * 1.0825,
      savings,
      placed_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw error

  const { error: itemsError } = await supabase.from('order_items').insert(
    lines.map((l) => ({
      order_id: order.id,
      product_id: l.productId,
      supplier_id: supplierId,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      pack_size: l.packSize ?? 1,
      line_total: l.quantity * l.unitPrice,
      benchmark_unit_price: l.benchmarkUnitPrice ?? null,
    })),
  )
  if (itemsError) throw itemsError

  return order
}

export function recentMovements(limit = 12) {
  return movements.slice(0, limit)
}
