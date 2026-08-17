/**
 * The single data seam.
 *
 * Every screen talks to this module and never to Supabase directly, so the
 * app behaves identically whether it is backed by a live project or by the
 * bundled demo practice.
 */
import { isSupabaseConfigured, supabase } from './supabase'
import { parseInteger, parseMoney } from './csv'
import { PROCEDURE_TEMPLATES, TEMPLATE_BY_CODE, expandProcedure, unitsPerPack } from './cdt'
import { SPEND_WINDOW_MONTHS, assessSpend } from './benchmarks'
import { analyzeBulkTier, analyzeBulkTiers } from './spoilage'
import { computeLandedTotals } from './landed'
import {
  ASSETS,
  CATEGORIES,
  CATEGORY_SPEND,
  CREDENTIALS,
  LOCATIONS,
  ORDERS,
  ORDER_ITEMS,
  PAYMENT_METHODS,
  PRACTICE,
  PRODUCTS,
  SPEND_HISTORY,
  SUPPLIERS,
  SUPPLIER_ACCOUNTS,
  SUPPLIER_SPEND,
  TEAM,
  TOP_ITEMS,
  VENDOR_DIRECTORY,
  buildInventoryRow,
  bulkTiersFor,
  shelfLifeDaysFor,
  buildInventory,
  buildLots,
  buildMovements,
  buildProcedureLog,
  nonCarriersFor,
  offersFor,
  productByGtin,
  productById,
} from './demoData'

/**
 * Demo mode is either implicit (no Supabase project configured) or chosen —
 * a visitor tapping "See a demo practice" on the live site. The flag is read
 * once at module load, and entering or leaving the preview reloads the page,
 * so every screen agrees about which world it is in.
 */
export const DEMO_MODE_KEY = 'dentin:demo-mode'
export const isDemo =
  !isSupabaseConfigured ||
  (typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_MODE_KEY) === 'true')

// Static app data (not demo-only): the vendor directory taxonomy.
export { VENDOR_KINDS } from './demoData'

// --- demo store -------------------------------------------------------------
let demoInventory = null
// Declared alongside inventory because store() populates them together —
// lots feed each item's earliest expiry, so they share a lifecycle.
let demoLots = null
let demoMovements = null
let demoOrders = null
let demoOrderItems = null
let demoPaymentMethods = null
let demoPractice = null
const movements = []
const listeners = new Set()

const DAY_MS = 86400000
const addDaysIso = (iso, days) => new Date(new Date(iso).getTime() + days * DAY_MS).toISOString()
const parseTermDays = (terms) => {
  const m = /net\s*(\d+)/i.exec(terms ?? '')
  return m ? Number(m[1]) : 0
}

/**
 * The signed-in user's own practice id. Always scoped to the caller's row —
 * the profiles SELECT policy exposes every teammate, so an unscoped
 * .single() would error the moment a practice has two users.
 */
async function myPracticeId() {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) throw new Error('Sign in first')
  const { data, error } = await supabase
    .from('profiles')
    .select('practice_id')
    .eq('id', uid)
    .maybeSingle()
  if (error) throw error
  if (!data?.practice_id) throw new Error('Finish practice setup first')
  return data.practice_id
}

/** Live drafts and orders: keep the stored money in step with the lines. */
async function syncOrderTotals(orderId) {
  const { data: lines, error } = await supabase
    .from('order_items')
    .select('quantity, unit_price')
    .eq('order_id', orderId)
  if (error) throw error
  const subtotal = (lines ?? []).reduce(
    (sum, l) => sum + Number(l.quantity) * Number(l.unit_price),
    0,
  )
  const { error: updateError } = await supabase
    .from('orders')
    .update({ subtotal: Number(subtotal.toFixed(2)), total: Number(subtotal.toFixed(2)) })
    .eq('id', orderId)
  if (updateError) throw updateError
}

/** Recompute an order's money from its lines, so they can never disagree. */
function recomputeOrderTotals(order) {
  const lines = demoOrderItems.filter(([orderId]) => orderId === order.id)
  const subtotal = lines.reduce((sum, [, , quantity, unitPrice]) => sum + quantity * unitPrice, 0)
  const supplier = SUPPLIERS.find((s) => s.id === order.supplierId)
  // Same money model as the landed-cost engine, so the order a buyer places
  // never disagrees with the analysis that justified it: vendor surcharge
  // rides with freight, and tax follows the practice's taxable-freight rule.
  const shipping =
    order.status === 'draft' || order.shipping == null
      ? (supplier && supplier.freeShipOver > 0 && subtotal >= supplier.freeShipOver
          ? 0
          : (supplier?.shipFee ?? 0)) + (supplier?.surcharge ?? 0)
      : order.shipping
  // NOT store().practice — this helper runs during store() initialization,
  // and re-entering store() there recurses without end. demoPractice is
  // assigned before the orders block, so it is already set when this runs.
  const practice = demoPractice ?? PRACTICE
  const taxRate = practice?.taxExempt ? 0 : (practice?.taxRate ?? 0.0825)
  const tax = (subtotal + (practice?.taxShipping ? shipping : 0)) * taxRate
  order.subtotal = Number(subtotal.toFixed(2))
  order.shipping = Number(shipping.toFixed(2))
  order.tax = Number(tax.toFixed(2))
  order.total = Number((subtotal + tax + shipping).toFixed(2))
  order.savings = Number((subtotal * 0.163).toFixed(2))
  order.itemCount = lines.length
  return order
}

function store() {
  if (!demoInventory) {
    demoInventory = buildInventory()
    // Earliest expiry is derived from the lots, so the item summary can never
    // disagree with the lot list beneath it.
    demoLots = buildLots(demoInventory)
    for (const row of demoInventory) {
      const earliest = demoLots
        .filter((l) => l.inventoryItemId === row.id)
        .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))[0]
      row.expiresAt = earliest?.expiresAt ?? null
    }
  }
  if (!demoPractice) demoPractice = { ...PRACTICE }
  if (!demoOrders) {
    // Lines are copied into a mutable ledger so draft orders and receiving can
    // change them; totals are derived from the lines rather than stored, so an
    // order can never disagree with what is on it.
    demoOrderItems = ORDER_ITEMS.map((row) => [...row])
    demoOrders = ORDERS.map((o) => {
      const order = { ...o }
      if (demoOrderItems.some(([orderId]) => orderId === o.id)) recomputeOrderTotals(order)

      // Payables: distributor accounts invoice on terms; vendors with no
      // account (marketplace checkouts) charge when the order is placed, so
      // they are never "owed". Older received invoices are settled; recent
      // ones still owe the vendor.
      const account = accounts().find((a) => a.supplierId === o.supplierId)
      const termDays = parseTermDays(account?.terms)
      const active = o.status !== 'cancelled' && o.status !== 'draft'
      if (!active) {
        order.paymentStatus = null
        order.paidAt = null
      } else if (!account) {
        order.termsLabel = 'Charged at checkout'
        order.paymentDueAt = o.placedAt ?? null
        order.paymentStatus = 'paid'
        order.paidAt = o.placedAt ?? null
        order.paymentMethodId = 'pm-visa'
        order.paymentMethodLabel = 'Visa Signature · ···· 9214'
      } else {
        order.termsLabel = account.terms ?? 'Due on receipt'
        order.paymentDueAt = o.placedAt ? addDaysIso(o.placedAt, termDays) : null
        const settled =
          o.status === 'received' &&
          o.receivedAt &&
          Date.now() - new Date(o.receivedAt).getTime() > 14 * DAY_MS
        if (settled) {
          order.paymentStatus = 'paid'
          order.paidAt = addDaysIso(o.receivedAt, 3)
          order.paymentMethodId = 'pm-ach'
          order.paymentMethodLabel = 'Operating account · ACH ····4821'
        } else {
          order.paymentStatus = 'unpaid'
          order.paidAt = null
        }
      }
      return order
    })
  }
  return {
    inventory: demoInventory,
    orders: demoOrders,
    orderItems: demoOrderItems,
    practice: demoPractice,
  }
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

/** Supplier ids the practice can order from today, without opening anything. */
async function accountSupplierIds() {
  if (isDemo) return new Set(accounts().map((a) => a.supplierId))
  const { data } = await supabase.from('supplier_accounts').select('supplier_id')
  return new Set((data ?? []).map((a) => a.supplier_id))
}

/**
 * Every offer for a product, cheapest first, each marked with whether it is
 * reachable through an existing account.
 *
 * `isBest` is the cheapest offer the practice can actually place today;
 * `isMarketBest` is the cheapest anywhere. When those differ, the gap is an
 * opportunity that needs a new vendor account rather than a saving in hand.
 */
export async function compareOffers(productId) {
  const accountIds = await accountSupplierIds()

  let offers
  if (isDemo) {
    const product = productById(productId)
    // Contracted pricing overrides the catalog price for that vendor — it is
    // what the invoice will actually say.
    const raw = offersFor(productId).map((o) => {
      const contract = product ? demoContracts.get(contractKey(o.supplierId, product.sku)) : null
      if (!contract) return o
      const packSize = contract.packSize || o.packSize
      return {
        ...o,
        price: contract.price,
        packSize,
        unitPrice: contract.price / packSize,
        vendorSku: contract.vendorSku || o.vendorSku,
        isContractPrice: true,
      }
    })

    // Re-rank: a contract price can move a vendor to the front.
    raw.sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1
      if (a.unitPrice !== b.unitPrice) return a.unitPrice - b.unitPrice
      return a.leadDays - b.leadDays
    })

    const inStock = raw.filter((o) => o.inStock)
    const worst = inStock.length ? inStock[inStock.length - 1].unitPrice : null
    offers = raw.map((o) => ({
      ...o,
      savingsVsWorst: worst != null ? worst - o.unitPrice : 0,
    }))
  } else {
    const { data, error } = await supabase.rpc('compare_offers', { p_product_id: productId })
    if (error) throw error
    offers = data.map((o) => ({
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
      savingsVsWorst: Number(o.savings_vs_worst ?? 0),
    }))
  }

  const annotated = offers.map((o) => ({ ...o, hasAccount: accountIds.has(o.supplierId) }))
  const inStock = annotated.filter((o) => o.inStock)
  const marketBest = inStock[0] ?? null
  const accountBest = inStock.find((o) => o.hasAccount) ?? null

  return annotated.map((o) => ({
    ...o,
    isBest: accountBest ? o.supplierId === accountBest.supplierId : false,
    isMarketBest: marketBest ? o.supplierId === marketBest.supplierId : false,
    // Positive only when a non-account vendor undercuts your best account.
    unlockableDelta:
      accountBest && marketBest && !marketBest.hasAccount
        ? Number((accountBest.price - marketBest.price).toFixed(2))
        : 0,
  }))
}

/**
 * Full price discovery for one exact product.
 *
 * Returns the product's identity keys, every vendor that carries it (with the
 * price, how the listing was matched, and whether the practice can order from
 * them today), and the vendors that do not stock it at all. The non-carrier
 * list matters: "nobody cheaper" and "nobody else sells it" are different
 * answers and a buyer needs to tell them apart.
 */
export async function findVendorPrices(productId) {
  const accountIds = await accountSupplierIds()

  if (isDemo) {
    const product = productById(productId)
    if (!product) return null

    const offers = offersFor(productId).map((o) => ({
      ...o,
      hasAccount: accountIds.has(o.supplierId),
    }))

    const inStock = offers.filter((o) => o.inStock)
    const marketBest = inStock[0] ?? null
    const accountBest = inStock.find((o) => o.hasAccount) ?? null

    return {
      product: {
        id: product.id,
        name: product.name,
        brand: product.brand,
        unit: product.unit,
        packSize: product.packSize,
        gtin: product.gtin,
        mfrSku: product.sku,
        categorySlug: product.category,
        isEquipment: product.isEquipment,
      },
      offers: offers.map((o) => ({
        ...o,
        isBest: accountBest ? o.supplierId === accountBest.supplierId : false,
        isMarketBest: marketBest ? o.supplierId === marketBest.supplierId : false,
      })),
      nonCarriers: nonCarriersFor(productId),
      accountBest,
      marketBest,
      scannedAt: new Date().toISOString(),
    }
  }

  const { data: product, error } = await supabase
    .from('products')
    .select('id, name, brand, unit, pack_size, gtin, mfr_sku, is_equipment, categories(slug)')
    .eq('id', productId)
    .single()
  if (error) throw error

  const offers = await compareOffers(productId)
  const inStock = offers.filter((o) => o.inStock)

  // Any supplier with no offer row for this product does not list it.
  const listed = new Set(offers.map((o) => o.supplierId))
  const { data: allSuppliers } = await supabase.from('suppliers').select('id, name')

  return {
    product: {
      id: product.id,
      name: product.name,
      brand: product.brand,
      unit: product.unit,
      packSize: product.pack_size,
      gtin: product.gtin,
      mfrSku: product.mfr_sku,
      categorySlug: product.categories?.slug,
      isEquipment: product.is_equipment,
    },
    offers,
    nonCarriers: (allSuppliers ?? [])
      .filter((s) => !listed.has(s.id))
      .map((s) => ({
        supplierId: s.id,
        supplierName: s.name,
        reason: 'Not listed in their catalog',
      })),
    accountBest: inStock.find((o) => o.hasAccount) ?? null,
    marketBest: inStock[0] ?? null,
    scannedAt: new Date().toISOString(),
  }
}

// --- ledger and lots --------------------------------------------------------
function ledger() {
  if (!demoMovements) demoMovements = buildMovements(store().inventory)
  return demoMovements
}

function lots() {
  // store() builds these alongside inventory so expiry stays single-sourced.
  store()
  return demoLots ?? []
}

/**
 * An item's movement history, newest first, with a running balance.
 *
 * The balance is reconstructed backwards from today's on-hand rather than
 * stored, so it always agrees with the item — which is the point of keeping a
 * ledger at all.
 */
export async function listMovements(inventoryItemId, { limit = 60 } = {}) {
  let rows

  if (isDemo) {
    rows = ledger()
      .filter((m) => m.inventoryItemId === inventoryItemId)
      .slice(0, limit)
  } else {
    // No profiles() embed: created_by references auth.users, so PostgREST
    // has no FK path to profiles and rejects the whole query.
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('inventory_item_id', inventoryItemId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    rows = data.map((m) => ({
      id: m.id,
      inventoryItemId: m.inventory_item_id,
      type: m.type,
      quantity: Number(m.quantity),
      reason: m.reason,
      userName: m.profiles?.full_name ?? 'Unknown',
      userInitials: (m.profiles?.full_name ?? '?')
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join(''),
      createdAt: m.created_at,
    }))
  }

  const item = await getInventoryItem(inventoryItemId)
  let balance = item?.onHand ?? 0

  return rows.map((m) => {
    const after = balance
    // Walking backwards: the balance before this entry is after minus its delta.
    balance = m.type === 'counted' ? after : after - m.quantity
    return { ...m, balanceAfter: after }
  })
}

/** Practice-wide recent activity, for the dashboard and audit review. */
export async function listRecentActivity(limit = 25) {
  if (isDemo) return ledger().slice(0, limit)

  // Same FK caveat as listMovements: no profiles() embed on stock_movements.
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*, inventory_items(products(name))')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  return data.map((m) => ({
    id: m.id,
    inventoryItemId: m.inventory_item_id,
    productName: m.inventory_items?.products?.name,
    type: m.type,
    quantity: Number(m.quantity),
    reason: m.reason,
    userName: m.profiles?.full_name ?? 'Unknown',
    createdAt: m.created_at,
  }))
}

/** Lots with an expiry date, soonest first. */
export async function listLots({ withinDays } = {}) {
  let rows

  if (isDemo) {
    rows = lots()
  } else {
    const { data, error } = await supabase
      .from('lots')
      .select('*, inventory_items(products(name, brand, unit), locations(name))')
      .not('expires_at', 'is', null)
      .gt('quantity', 0)
      .order('expires_at')
    if (error) throw error
    rows = data.map((l) => ({
      id: l.id,
      inventoryItemId: l.inventory_item_id,
      productName: l.inventory_items?.products?.name,
      brand: l.inventory_items?.products?.brand,
      unit: l.inventory_items?.products?.unit,
      locationName: l.inventory_items?.locations?.name,
      lotNumber: l.lot_number,
      quantity: Number(l.quantity),
      expiresAt: l.expires_at,
      receivedAt: l.received_at,
    }))
  }

  if (withinDays != null) {
    const cutoff = Date.now() + withinDays * 86400000
    rows = rows.filter((l) => new Date(l.expiresAt).getTime() <= cutoff)
  }

  return rows
}

export async function listLotsForItem(inventoryItemId) {
  const all = await listLots()
  return all.filter((l) => l.inventoryItemId === inventoryItemId)
}

/** Write off an expired or damaged lot; the ledger records it as waste. */
export async function discardLot(lotId, reason = 'Expired') {
  if (isDemo) {
    const lot = lots().find((l) => l.id === lotId)
    if (!lot) throw new Error('Lot not found')
    const row = store().inventory.find((r) => r.id === lot.inventoryItemId)
    if (row) {
      row.onHand = Math.max(0, row.onHand - lot.quantity)
      recomputeRow(row)
    }
    ledger().unshift({
      id: `mv-discard-${lotId}`,
      inventoryItemId: lot.inventoryItemId,
      productName: lot.productName,
      type: 'wasted',
      quantity: -lot.quantity,
      reason: `${reason} · lot ${lot.lotNumber}`,
      userName: TEAM[0].name,
      userInitials: TEAM[0].initials,
      createdAt: new Date().toISOString(),
    })
    demoLots = lots().filter((l) => l.id !== lotId)
    if (row) {
      // The item's headline expiry follows the lots that remain.
      const remaining = demoLots
        .filter((l) => l.inventoryItemId === row.id && l.expiresAt)
        .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))
      row.expiresAt = remaining[0]?.expiresAt ?? null
      recomputeRow(row)
    }
    emit()
    return { ok: true }
  }

  const { data: lot, error: lotError } = await supabase
    .from('lots')
    .select('*')
    .eq('id', lotId)
    .maybeSingle()
  if (lotError) throw lotError
  if (!lot) throw new Error('Lot not found')

  const { error: moveError } = await supabase.rpc('record_movement', {
    p_inventory_item_id: lot.inventory_item_id,
    p_type: 'wasted',
    p_quantity: lot.quantity,
    p_reason: `${reason} · lot ${lot.lot_number ?? ''}`.trim(),
  })
  if (moveError) throw moveError
  const { error: zeroError } = await supabase.from('lots').update({ quantity: 0 }).eq('id', lotId)
  if (zeroError) throw zeroError
  emit()
  return { ok: true }
}

// --- procedure-driven consumption -------------------------------------------
let demoProcedures = null

function procedureLog() {
  if (!demoProcedures) demoProcedures = buildProcedureLog()
  return demoProcedures
}

/** The BOM template map, joined to catalog products for display. */
export async function listProcedureTemplates() {
  return PROCEDURE_TEMPLATES.map((t) => {
    const expanded = expandProcedure({ code: t.code, surfaces: t.code.startsWith('D23') ? 'MO' : null })
    return {
      code: t.code,
      name: t.name,
      category: t.category,
      setup: t.setup,
      anesthetic: t.anesthetic ?? 0,
      canals: t.canals ?? null,
      parametric: t.materials.some((m) => m.perSurface || m.perCanal),
      lineCount: expanded?.entries.length ?? 0,
      entries: (expanded?.entries ?? []).map((e) => {
        const product = productById(e.sku)
        return {
          sku: e.sku,
          each: e.each,
          productName: product?.name ?? e.sku,
          unit: product?.unit,
          packSize: product ? unitsPerPack(product) : 1,
          categorySlug: product?.category,
        }
      }),
    }
  })
}

/**
 * Convert completed procedures into consumption.
 *
 * Materials are expanded per procedure in individual units, then divided by
 * pack size, because inventory is counted in packs. Fractions accumulate
 * across the batch rather than rounding per procedure — rounding a tenth of a
 * glove box up on every visit would overstate usage by an order of magnitude.
 */
export function projectConsumption(procedures) {
  const byProduct = new Map()

  for (const proc of procedures) {
    const expanded = expandProcedure({
      code: proc.code,
      surfaces: proc.surfaces,
      units: proc.units ?? 1,
    })
    if (!expanded) continue

    for (const entry of expanded.entries) {
      const product = productById(entry.sku)
      if (!product) continue
      // Bulk-dispensed materials yield many uses per pack; counted ones do not.
      const packs = entry.each / unitsPerPack(product)
      const current = byProduct.get(entry.sku) ?? { sku: entry.sku, each: 0, packs: 0, procedures: 0 }
      current.each += entry.each
      current.packs += packs
      current.procedures += 1
      byProduct.set(entry.sku, current)
    }
  }

  return [...byProduct.values()]
    .map((row) => {
      const product = productById(row.sku)
      return {
        ...row,
        productName: product?.name ?? row.sku,
        unit: product?.unit,
        packSize: product ? unitsPerPack(product) : 1,
        categorySlug: product?.category,
        estimatedCost: row.packs * (offersFor(row.sku).find((o) => o.inStock)?.price ?? 0),
      }
    })
    .sort((a, b) => b.estimatedCost - a.estimatedCost)
}

/** Completed procedures over a window, with what they consumed. */
export async function getProcedureConsumption({ days = 30 } = {}) {
  const cutoff = Date.now() - days * 86400000
  const procedures = procedureLog().filter((p) => new Date(p.completedAt).getTime() >= cutoff)

  const consumption = projectConsumption(procedures)
  const matched = procedures.filter((p) => TEMPLATE_BY_CODE.has(p.code))

  // Codes the PMS reported that have no BOM yet — the gap to close.
  const unmappedCounts = new Map()
  for (const p of procedures) {
    if (TEMPLATE_BY_CODE.has(p.code)) continue
    unmappedCounts.set(p.code, (unmappedCounts.get(p.code) ?? 0) + 1)
  }

  const byCode = new Map()
  for (const p of matched) {
    const entry = byCode.get(p.code) ?? {
      code: p.code,
      name: TEMPLATE_BY_CODE.get(p.code)?.name ?? p.code,
      count: 0,
    }
    entry.count += 1
    byCode.set(p.code, entry)
  }

  const materialCost = consumption.reduce((sum, c) => sum + c.estimatedCost, 0)

  return {
    days,
    procedureCount: procedures.length,
    mappedCount: matched.length,
    coverage: procedures.length ? (matched.length / procedures.length) * 100 : 0,
    unmapped: [...unmappedCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
    byCode: [...byCode.values()].sort((a, b) => b.count - a.count),
    consumption,
    materialCost,
    costPerProcedure: matched.length ? materialCost / matched.length : 0,
  }
}

/**
 * Post a batch of completed procedures to stock.
 *
 * Writes one movement per product rather than per procedure, so the ledger
 * stays readable: "42 prophylaxis consumed 0.42 boxes of prophy angles" is an
 * auditable line; 42 near-zero entries are not.
 */
export async function postProcedureConsumption({ days = 7, locationId } = {}) {
  const cutoff = Date.now() - days * 86400000
  const procedures = procedureLog().filter((p) => new Date(p.completedAt).getTime() >= cutoff)
  const consumption = projectConsumption(procedures)

  const rows = await listInventory({ locationId })
  let posted = 0
  let skipped = 0

  for (const line of consumption) {
    const item = rows.find((r) => r.productId === line.sku)
    if (!item) {
      skipped += 1
      continue
    }
    // Round to a hundredth of a pack; below that it is noise, not consumption.
    const quantity = Math.round(line.packs * 100) / 100
    if (quantity <= 0) continue

    await recordMovement({
      inventoryItemId: item.id,
      type: 'consumed',
      quantity,
      reason: `${line.procedures} procedures, last ${days} days`,
    })
    posted += 1
  }

  return { posted, skipped, procedures: procedures.length }
}

/** Supply spend against collections, on the trailing window the industry uses. */
export async function getSpendBenchmark() {
  const practice = await getPractice()
  const history = await getSpendHistory(SPEND_WINDOW_MONTHS)
  const supplySpend = history.reduce((sum, m) => sum + m.spend, 0)
  const collections = (practice?.collectionsPerMonth ?? 0) * SPEND_WINDOW_MONTHS

  const assessment = assessSpend({
    supplySpend,
    collections,
    practiceType: practice?.practiceType ?? 'general',
  })

  const procedures = await getProcedureConsumption({ days: 30 })

  return {
    supplySpend,
    collections,
    months: SPEND_WINDOW_MONTHS,
    practiceType: practice.practiceType ?? 'general',
    costPerProcedure: procedures.costPerProcedure,
    procedureCount: procedures.procedureCount,
    ...assessment,
  }
}

// --- current user ------------------------------------------------------------
let demoUser = null

export async function getCurrentUser() {
  if (isDemo) {
    if (!demoUser) {
      const me = TEAM[0]
      demoUser = {
        id: me.id,
        name: me.name,
        email: 'l.newman@ridgelinedental.example',
        role: me.role,
        initials: me.initials,
      }
    }
    return demoUser
  }

  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', auth.user.id)
    .single()
  const name = profile?.full_name ?? auth.user.email
  return {
    id: auth.user.id,
    name,
    email: auth.user.email,
    role: profile?.role ?? 'owner',
    initials: String(name)
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join(''),
  }
}

export async function updateCurrentUser(patch) {
  if (isDemo) {
    await getCurrentUser()
    Object.assign(demoUser, patch)
    demoUser.initials = String(demoUser.name ?? '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
    emit()
    return { ok: true }
  }

  const { data: auth } = await supabase.auth.getUser()
  if (patch.name != null) {
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: patch.name })
      .eq('id', auth.user.id)
    if (error) throw error
  }
  if (patch.email != null && patch.email !== auth.user.email) {
    // Email changes go through Supabase's confirmation flow, not a table write.
    const { error } = await supabase.auth.updateUser({ email: patch.email })
    if (error) throw error
  }
  emit()
  return { ok: true }
}

/** POST to one of the app's own API routes as the signed-in user. */
async function postApi(path, payload) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Sign in first')
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'Something went wrong')
  return body
}

/**
 * Add a teammate. Seats are free and unlimited — Dentin bills per location,
 * not per person, and a practice that hides the software from its assistants
 * gets worse counts.
 */
export async function inviteTeammate({ email, role = 'assistant' }) {
  if (isDemo) {
    const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    TEAM.push({
      id: `usr-${Date.now().toString(36)}`,
      name,
      email,
      role,
      initials: name.split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join(''),
      pending: true,
    })
    emit()
    return { ok: true, invited: true }
  }
  return postApi('/api/team/invite', { email, role })
}

/** Take someone off the practice; their account and audit trail survive. */
export async function removeTeammate(userId) {
  if (isDemo) {
    const i = TEAM.findIndex((m) => m.id === userId)
    if (i !== -1) TEAM.splice(i, 1)
    emit()
    return { ok: true }
  }
  return postApi('/api/team/remove', { userId })
}

export async function listTeam() {
  if (isDemo) return TEAM
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, avatar_url')
  if (error) throw error
  return data.map((p) => ({
    id: p.id,
    name: p.full_name,
    email: p.email,
    role: p.role,
    initials: (p.full_name ?? '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join(''),
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

  // Equipment service, from whichever assets this practice actually owns —
  // the demo's list in demo mode, the assets table live.
  for (const a of await listAssets()) {
    if (!a.nextServiceAt || a.status === 'retired') continue
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
    paymentStatus: o.payment_status ?? null,
    paymentDueAt: o.payment_due_at ?? null,
    paidAt: o.paid_at ?? null,
  }))
}

export async function getOrder(id) {
  if (isDemo) {
    const s = store()
    const order = s.orders.find((o) => o.id === id)
    if (!order) return null

    const lines = s.orderItems.filter(([orderId]) => orderId === id).map(
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

    const supplier = SUPPLIERS.find((s2) => s2.id === order.supplierId)
    return {
      ...order,
      supplierWebsite: supplier?.website ?? null,
      supplierPhone: supplier?.supportPhone ?? null,
      lines,
    }
  }

  const { data, error } = await supabase
    .from('orders')
    .select(
      '*, suppliers(name, website, support_phone), order_items(*, products(name, brand, unit))',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Order not found')

  return {
    id: data.id,
    reference: data.reference,
    supplierId: data.supplier_id,
    supplierName: data.suppliers?.name,
    supplierWebsite: data.suppliers?.website ?? null,
    supplierPhone: data.suppliers?.support_phone ?? null,
    sentAt: data.sent_at ?? null,
    sentMethod: data.sent_method ?? null,
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
    paymentStatus: data.payment_status ?? null,
    paymentDueAt: data.payment_due_at ?? null,
    paidAt: data.paid_at ?? null,
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
 * The last order this practice actually placed, with its lines — the basis
 * for "same as last time", which is how most restocking really works.
 */
export async function getLastOrder() {
  if (isDemo) {
    const s = store()
    const last = s.orders
      .filter((o) => o.status !== 'draft' && o.status !== 'cancelled' && o.placedAt)
      .sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt))[0]
    if (!last) return null
    const lines = s.orderItems
      .filter(([orderId]) => orderId === last.id)
      .map(([, sku, quantity, unitPrice]) => {
        const product = productById(sku)
        return {
          productId: sku,
          productName: product?.name ?? sku,
          brand: product?.brand,
          unit: product?.unit,
          quantity,
          unitPrice,
        }
      })
    return { ...last, lines }
  }

  const { data, error } = await supabase
    .from('orders')
    .select('*, suppliers(name), order_items(*, products(name, brand, unit))')
    .not('placed_at', 'is', null)
    .neq('status', 'draft')
    .neq('status', 'cancelled')
    .order('placed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    reference: data.reference,
    supplierId: data.supplier_id,
    supplierName: data.suppliers?.name,
    status: data.status,
    total: Number(data.total ?? 0),
    placedAt: data.placed_at,
    lines: (data.order_items ?? []).map((l) => ({
      productId: l.product_id,
      productName: l.products?.name,
      brand: l.products?.brand,
      unit: l.products?.unit,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unit_price),
    })),
  }
}

/**
 * Record that this PO actually reached the vendor.
 *
 * Dentin builds and prices the order; a human still sends it through the
 * distributor's portal, phone or rep. Until that happens the order is issued
 * but not on its way, and the app says so rather than implying delivery.
 */
export async function markOrderSent(orderId, { method = 'portal' } = {}) {
  const sentAt = new Date().toISOString()

  if (isDemo) {
    const order = store().orders.find((o) => o.id === orderId)
    if (!order) throw new Error('Order not found')
    order.sentAt = sentAt
    order.sentMethod = method
    emit()
    return { ok: true, sentAt }
  }

  const { error } = await supabase
    .from('orders')
    .update({ sent_at: sentAt, sent_method: method })
    .eq('id', orderId)
  if (error) throw error
  emit()
  return { ok: true, sentAt }
}

/** The PO as plain text — what gets pasted into a portal or emailed to a rep. */
export function formatPurchaseOrder(order, practice) {
  const lines = (order.lines ?? []).map(
    (l) =>
      `${String(l.quantity).padStart(4)} × ${l.productName}${l.brand ? ` (${l.brand})` : ''}` +
      `  @ ${l.unitPrice.toFixed(2)}  = ${(l.quantity * l.unitPrice).toFixed(2)}`,
  )
  return [
    `PURCHASE ORDER ${order.reference ?? ''}`.trim(),
    `Vendor: ${order.supplierName ?? ''}`,
    practice?.name ? `Practice: ${practice.name}` : null,
    practice?.address1
      ? `Ship to: ${[practice.address1, practice.address2, practice.city, practice.region, practice.postalCode]
          .filter(Boolean)
          .join(', ')}`
      : null,
    practice?.phone ? `Phone: ${practice.phone}` : null,
    '',
    ...lines,
    '',
    `Subtotal: ${Number(order.subtotal ?? 0).toFixed(2)}`,
    `Total (est.): ${Number(order.total ?? 0).toFixed(2)}`,
  ]
    .filter((l) => l !== null)
    .join('\n')
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
      const line = s.orderItems.find(([oid, lineSku]) => oid === orderId && lineSku === sku)
      if (line) line[4] = Math.min(line[2], (line[4] ?? 0) + qty)
      const row = s.inventory.find(
        (r) => r.productId === sku && r.locationId === order.locationId,
      )
      if (!row) continue
      row.onHand += qty
      recomputeRow(row)
      ledger().unshift({
        id: `mv-${Date.now().toString(36)}-${ledger().length}`,
        inventoryItemId: row.id,
        productName: row.productName,
        type: 'received',
        quantity: qty,
        reason: `Received on ${order.reference}`,
        userName: TEAM[0].name,
        userInitials: TEAM[0].initials,
        createdAt: new Date().toISOString(),
      })
    }

    const allIn = s.orderItems
      .filter(([oid]) => oid === orderId)
      .every(([, , quantity, , receivedQty]) => (receivedQty ?? 0) >= quantity)
    order.status = allIn ? 'received' : 'partial'
    if (allIn) order.receivedAt = new Date().toISOString()
    emit()
    return { ok: true }
  }

  const order = await getOrder(orderId)
  let allIn = true
  for (const line of order.lines) {
    const qty = received[line.id]
    if ((line.receivedQty ?? 0) + (qty ?? 0) < line.quantity) allIn = false
    if (!qty) continue
    // Draft-built orders may carry no location; RLS already scopes the
    // lookup to the practice, so fall back to wherever the item is tracked.
    let itemQuery = supabase.from('inventory_items').select('id').eq('product_id', line.productId)
    if (order.locationId) itemQuery = itemQuery.eq('location_id', order.locationId)
    const { data: items, error: itemError } = await itemQuery.limit(1)
    if (itemError) throw itemError
    const item = items?.[0]
    if (!item) continue
    const { error: moveError } = await supabase.rpc('record_movement', {
      p_inventory_item_id: item.id,
      p_type: 'received',
      p_quantity: qty,
      p_reason: `Received on ${order.reference ?? orderId}`,
    })
    if (moveError) throw moveError
    const { error: lineError } = await supabase
      .from('order_items')
      .update({ received_qty: (line.receivedQty ?? 0) + qty })
      .eq('id', line.id)
    if (lineError) throw lineError
  }

  // A short delivery stays open as 'partial' — marking it received would
  // silently erase the units still owed.
  const { error } = await supabase
    .from('orders')
    .update(
      allIn
        ? { status: 'received', received_at: new Date().toISOString() }
        : { status: 'partial' },
    )
    .eq('id', orderId)
  if (error) throw error
  emit()
  return { ok: true }
}

// --- draft orders & duplicate-order guard -----------------------------------

/**
 * Everything already inbound for a product: open orders (submitted, in
 * transit, partially received) that still owe units. This is what powers the
 * "you already have this on the way" check before an order is doubled up.
 */
export async function findInboundFor(productId) {
  if (isDemo) {
    const s = store()
    const inbound = []
    for (const order of s.orders) {
      if (!['submitted', 'confirmed', 'shipped', 'partial'].includes(order.status)) continue
      const line = s.orderItems.find(([oid, sku]) => oid === order.id && sku === productId)
      if (!line) continue
      const remaining = line[2] - (line[4] ?? 0)
      if (remaining <= 0) continue
      inbound.push({
        orderId: order.id,
        reference: order.reference,
        supplierName: order.supplierName,
        status: order.status,
        quantity: remaining,
        expectedAt: order.expectedAt,
      })
    }
    return inbound
  }

  const { data, error } = await supabase
    .from('order_items')
    .select('quantity, received_qty, orders!inner(id, reference, status, expected_at, suppliers(name))')
    .eq('product_id', productId)
    // NB: 'shipped' is not in the order_status enum — including it makes
    // Postgres reject the whole filter and kills the duplicate-order guard.
    .in('orders.status', ['submitted', 'confirmed', 'partial'])
  if (error) throw error
  return (data ?? [])
    .map((l) => ({
      orderId: l.orders.id,
      reference: l.orders.reference,
      supplierName: l.orders.suppliers?.name,
      status: l.orders.status,
      quantity: Number(l.quantity) - Number(l.received_qty ?? 0),
      expectedAt: l.orders.expected_at,
    }))
    .filter((l) => l.quantity > 0)
}

/**
 * Drop a line into the vendor's draft order, creating the draft if none is
 * open. One draft per vendor: "add to next order" always has one unambiguous
 * destination, and repeated adds merge quantities instead of stacking lines.
 */
export async function addToDraftOrder({ productId, supplierId, supplierName, quantity = 1, unitPrice }) {
  if (isDemo) {
    const s = store()
    let draft = s.orders.find((o) => o.status === 'draft' && o.supplierId === supplierId)
    if (!draft) {
      const maxRef = s.orders.reduce(
        (max, o) => Math.max(max, Number(String(o.reference ?? '').replace(/\D/g, '')) || 0),
        1042,
      )
      const account = accounts().find((a) => a.supplierId === supplierId)
      draft = {
        id: `ord-${maxRef + 1}`,
        reference: `PO-${maxRef + 1}`,
        supplierId,
        supplierName:
          supplierName ?? SUPPLIERS.find((sup) => sup.id === supplierId)?.name ?? supplierId,
        locationId: 'loc-main',
        status: 'draft',
        subtotal: 0,
        shipping: null,
        tax: 0,
        total: 0,
        savings: 0,
        itemCount: 0,
        placedAt: null,
        expectedAt: null,
        createdAt: new Date().toISOString(),
        termsLabel: account?.terms ?? 'Due on receipt',
        paymentStatus: null,
        paymentDueAt: null,
        paidAt: null,
      }
      s.orders.unshift(draft)
    }

    const price = unitPrice ?? offersFor(productId).find((o) => o.supplierId === supplierId)?.price ?? 0
    const line = s.orderItems.find(([oid, sku]) => oid === draft.id && sku === productId)
    if (line) {
      line[2] += quantity
      if (unitPrice != null) line[3] = unitPrice
    } else {
      s.orderItems.push([draft.id, productId, quantity, price, 0])
    }
    recomputeOrderTotals(draft)
    emit()
    return {
      orderId: draft.id,
      reference: draft.reference,
      supplierName: draft.supplierName,
      lineQuantity: line ? line[2] : quantity,
      merged: Boolean(line),
      itemCount: draft.itemCount,
      total: draft.total,
    }
  }

  const profile = { practice_id: await myPracticeId() }
  let { data: draft } = await supabase
    .from('orders')
    .select('id, reference')
    .eq('supplier_id', supplierId)
    .eq('status', 'draft')
    .maybeSingle()
  if (!draft) {
    const { data: created, error: createError } = await supabase
      .from('orders')
      .insert({ practice_id: profile.practice_id, supplier_id: supplierId, status: 'draft' })
      .select('id, reference')
      .single()
    if (createError) throw createError
    draft = created
  }
  const { data: existing, error: existingError } = await supabase
    .from('order_items')
    .select('id, quantity, unit_price')
    .eq('order_id', draft.id)
    .eq('product_id', productId)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) {
    const newQty = Number(existing.quantity) + quantity
    const { error } = await supabase
      .from('order_items')
      .update({ quantity: newQty, line_total: newQty * Number(existing.unit_price) })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('order_items').insert({
      order_id: draft.id,
      product_id: productId,
      supplier_id: supplierId,
      quantity,
      unit_price: unitPrice ?? 0,
      line_total: quantity * (unitPrice ?? 0),
    })
    if (error) throw error
  }
  await syncOrderTotals(draft.id)
  emit()
  return { orderId: draft.id, reference: draft.reference, merged: Boolean(existing) }
}

/** Send a draft to the vendor: it becomes a submitted PO with an ETA. */
export async function submitDraftOrder(orderId) {
  if (isDemo) {
    const s = store()
    const order = s.orders.find((o) => o.id === orderId)
    if (!order) throw new Error('Order not found')
    if (order.status !== 'draft') throw new Error('Only drafts can be submitted')

    const supplier = SUPPLIERS.find((sup) => sup.id === order.supplierId)
    order.status = 'submitted'
    order.placedAt = new Date().toISOString()
    order.expectedAt = addDaysIso(order.placedAt, supplier?.leadDays ?? 4)
    order.shipping = null // let the recompute apply the vendor's shipping rule
    recomputeOrderTotals(order)
    const account = accounts().find((a) => a.supplierId === order.supplierId)
    if (account) {
      order.termsLabel = account.terms ?? 'Due on receipt'
      order.paymentDueAt = addDaysIso(order.placedAt, parseTermDays(account.terms))
      order.paymentStatus = 'unpaid'
    } else {
      // No account terms — marketplace-style checkout, charged on submit.
      const method =
        (await listPaymentMethods()).find((m) => m.isDefault) ?? (await listPaymentMethods())[0]
      order.termsLabel = 'Charged at checkout'
      order.paymentDueAt = order.placedAt
      order.paymentStatus = 'paid'
      order.paidAt = order.placedAt
      order.paymentMethodId = method?.id ?? null
      order.paymentMethodLabel = method ? `${method.label} · ${method.detail}` : null
    }
    emit()
    return { ok: true, reference: order.reference, expectedAt: order.expectedAt }
  }

  const placedAt = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('orders')
    .update({ status: 'submitted', placed_at: placedAt })
    .eq('id', orderId)
    .eq('status', 'draft')
    .select('reference, suppliers(avg_lead_days)')
    .maybeSingle()
  if (error) throw error
  if (!updated) throw new Error('Draft not found — it may already be submitted')
  const expectedAt = addDaysIso(placedAt, updated.suppliers?.avg_lead_days ?? 4)
  const { error: etaError } = await supabase
    .from('orders')
    .update({ expected_at: expectedAt })
    .eq('id', orderId)
  if (etaError) throw etaError
  await syncOrderTotals(orderId)
  emit()
  return { ok: true, reference: updated.reference, expectedAt }
}

/** Remove a line from a draft; an emptied draft is removed entirely. */
export async function removeOrderLine(orderId, productId) {
  if (isDemo) {
    const s = store()
    const order = s.orders.find((o) => o.id === orderId)
    if (!order || order.status !== 'draft') throw new Error('Only draft lines can be removed')
    const idx = s.orderItems.findIndex(([oid, sku]) => oid === orderId && sku === productId)
    if (idx !== -1) s.orderItems.splice(idx, 1)
    if (!s.orderItems.some(([oid]) => oid === orderId)) {
      demoOrders = s.orders.filter((o) => o.id !== orderId)
    } else {
      recomputeOrderTotals(order)
    }
    emit()
    return { ok: true, emptied: !s.orderItems.some(([oid]) => oid === orderId) }
  }

  const { error } = await supabase
    .from('order_items')
    .delete()
    .eq('order_id', orderId)
    .eq('product_id', productId)
  if (error) throw error
  const { count, error: countError } = await supabase
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
  if (countError) throw countError
  const emptied = (count ?? 0) === 0
  if (emptied) {
    const { error: dropError } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId)
      .eq('status', 'draft')
    if (dropError) throw dropError
  } else {
    await syncOrderTotals(orderId)
  }
  emit()
  return { ok: true, emptied }
}

// --- bulk buying & spoilage ---------------------------------------------------

const BURN_WINDOW_DAYS = 90

/**
 * Daily burn derived from the practice's CDT procedure history: every
 * completed procedure expands through its bill of materials, so this is what
 * the schedule actually consumed — not what someone remembers ordering.
 */
function cdtDailyBurn(productId) {
  const cutoff = Date.now() - BURN_WINDOW_DAYS * 86400000
  const procedures = procedureLog().filter(
    (p) => new Date(p.completedAt).getTime() >= cutoff,
  )
  const row = projectConsumption(procedures).find((c) => c.sku === productId)
  if (!row || row.packs <= 0) return null
  return {
    perDay: row.packs / BURN_WINDOW_DAYS,
    procedures: row.procedures,
    windowDays: BURN_WINDOW_DAYS,
  }
}

/**
 * Bulk-deal analysis for a product: each case/bulk tier priced honestly —
 * months of supply at the practice's real burn rate, the share projected to
 * expire before use (new stock waits behind what is already on the shelf),
 * the effective unit cost after that waste, and the projected dollar loss.
 *
 * Burn comes from CDT procedure history when the product appears in any
 * bill of materials, else from stock-movement history; the result says
 * which, because the two carry different confidence.
 */
export async function getBulkAnalysis(productId) {
  const inventory = await listInventory()
  const item = inventory.find((r) => r.productId === productId) ?? null
  const onHand = item?.onHand ?? 0
  const shelfLifeDays = shelfLifeDaysFor(productId)

  const cdt = isDemo ? cdtDailyBurn(productId) : null
  const dailyBurn = cdt?.perDay ?? item?.dailyBurn ?? 0
  const burnSource = cdt ? 'procedures' : item?.dailyBurn ? 'movements' : 'none'

  let deal
  if (isDemo) {
    deal = bulkTiersFor(productId)
  } else {
    // Until vendor feeds quote real case breaks, estimate standard ones off
    // the best orderable offer so the math is available — flagged estimated.
    const best = (await compareOffers(productId)).find((o) => o.inStock && o.hasAccount)
    deal = best
      ? {
          supplierId: best.supplierId,
          supplierName: best.supplierName,
          baseUnitPrice: best.price,
          tiers: [
            { label: 'Single pack', units: 1, unitPrice: best.price },
            { label: 'Case of 8', units: 8, unitPrice: Number((best.price * 0.93).toFixed(2)) },
            { label: 'Bulk 16', units: 16, unitPrice: Number((best.price * 0.86).toFixed(2)) },
          ],
        }
      : null
  }
  if (!deal) return null

  const tiers = analyzeBulkTiers(deal.tiers, {
    baseUnitPrice: deal.baseUnitPrice,
    dailyBurn,
    shelfLifeDays,
    onHand,
  })

  return {
    productId,
    supplierId: deal.supplierId,
    supplierName: deal.supplierName,
    baseUnitPrice: deal.baseUnitPrice,
    dailyBurn,
    burnSource,
    burnWindowDays: cdt?.windowDays ?? null,
    burnProcedures: cdt?.procedures ?? null,
    shelfLifeDays,
    onHand,
    tiers,
    safeUnits: tiers.find((t) => t.safeUnits != null)?.safeUnits ?? null,
    // Case pricing is synthesized until a vendor feed quotes real breaks.
    pricingEstimated: true,
  }
}

/**
 * The pre-order spoilage check: given a quantity about to be added to an
 * order, return a warning payload when part of it is projected to expire
 * before use — or null when the quantity is safe or unknowable.
 */
export async function assessOrderQuantity(productId, quantity, unitPrice) {
  const inventory = await listInventory()
  const item = inventory.find((r) => r.productId === productId) ?? null
  const shelfLifeDays = shelfLifeDaysFor(productId)
  if (shelfLifeDays == null) return null

  const cdt = isDemo ? cdtDailyBurn(productId) : null
  const dailyBurn = cdt?.perDay ?? item?.dailyBurn ?? 0
  if (!dailyBurn) return null // no history — nothing honest to warn with

  const price =
    unitPrice ?? (isDemo ? (offersFor(productId).find((o) => o.inStock)?.price ?? 0) : 0)

  const result = analyzeBulkTier({
    units: quantity,
    unitPrice: price,
    baseUnitPrice: price,
    dailyBurn,
    shelfLifeDays,
    onHand: item?.onHand ?? 0,
  })
  if (result.indeterminate || result.spoiledUnits === 0) return null

  return {
    ...result,
    dailyBurn,
    burnSource: cdt ? 'procedures' : 'movements',
    burnWindowDays: cdt?.windowDays ?? null,
    shelfLifeDays,
    onHand: item?.onHand ?? 0,
  }
}

// --- onboarding ---------------------------------------------------------------

export { STARTER_PACK } from './demoData'

/**
 * Turn a finished onboarding wizard into a real practice.
 *
 * Live sequencing matters for row-level security: the practice INSERT is open
 * to any authenticated user, but every other table requires membership — so
 * the profile must claim the practice *before* locations, accounts, or
 * starter inventory can be written. IDs are generated client-side because
 * INSERT..RETURNING would need a SELECT policy the caller does not have until
 * the claim lands.
 */
export async function completePracticeSetup({ practice, locations, supplierSlugs, starterItems }) {
  if (isDemo) {
    Object.assign(store().practice, {
      name: practice.name,
      legalName: practice.legalName || store().practice.legalName,
      phone: practice.phone || store().practice.phone,
      email: practice.email || store().practice.email,
      address1: practice.address1 || store().practice.address1,
      address2: practice.address2 ?? store().practice.address2,
      city: practice.city || store().practice.city,
      region: practice.region || store().practice.region,
      postalCode: practice.postalCode || store().practice.postalCode,
    })
    // Accounts follow the selection; details already on file survive.
    const chosen = new Set(supplierSlugs)
    for (const slug of chosen) {
      if (!accounts().some((a) => a.supplierId === slug)) {
        accounts().push({ supplierId: slug, terms: 'Net 30', isPreferred: false })
      }
    }
    demoAccounts = accounts().filter((a) => chosen.has(a.supplierId) || String(a.supplierId).startsWith('dir-'))

    if (starterItems?.length) {
      const s = store()
      for (const entry of starterItems) {
        if (s.inventory.some((r) => r.productId === entry.productId)) continue
        const row = buildInventoryRow(entry.productId, {
          onHand: 0,
          par: entry.par,
          reorderPoint: 0,
          reorderQty: entry.reorderQty,
        })
        if (row) s.inventory.push(row)
      }
    }
    emit()
    return { ok: true }
  }

  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) throw new Error('Not signed in')

  // Re-running setup must never mint a second practice. If this account
  // already claimed one, either short-circuit (fully set up) or resume the
  // remaining steps on the existing practice (a previous run died midway).
  const { data: existingProfile, error: existingError } = await supabase
    .from('profiles')
    .select('practice_id')
    .eq('id', userId)
    .maybeSingle()
  if (existingError) throw existingError
  let practiceId = existingProfile?.practice_id ?? null

  if (practiceId) {
    const { count: locationCount } = await supabase
      .from('locations')
      .select('id', { count: 'exact', head: true })
    if ((locationCount ?? 0) > 0) return { ok: true, practiceId, resumed: true }
    // Claimed but half-finished (e.g. the trial step created the shell) —
    // refresh the practice details typed since, then complete steps 3-5.
    const { error: refreshError } = await supabase
      .from('practices')
      .update({
        name: practice.name,
        legal_name: practice.legalName || null,
        phone: practice.phone || null,
        email: practice.email || null,
        address_1: practice.address1 || null,
        address_2: practice.address2 || null,
        city: practice.city || null,
        region: practice.region || null,
        postal_code: practice.postalCode || null,
      })
      .eq('id', practiceId)
    if (refreshError) throw refreshError
  } else {
    // 1. The practice itself — open insert, id minted here.
    practiceId = crypto.randomUUID()
    const { error: practiceError } = await supabase.from('practices').insert({
      id: practiceId,
      name: practice.name,
      legal_name: practice.legalName || null,
      phone: practice.phone || null,
      email: practice.email || null,
      address_1: practice.address1 || null,
      address_2: practice.address2 || null,
      city: practice.city || null,
      region: practice.region || null,
      postal_code: practice.postalCode || null,
    })
    if (practiceError) throw practiceError

    // 2. Claim it — from here on, tenant policies resolve.
    const { error: claimError } = await supabase
      .from('profiles')
      .update({ practice_id: practiceId })
      .eq('id', userId)
    if (claimError) throw claimError
  }

  // 3. Locations, first one primary.
  const locationRows = locations
    .filter((l) => l.name.trim())
    .map((l, i) => ({
      id: crypto.randomUUID(),
      practice_id: practiceId,
      name: l.name.trim(),
      operatories: Number(l.operatories) || 0,
      is_primary: i === 0,
    }))
  if (locationRows.length) {
    const { error } = await supabase.from('locations').insert(locationRows)
    if (error) throw error
  }

  // 4. Vendor accounts, resolved slug → catalog id.
  if (supplierSlugs.length) {
    const { data: supplierRows, error: supplierError } = await supabase
      .from('suppliers')
      .select('id, slug')
      .in('slug', supplierSlugs)
    if (supplierError) throw supplierError
    if (supplierRows?.length) {
      const { error } = await supabase.from('supplier_accounts').insert(
        supplierRows.map((s) => ({ practice_id: practiceId, supplier_id: s.id })),
      )
      if (error) throw error
    }
  }

  // 5. Starter shelf — matched by GTIN, the key stable across catalogs.
  if (starterItems?.length && locationRows[0]) {
    const gtinByDemo = new Map(
      starterItems.map((e) => [e.productId, productById(e.productId)?.gtin]).filter(([, g]) => g),
    )
    const { data: productRows, error: productError } = await supabase
      .from('products')
      .select('id, gtin')
      .in('gtin', [...gtinByDemo.values()])
    if (productError) throw productError
    const idByGtin = new Map((productRows ?? []).map((p) => [p.gtin, p.id]))

    const items = starterItems.flatMap((e) => {
      const productId = idByGtin.get(gtinByDemo.get(e.productId))
      if (!productId) return []
      return [
        {
          id: crypto.randomUUID(),
          practice_id: practiceId,
          location_id: locationRows[0].id,
          product_id: productId,
          on_hand: 0,
          par_level: e.par,
          reorder_point: 0,
          reorder_qty: e.reorderQty,
        },
      ]
    })
    if (items.length) {
      const { error } = await supabase.from('inventory_items').insert(items)
      if (error) throw error
    }
  }

  return { ok: true, practiceId }
}

/**
 * Match a stocktake / order-history CSV against the catalog: GTIN first,
 * manufacturer part number next, exact-ish name last — same honesty ladder
 * as contract imports, plus on-hand and par columns.
 */
export async function matchInventoryRows(rows, mapping) {
  const contractMatched = await matchContractRows(rows, mapping)
  return contractMatched.map((m, i) => {
    const row = rows[i]
    const onHand = parseInteger(mapping.onHand ? row[mapping.onHand] : null, 0)
    const parLevel = parseInteger(mapping.parLevel ? row[mapping.parLevel] : null, 0)
    return {
      ...m,
      onHand: Math.max(0, onHand),
      parLevel: Math.max(0, parLevel),
      // Contract rows need a price to be applicable; a stocktake row only
      // needs to know which product it is.
      usable: Boolean(m.product),
    }
  })
}

/** Create inventory items from matched import rows; existing items update counts. */
export async function importInventoryRows(matched) {
  const usable = matched.filter((m) => m.usable && m.product)

  if (isDemo) {
    const s = store()
    let created = 0
    let updated = 0
    for (const m of usable) {
      const existing = s.inventory.find((r) => r.productId === m.product.id)
      if (existing) {
        existing.onHand = m.onHand
        if (m.parLevel > 0) existing.parLevel = m.parLevel
        existing.lastCountedAt = new Date().toISOString()
        recomputeRow(existing)
        updated += 1
      } else {
        const row = buildInventoryRow(m.product.id, {
          onHand: m.onHand,
          par: m.parLevel,
          reorderPoint: 0,
          reorderQty: Math.max(1, Math.ceil(m.parLevel / 2)),
          lastCountedAt: new Date().toISOString(),
        })
        if (row) {
          s.inventory.push(row)
          created += 1
        }
      }
    }
    emit()
    return { created, updated, skipped: matched.length - usable.length }
  }

  const profile = { practice_id: await myPracticeId() }
  const { data: primary } = await supabase
    .from('locations')
    .select('id')
    .order('is_primary', { ascending: false })
    .limit(1)
    .single()
  if (!primary) throw new Error('Create a location first')

  let created = 0
  let updated = 0
  for (const m of usable) {
    const { data: existing } = await supabase
      .from('inventory_items')
      .select('id')
      .eq('product_id', m.product.id)
      .eq('location_id', primary.id)
      .maybeSingle()
    if (existing) {
      const { error } = await supabase
        .from('inventory_items')
        .update({
          on_hand: m.onHand,
          ...(m.parLevel > 0 ? { par_level: m.parLevel } : {}),
          last_counted_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) throw error
      updated += 1
    } else {
      const { error } = await supabase.from('inventory_items').insert({
        practice_id: profile.practice_id,
        location_id: primary.id,
        product_id: m.product.id,
        on_hand: m.onHand,
        par_level: m.parLevel,
        reorder_point: 0,
        reorder_qty: Math.max(1, Math.ceil(m.parLevel / 2)),
        last_counted_at: new Date().toISOString(),
      })
      if (error) throw error
      created += 1
    }
  }
  return { created, updated, skipped: matched.length - usable.length }
}

// --- landed cost --------------------------------------------------------------

/**
 * True landed cost of a basket across every vendor the practice can order
 * from: goods + shipping (thresholds, flat fees, surcharges) + the ship-to
 * state's tax rule, ranked so "free shipping" only wins when its landed
 * total is actually lowest. Contract prices are already inside the offer
 * prices, so rebates arrive pre-applied rather than double-counted.
 *
 * `lines`: [{ id, productId, name, quantity, onHand?, dailyBurn? }]
 */
export async function getBasketLandedAnalysis(lines) {
  if (!lines.length) return null

  const offerRows = await Promise.all(
    lines.map(async (l) => [l.productId, await compareOffers(l.productId)]),
  )
  const offersByProduct = Object.fromEntries(offerRows)

  const engineLines = lines.map((l) => ({
    id: l.id ?? l.productId,
    productId: l.productId,
    name: l.name ?? l.productName ?? l.productId,
    quantity: l.quantity,
    urgentDays:
      l.dailyBurn > 0 && l.onHand != null ? Math.floor(l.onHand / l.dailyBurn) : null,
    offers: Object.fromEntries(
      (offersByProduct[l.productId] ?? [])
        .filter((o) => o.inStock && o.hasAccount)
        .map((o) => [
          o.supplierId,
          { price: o.price, unitPrice: o.unitPrice, packSize: o.packSize ?? 1, inStock: true },
        ]),
    ),
  }))

  // Vendors that appear in at least one line's placeable offers. Live, their
  // shipping economics come from the suppliers table (migration 0009) — the
  // demo constants only describe the demo.
  const vendorIds = new Set(engineLines.flatMap((l) => Object.keys(l.offers)))
  let vendors
  if (isDemo) {
    vendors = SUPPLIERS.filter((s) => vendorIds.has(s.id)).map((s) => ({
      id: s.id,
      name: s.name,
      shipFee: s.shipFee ?? 0,
      freeShipOver: s.freeShipOver ?? 0,
      surcharge: s.surcharge ?? 0,
      orderMinimum: s.orderMinimum ?? 0,
      leadDays: s.leadDays ?? null,
    }))
  } else {
    if (!vendorIds.size) return null
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name, free_ship_over, flat_ship_fee, avg_lead_days, order_minimum, surcharge')
      .in('id', [...vendorIds])
    if (error) throw error
    vendors = (data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      shipFee: Number(s.flat_ship_fee ?? 0),
      freeShipOver: Number(s.free_ship_over ?? 0),
      surcharge: Number(s.surcharge ?? 0),
      orderMinimum: Number(s.order_minimum ?? 0),
      leadDays: s.avg_lead_days ?? null,
    }))
  }
  if (!vendors.length) return null

  const practice = isDemo ? store().practice : await getPractice()
  const tax = {
    rate: practice?.taxRate ?? 0,
    taxShipping: practice?.taxShipping ?? false,
    exempt: practice?.taxExempt ?? false,
  }

  return { ...computeLandedTotals({ lines: engineLines, vendors, tax }), tax }
}

// --- compliance & training ----------------------------------------------------

let demoCredentials = null
function credentialRows() {
  if (!demoCredentials) demoCredentials = CREDENTIALS.map((c) => ({ ...c }))
  return demoCredentials
}

const addMonthsIso = (iso, months) => {
  const d = new Date(iso)
  d.setMonth(d.getMonth() + months)
  return d.toISOString()
}

/** Certifications and registrations, soonest-expiring first. */
export async function listCredentials() {
  if (isDemo) {
    return credentialRows()
      .slice()
      .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))
  }
  const { data, error } = await supabase
    .from('credentials')
    .select('*')
    .order('expires_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    holder: c.holder,
    authority: c.authority,
    cadenceMonths: c.cadence_months,
    completedAt: c.completed_at,
    expiresAt: c.expires_at,
    renewals: c.renew_url ? [{ label: 'Renew', url: c.renew_url }] : [],
    notes: c.notes,
  }))
}

/** Record a completed renewal: today (or a given date) plus the cadence. */
export async function renewCredential(id, { completedAt } = {}) {
  const done = completedAt ?? new Date().toISOString()
  if (isDemo) {
    const cred = credentialRows().find((c) => c.id === id)
    if (!cred) throw new Error('Certification not found')
    cred.completedAt = done
    cred.expiresAt = addMonthsIso(done, cred.cadenceMonths)
    emit()
    return { ok: true, expiresAt: cred.expiresAt }
  }
  const { data, error } = await supabase
    .from('credentials')
    .select('cadence_months')
    .eq('id', id)
    .single()
  if (error) throw error
  const { error: updateError } = await supabase
    .from('credentials')
    .update({ completed_at: done, expires_at: addMonthsIso(done, data.cadence_months) })
    .eq('id', id)
  if (updateError) throw updateError
  return { ok: true }
}

export async function saveCredential({ name, holder, authority, cadenceMonths, completedAt, renewUrl, notes }) {
  const done = completedAt ?? new Date().toISOString()
  const expires = addMonthsIso(done, cadenceMonths)
  if (isDemo) {
    credentialRows().push({
      id: `cred-${Date.now().toString(36)}`,
      name,
      holder,
      authority: authority || 'Practice policy',
      cadenceMonths,
      completedAt: done,
      expiresAt: expires,
      renewals: renewUrl ? [{ label: 'Renewal link', url: renewUrl }] : [],
      notes: notes ?? '',
    })
    emit()
    return { ok: true }
  }
  const profile = { practice_id: await myPracticeId() }
  const { error } = await supabase.from('credentials').insert({
    practice_id: profile.practice_id,
    name,
    holder,
    authority: authority || null,
    cadence_months: cadenceMonths,
    completed_at: done,
    expires_at: expires,
    renew_url: renewUrl || null,
    notes: notes || null,
  })
  if (error) throw error
  emit()
  return { ok: true }
}

export async function removeCredential(id) {
  if (isDemo) {
    demoCredentials = credentialRows().filter((c) => c.id !== id)
    emit()
    return { ok: true }
  }
  const { error } = await supabase.from('credentials').delete().eq('id', id)
  if (error) throw error
  emit()
  return { ok: true }
}

// --- Dentin's own subscription (Stripe) ---------------------------------------

/**
 * The practice's Dentin plan, mirrored from Stripe by the billing webhook.
 * Demo mode shows a furnished trial so the screen is explorable.
 */
export async function getSubscription() {
  if (isDemo) {
    return {
      demo: true,
      status: 'trialing',
      quantity: 1,
      trialEnd: addDaysIso(new Date().toISOString(), 62),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    }
  }
  const { data, error } = await supabase.from('subscriptions').select('*').maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    status: data.status,
    priceId: data.price_id,
    quantity: data.quantity,
    currentPeriodEnd: data.current_period_end,
    trialEnd: data.trial_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
    hasCustomer: Boolean(data.stripe_customer_id),
  }
}

/** Statuses that keep the app open. past_due keeps access during retries. */
export const ACTIVE_SUB_STATUSES = ['trialing', 'active', 'past_due']

async function billingRedirect(path, payload) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Sign in first')
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Billing request failed (${res.status})`)
  window.location.assign(body.url)
}

/** Redirects to Stripe Checkout (subscription with trial). */
const REFERRAL_KEY = 'dentin:referral'

/**
 * Remember who sent them. An affiliate shares
 * dentininventory.com/?ref=tonyacode2026; the code is kept until checkout,
 * where it becomes both the customer's discount and the attribution.
 */
export function captureReferralCode() {
  if (typeof window === 'undefined') return null
  const fromUrl = new URLSearchParams(window.location.search).get('ref')
  if (fromUrl) {
    const clean = fromUrl.trim().slice(0, 64)
    if (clean) localStorage.setItem(REFERRAL_KEY, clean)
  }
  return localStorage.getItem(REFERRAL_KEY)
}

export function referralCode() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFERRAL_KEY)
}

export function setReferralCode(code) {
  const clean = String(code ?? '').trim().slice(0, 64)
  if (clean) localStorage.setItem(REFERRAL_KEY, clean)
  else localStorage.removeItem(REFERRAL_KEY)
}

export async function startSubscriptionCheckout(plan = 'annual', returnTo) {
  if (isDemo) throw new Error('Billing activates once the app runs on Supabase with Stripe keys.')
  const ref = referralCode()
  return billingRedirect('/api/billing/checkout', {
    plan,
    ...(returnTo ? { returnTo } : {}),
    ...(ref ? { referralCode: ref } : {}),
  })
}

/**
 * The minimum footing checkout needs: a practice row claimed by this user.
 * Called from onboarding's trial step, which runs BEFORE locations and the
 * rest of setup exist; completePracticeSetup later resumes on the same
 * practice instead of minting a second one. Idempotent — an already-claimed
 * practice just gets its step-1 details refreshed.
 */
export async function claimPracticeShell(practice) {
  if (isDemo) return { ok: true, practiceId: 'demo' }

  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) throw new Error('Not signed in')

  const fields = {
    name: practice.name,
    legal_name: practice.legalName || null,
    phone: practice.phone || null,
    email: practice.email || null,
  }

  const { data: prof, error: profError } = await supabase
    .from('profiles')
    .select('practice_id')
    .eq('id', userId)
    .maybeSingle()
  if (profError) throw profError

  if (prof?.practice_id) {
    const { error } = await supabase.from('practices').update(fields).eq('id', prof.practice_id)
    if (error) throw error
    return { ok: true, practiceId: prof.practice_id }
  }

  const practiceId = crypto.randomUUID()
  const { error: insertError } = await supabase
    .from('practices')
    .insert({ id: practiceId, ...fields })
  if (insertError) throw insertError
  const { error: claimError } = await supabase
    .from('profiles')
    .update({ practice_id: practiceId })
    .eq('id', userId)
  if (claimError) throw claimError
  return { ok: true, practiceId }
}

/** Redirects to the Stripe customer portal (card, invoices, cancel). */
export async function openBillingPortal() {
  if (isDemo) throw new Error('Billing activates once the app runs on Supabase with Stripe keys.')
  return billingRedirect('/api/billing/portal')
}

// --- vendor payments ---------------------------------------------------------

export async function listPaymentMethods() {
  if (isDemo) {
    if (!demoPaymentMethods) demoPaymentMethods = PAYMENT_METHODS.map((m) => ({ ...m }))
    return demoPaymentMethods
  }
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .order('is_default', { ascending: false })
  if (error) throw error
  return (data ?? []).map((m) => ({
    id: m.id,
    kind: m.kind,
    label: m.label,
    detail: m.detail,
    isDefault: m.is_default,
  }))
}

export async function savePaymentMethod({ kind, label, detail, isDefault = false }) {
  if (isDemo) {
    await listPaymentMethods()
    if (isDefault) demoPaymentMethods.forEach((m) => (m.isDefault = false))
    demoPaymentMethods.push({
      id: `pm-${Date.now().toString(36)}`,
      kind,
      label,
      detail,
      isDefault: isDefault || demoPaymentMethods.length === 0,
    })
    emit()
    return { ok: true }
  }
  const profile = { practice_id: await myPracticeId() }
  // Mirror the demo rules: making this the default clears the old default
  // (the partial unique index allows only one), and the first method ever
  // added becomes the default automatically.
  if (isDefault) {
    const { error: clearError } = await supabase
      .from('payment_methods')
      .update({ is_default: false })
      .eq('practice_id', profile.practice_id)
      .eq('is_default', true)
    if (clearError) throw clearError
  }
  const { count } = await supabase
    .from('payment_methods')
    .select('id', { count: 'exact', head: true })
  const { error } = await supabase.from('payment_methods').insert({
    practice_id: profile.practice_id,
    kind,
    label,
    detail,
    is_default: isDefault || (count ?? 0) === 0,
  })
  if (error) throw error
  emit()
  return { ok: true }
}

export async function removePaymentMethod(id) {
  if (isDemo) {
    await listPaymentMethods()
    demoPaymentMethods = demoPaymentMethods.filter((m) => m.id !== id)
    emit()
    return { ok: true }
  }
  const { error } = await supabase.from('payment_methods').delete().eq('id', id)
  if (error) throw error
  emit()
  return { ok: true }
}

/**
 * Settle an order with the vendor. In demo mode the payment posts instantly;
 * against Supabase the payment row is recorded and the order marked paid —
 * actual money movement rides on the practice's connected processor (see
 * docs/INTEGRATIONS.md), which is deliberately outside this app's trust
 * boundary.
 */
export async function payOrder(orderId, { methodId }) {
  if (isDemo) {
    const s = store()
    const order = s.orders.find((o) => o.id === orderId)
    if (!order) throw new Error('Order not found')
    if (order.paymentStatus === 'paid') throw new Error('Already paid')
    const method = (await listPaymentMethods()).find((m) => m.id === methodId)
    if (!method) throw new Error('Pick a payment method')

    order.paymentStatus = 'paid'
    order.paidAt = new Date().toISOString()
    order.paymentMethodId = method.id
    order.paymentMethodLabel = `${method.label} · ${method.detail}`
    const confirmation = `PAY-${String(Date.now()).slice(-6)}`
    order.paymentConfirmation = confirmation
    emit()
    return { ok: true, confirmation, amount: order.total, supplierName: order.supplierName }
  }

  const { error } = await supabase
    .from('orders')
    .update({
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method_id: methodId,
    })
    .eq('id', orderId)
  if (error) throw error
  emit()
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
    .order('name')
    .limit(200)
  if (query) {
    // PostgREST's or() filter is comma-delimited with parens, so strip those
    // from user-typed text — a stray "," must not split the filter apart.
    const safe = query.replace(/[,()]/g, ' ').trim()
    if (safe) q = q.or(`name.ilike.%${safe}%,brand.ilike.%${safe}%,gtin.ilike.%${safe}%`)
  }
  const { data, error } = await q
  if (error) throw error

  // Search hits carry a "from $X · N vendors" preview — one batched offers
  // query for the whole result page, not a lookup per row.
  const best = new Map()
  if (query && data.length) {
    const { data: offers } = await supabase
      .from('supplier_offers')
      .select('product_id, price')
      .in('product_id', data.map((p) => p.id))
      .eq('in_stock', true)
    for (const o of offers ?? []) {
      const price = Number(o.price)
      const b = best.get(o.product_id)
      if (!b) best.set(o.product_id, { price, count: 1 })
      else {
        b.count += 1
        if (price < b.price) b.price = price
      }
    }
  }

  // RLS scopes this to the caller's practice; without it "Add" happily
  // re-adds a tracked product and surfaces a raw duplicate-key error.
  const { data: trackedRows } = await supabase.from('inventory_items').select('product_id')
  const trackedSet = new Set((trackedRows ?? []).map((t) => t.product_id))

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
    tracked: trackedSet.has(p.id),
    bestPrice: best.get(p.id)?.price ?? null,
    offerCount: best.get(p.id)?.count ?? 0,
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

  const profile = { practice_id: await myPracticeId() }
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
  emit()
  return { ok: true }
}

// --- contract pricing -------------------------------------------------------
/** key: `${supplierId}:${mfrSku}` → the practice's negotiated price */
let demoContracts = new Map()

function contractKey(supplierId, mfrSku) {
  return `${supplierId}:${mfrSku}`
}

/**
 * Match imported price-file rows against the catalog.
 *
 * Barcode first, then manufacturer part number, then a normalized description.
 * Nothing is applied here — this only reports what *would* match, so the
 * import can be previewed before it changes any price the practice sees.
 */
export async function matchContractRows(rows, mapping) {
  const catalog = isDemo
    ? PRODUCTS.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        gtin: p.gtin,
        mfrSku: p.sku,
        packSize: p.packSize,
        unit: p.unit,
      }))
    : await (async () => {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, brand, gtin, mfr_sku, pack_size, unit')
          .limit(5000)
        // A failed catalog read must be an error, not "nothing matched".
        if (error) throw error
        return (data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          gtin: p.gtin,
          mfrSku: p.mfr_sku,
          packSize: p.pack_size,
          unit: p.unit,
        }))
      })()

  const byGtin = new Map(catalog.filter((p) => p.gtin).map((p) => [String(p.gtin), p]))
  const bySku = new Map(catalog.filter((p) => p.mfrSku).map((p) => [p.mfrSku.toUpperCase(), p]))
  const normalize = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const byName = new Map(catalog.map((p) => [normalize(p.name), p]))

  return rows.map((row, index) => {
    const gtin = mapping.gtin ? String(row[mapping.gtin] ?? '').replace(/\D/g, '') : ''
    const mfrSku = mapping.mfrSku ? String(row[mapping.mfrSku] ?? '').trim() : ''
    const description = mapping.description ? row[mapping.description] : ''
    const price = parseMoney(mapping.price ? row[mapping.price] : null)
    const packSize = parseInteger(mapping.packSize ? row[mapping.packSize] : null, 1)
    const vendorSku = mapping.vendorSku ? String(row[mapping.vendorSku] ?? '').trim() : ''

    let product = null
    let matchedBy = null

    if (gtin && byGtin.has(gtin)) {
      product = byGtin.get(gtin)
      matchedBy = 'gtin'
    } else if (mfrSku && bySku.has(mfrSku.toUpperCase())) {
      product = bySku.get(mfrSku.toUpperCase())
      matchedBy = 'mpn'
    } else if (description) {
      const hit = byName.get(normalize(description))
      if (hit) {
        product = hit
        matchedBy = 'name'
      }
    }

    return {
      index,
      gtin: gtin || null,
      mfrSku: mfrSku || null,
      vendorSku: vendorSku || null,
      description: description || product?.name || '—',
      price,
      packSize,
      product,
      matchedBy,
      // A row with no price cannot be applied even if the product matched.
      usable: Boolean(product && price != null && price >= 0),
      issue:
        price == null
          ? 'No price found in the mapped column'
          : !product
            ? 'No catalog product matched'
            : null,
    }
  })
}

/** Apply matched rows as this practice's contracted pricing for one vendor. */
export async function importContractPrices(supplierId, matched) {
  const usable = matched.filter((m) => m.usable)

  if (isDemo) {
    for (const row of usable) {
      demoContracts.set(contractKey(supplierId, row.product.mfrSku), {
        price: row.price,
        packSize: row.packSize || row.product.packSize,
        vendorSku: row.vendorSku,
        matchedBy: row.matchedBy,
        importedAt: new Date().toISOString(),
      })
    }
    emit()
    return { applied: usable.length, skipped: matched.length - usable.length }
  }

  const profile = { practice_id: await myPracticeId() }
  // The identity index is expression-based (coalesce on gtin/mfr_sku), which
  // upsert's plain column list cannot target — Postgres rejects it with
  // 42P10. Replace today's sheet for this vendor instead: delete, then
  // insert fresh rows.
  const today = new Date().toISOString().slice(0, 10)
  const { error: clearError } = await supabase
    .from('contract_prices')
    .delete()
    .eq('practice_id', profile.practice_id)
    .eq('supplier_id', supplierId)
    .eq('effective_from', today)
  if (clearError) throw clearError
  const { error } = await supabase.from('contract_prices').insert(
    usable.map((row) => ({
      practice_id: profile.practice_id,
      supplier_id: supplierId,
      product_id: row.product.id,
      gtin: row.gtin,
      mfr_sku: row.mfrSku,
      vendor_sku: row.vendorSku,
      description: row.description,
      price: row.price,
      pack_size: row.packSize,
      matched_by: row.matchedBy,
      source: 'csv',
    })),
  )
  if (error) throw error
  emit()
  return { applied: usable.length, skipped: matched.length - usable.length }
}

/** Which vendors have contracted pricing loaded, and how much of it. */
export async function contractPriceSummary() {
  if (isDemo) {
    const counts = new Map()
    for (const key of demoContracts.keys()) {
      const supplierId = key.split(':')[0]
      counts.set(supplierId, (counts.get(supplierId) ?? 0) + 1)
    }
    return [...counts.entries()].map(([supplierId, count]) => ({ supplierId, count }))
  }

  const { data } = await supabase.from('contract_prices').select('supplier_id')
  const counts = new Map()
  for (const row of data ?? []) {
    counts.set(row.supplier_id, (counts.get(row.supplier_id) ?? 0) + 1)
  }
  return [...counts.entries()].map(([supplierId, count]) => ({ supplierId, count }))
}

export async function clearContractPrices(supplierId) {
  if (isDemo) {
    for (const key of [...demoContracts.keys()]) {
      if (key.startsWith(`${supplierId}:`)) demoContracts.delete(key)
    }
    emit()
    return { ok: true }
  }
  const { error } = await supabase.from('contract_prices').delete().eq('supplier_id', supplierId)
  if (error) throw error
  emit()
  return { ok: true }
}

// --- vendors ----------------------------------------------------------------
let demoAccounts = null

function accounts() {
  if (!demoAccounts) demoAccounts = SUPPLIER_ACCOUNTS.map((a) => ({ ...a }))
  return demoAccounts
}

/**
 * Every supplier, annotated with whether the practice can order from it today.
 * That flag — not price — is what decides whether a quote is actionable.
 */
export async function listVendors() {
  if (isDemo) {
    const orders = store().orders
    const priced = SUPPLIERS.map((s) => {
      const account = accounts().find((a) => a.supplierId === s.id) ?? null
      const mine = orders.filter((o) => o.supplierId === s.id && o.status !== 'cancelled')
      const spendRow = SUPPLIER_SPEND.find((x) => x.id === s.id)

      return {
        supplierId: s.id,
        name: s.name,
        website: s.website,
        blurb: s.blurb,
        strengths: s.strengths ?? [],
        caveats: s.caveats ?? [],
        freeShipOver: s.freeShipOver,
        shipFee: s.shipFee,
        leadDays: s.leadDays,
        priced: true,
        hasAccount: Boolean(account),
        accountNumber: account?.accountNumber ?? null,
        repName: account?.repName ?? null,
        repPhone: account?.repPhone ?? null,
        repEmail: account?.repEmail ?? null,
        terms: account?.terms ?? null,
        isPreferred: account?.isPreferred ?? false,
        openedAt: account?.openedAt ?? null,
        orderCount: spendRow?.orders ?? mine.length,
        totalSpend: spendRow?.spend ?? mine.reduce((sum, o) => sum + o.total, 0),
        lastOrderedAt: mine[0]?.placedAt ?? null,
      }
    })

    // Accounts held with directory vendors Dentin does not price yet (a direct
    // maker, a local lab). They belong on "Your accounts" — they are real
    // relationships — just without pricing claims attached.
    const pricedIds = new Set(SUPPLIERS.map((s) => s.id))
    const directoryAccounts = accounts()
      .filter((a) => !pricedIds.has(a.supplierId))
      .map((account) => {
        const dir = VENDOR_DIRECTORY.find((d) => d.id === account.supplierId)
        return {
          supplierId: account.supplierId,
          name: dir?.name ?? account.supplierId,
          website: dir?.website ?? null,
          blurb: dir?.blurb ?? '',
          strengths: dir?.knownFor ?? [],
          caveats: [],
          freeShipOver: 0,
          shipFee: 0,
          leadDays: null,
          priced: false,
          kind: dir?.kind ?? null,
          hq: dir?.hq ?? null,
          hasAccount: true,
          accountNumber: account.accountNumber ?? null,
          repName: account.repName ?? null,
          repPhone: account.repPhone ?? null,
          repEmail: account.repEmail ?? null,
          terms: account.terms ?? null,
          isPreferred: account.isPreferred ?? false,
          openedAt: account.openedAt ?? null,
          orderCount: 0,
          totalSpend: 0,
          lastOrderedAt: null,
        }
      })

    return [...priced, ...directoryAccounts].sort((a, b) => {
      if (a.hasAccount !== b.hasAccount) return a.hasAccount ? -1 : 1
      if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1
      return b.totalSpend - a.totalSpend
    })
  }

  const { data, error } = await supabase.from('v_vendors').select('*')
  if (error) throw error

  return data
    .map((v) => ({
      supplierId: v.supplier_id,
      name: v.name,
      website: v.website,
      blurb: v.notes,
      strengths: [],
      caveats: [],
      freeShipOver: Number(v.free_ship_over ?? 0),
      shipFee: Number(v.flat_ship_fee ?? 0),
      leadDays: v.avg_lead_days,
      priced: true,
      hasAccount: v.has_account,
      accountNumber: v.account_number,
      repName: v.rep_name,
      repPhone: v.rep_phone,
      repEmail: v.rep_email,
      terms: v.terms,
      isPreferred: v.is_preferred,
      openedAt: v.opened_at,
      orderCount: Number(v.order_count ?? 0),
      totalSpend: Number(v.total_spend ?? 0),
      lastOrderedAt: v.last_ordered_at,
    }))
    .sort((a, b) => {
      if (a.hasAccount !== b.hasAccount) return a.hasAccount ? -1 : 1
      if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1
      return b.totalSpend - a.totalSpend
    })
}

/**
 * The dental vendor landscape: every vendor Dentin prices plus the wider
 * directory of real industry vendors (directory metadata ships with the app,
 * so this works identically in demo and live). Each entry reports whether a
 * price feed exists and whether the practice already holds the account.
 */
export async function listVendorDirectory() {
  const vendors = await listVendors()
  const vendorById = new Map(vendors.map((v) => [v.supplierId, v]))

  return VENDOR_DIRECTORY.map((d) => {
    const linked = vendorById.get(d.supplierId ?? d.id) ?? null
    return {
      directoryId: d.id,
      supplierId: d.supplierId ?? d.id,
      name: linked?.name ?? d.name,
      kind: d.kind,
      hq: d.hq ?? null,
      website: linked?.website ?? d.website ?? null,
      blurb: linked?.blurb ?? d.blurb ?? '',
      knownFor: d.knownFor ?? linked?.strengths ?? [],
      priced: Boolean(linked?.priced),
      hasAccount: Boolean(linked?.hasAccount),
      vendor: linked, // full vendor row when priced or account held
    }
  })
}

export async function saveVendorAccount(supplierId, patch) {
  if (isDemo) {
    const existing = accounts().find((a) => a.supplierId === supplierId)
    if (existing) Object.assign(existing, patch)
    else accounts().push({ supplierId, ...patch })
    emit()
    return { ok: true }
  }

  // Directory-only vendors have no row in the live suppliers catalog yet, so
  // an account with one cannot be stored until that catalog entry exists.
  if (String(supplierId).startsWith('dir-')) {
    throw new Error('This vendor is not in your live catalog yet — contact support to add it.')
  }

  const profile = { practice_id: await myPracticeId() }
  const { error } = await supabase.from('supplier_accounts').upsert(
    {
      practice_id: profile.practice_id,
      supplier_id: supplierId,
      account_number: patch.accountNumber ?? null,
      rep_name: patch.repName ?? null,
      rep_phone: patch.repPhone ?? null,
      rep_email: patch.repEmail ?? null,
      terms: patch.terms ?? null,
      is_preferred: patch.isPreferred ?? false,
      opened_at: patch.openedAt ?? null,
    },
    { onConflict: 'practice_id,supplier_id' },
  )
  if (error) throw error
  emit()
  return { ok: true }
}

export async function removeVendorAccount(supplierId) {
  if (isDemo) {
    demoAccounts = accounts().filter((a) => a.supplierId !== supplierId)
    emit()
    return { ok: true }
  }
  const { error } = await supabase
    .from('supplier_accounts')
    .delete()
    .eq('supplier_id', supplierId)
  if (error) throw error
  emit()
  return { ok: true }
}

/**
 * Competitive pricing sweep.
 *
 * For every tracked item, compares the best price reachable through an
 * existing account against the best price on the market. The gap is money the
 * practice cannot capture until an account is opened — so it is reported
 * separately from savings it can act on today.
 */
export async function getPriceOpportunities() {
  const inventory = await listInventory()
  const vendors = await listVendors()
  const accountIds = new Set(vendors.filter((v) => v.hasAccount).map((v) => v.supplierId))

  const rows = []

  for (const item of inventory) {
    const offers = (await compareOffers(item.productId)).filter((o) => o.inStock)
    if (!offers.length) continue

    const accountBest = offers.find((o) => accountIds.has(o.supplierId)) ?? null
    const marketBest = offers[0]
    if (!accountBest || !marketBest) continue
    if (marketBest.supplierId === accountBest.supplierId) continue

    const qtyNeeded = Math.max(item.reorderQty, item.parLevel - item.onHand, 1)
    const perOrder = (accountBest.price - marketBest.price) * qtyNeeded
    if (perOrder <= 0.005) continue

    rows.push({
      inventoryItemId: item.id,
      productId: item.productId,
      productName: item.productName,
      brand: item.brand,
      unit: item.unit,
      categorySlug: item.categorySlug,
      imageUrl: item.imageUrl,
      quantity: qtyNeeded,
      accountSupplierId: accountBest.supplierId,
      accountSupplierName: accountBest.supplierName,
      accountPrice: accountBest.price,
      accountUnitPrice: accountBest.unitPrice,
      marketSupplierId: marketBest.supplierId,
      marketSupplierName: marketBest.supplierName,
      marketPrice: marketBest.price,
      marketUnitPrice: marketBest.unitPrice,
      marketLeadDays: marketBest.leadDays,
      savingsPerOrder: Number(perOrder.toFixed(2)),
      pctCheaper: ((accountBest.price - marketBest.price) / accountBest.price) * 100,
    })
  }

  rows.sort((a, b) => b.savingsPerOrder - a.savingsPerOrder)

  // Group the opportunity by the vendor that would need opening.
  const byVendor = new Map()
  for (const r of rows) {
    const entry = byVendor.get(r.marketSupplierId) ?? {
      supplierId: r.marketSupplierId,
      name: r.marketSupplierName,
      items: 0,
      savings: 0,
    }
    entry.items += 1
    entry.savings += r.savingsPerOrder
    byVendor.set(r.marketSupplierId, entry)
  }

  return {
    rows,
    totalSavings: Number(rows.reduce((s, r) => s + r.savingsPerOrder, 0).toFixed(2)),
    byVendor: [...byVendor.values()].sort((a, b) => b.savings - a.savings),
    accountCount: accountIds.size,
    vendorCount: vendors.length,
  }
}

export async function getPractice() {
  if (isDemo) return store().practice
  // maybeSingle: a signed-in user who has not claimed a practice yet must
  // get null here, not a thrown PGRST116.
  const { data, error } = await supabase.from('practices').select('*').limit(1).maybeSingle()
  if (error) throw error
  if (!data) return null
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
    // Landed-cost inputs (migration 0009).
    taxRate: Number(data.tax_rate ?? 0),
    taxShipping: Boolean(data.tax_shipping),
    taxExempt: Boolean(data.tax_exempt),
  }
}

/** Save the practice's own details — address, contact, tax rule. */
export async function updatePractice(patch) {
  if (isDemo) {
    Object.assign(store().practice, patch)
    emit()
    return { ok: true }
  }

  const columns = {
    name: 'name',
    legalName: 'legal_name',
    phone: 'phone',
    email: 'email',
    website: 'website',
    address1: 'address_1',
    address2: 'address_2',
    city: 'city',
    region: 'region',
    postalCode: 'postal_code',
    taxRate: 'tax_rate',
    taxShipping: 'tax_shipping',
    taxExempt: 'tax_exempt',
  }
  const row = {}
  for (const [key, column] of Object.entries(columns)) {
    if (patch[key] !== undefined) row[column] = patch[key] === '' ? null : patch[key]
  }
  if (!Object.keys(row).length) return { ok: true }

  const { error } = await supabase.from('practices').update(row).eq('id', await myPracticeId())
  if (error) throw error
  emit()
  return { ok: true }
}

const PREF_COLUMNS = {
  lowStock: 'low_stock',
  expiring: 'expiring_lots',
  serviceDue: 'service_due',
  priceDrops: 'price_drops',
  orderUpdates: 'order_updates',
}
const DEFAULT_PREFS = {
  lowStock: true,
  expiring: true,
  serviceDue: true,
  priceDrops: true,
  orderUpdates: true,
}
let demoPrefs = null

/** Which alerts this user wants pushed. */
export async function getNotificationPrefs() {
  if (isDemo) return { ...DEFAULT_PREFS, ...(demoPrefs ?? {}) }

  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return { ...DEFAULT_PREFS }
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('*')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) throw error
  if (!data) return { ...DEFAULT_PREFS }
  return Object.fromEntries(
    Object.entries(PREF_COLUMNS).map(([key, column]) => [key, Boolean(data[column])]),
  )
}

export async function saveNotificationPrefs(patch) {
  if (isDemo) {
    demoPrefs = { ...DEFAULT_PREFS, ...(demoPrefs ?? {}), ...patch }
    emit()
    return { ok: true }
  }

  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) throw new Error('Sign in first')
  const current = await getNotificationPrefs()
  const merged = { ...current, ...patch }
  const { error } = await supabase.from('notification_prefs').upsert(
    {
      user_id: auth.user.id,
      practice_id: await myPracticeId(),
      ...Object.fromEntries(
        Object.entries(PREF_COLUMNS).map(([key, column]) => [column, merged[key]]),
      ),
    },
    { onConflict: 'user_id' },
  )
  if (error) throw error
  emit()
  return { ok: true }
}

export async function getSpendHistory(months = 12) {
  if (isDemo) return SPEND_HISTORY.slice(-months)

  // Real spend by month from placed orders. A young practice sees real
  // zeros — never the demo's fabricated dollars.
  const since = new Date()
  since.setMonth(since.getMonth() - (months - 1), 1)
  since.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('orders')
    .select('placed_at, total, savings')
    .not('placed_at', 'is', null)
    .neq('status', 'cancelled')
    .gte('placed_at', since.toISOString())
  if (error) throw error

  const buckets = new Map()
  for (let i = 0; i < months; i++) {
    const d = new Date(since.getFullYear(), since.getMonth() + i, 1)
    buckets.set(`${d.getFullYear()}-${d.getMonth()}`, {
      month: d.toLocaleString('en-US', { month: 'short' }),
      spend: 0,
      saved: 0,
    })
  }
  for (const o of data ?? []) {
    const d = new Date(o.placed_at)
    const bucket = buckets.get(`${d.getFullYear()}-${d.getMonth()}`)
    if (!bucket) continue
    bucket.spend += Number(o.total ?? 0)
    bucket.saved += Number(o.savings ?? 0)
  }
  return [...buckets.values()].map((m) => ({
    ...m,
    spend: Math.round(m.spend),
    saved: Math.round(m.saved),
  }))
}

/**
 * Analytics for the Insights screen. Demo mode serves the bundled history;
 * live mode derives the same shapes from order lines.
 */
export async function getInsights(months = 12) {
  const history = await getSpendHistory(months)
  const scale = months / 12

  const inventory = await listInventory()
  const health = inventory.reduce(
    (acc, r) => {
      acc[r.stockStatus] = (acc[r.stockStatus] ?? 0) + 1
      return acc
    },
    { out: 0, low: 0, below_par: 0, ok: 0 },
  )

  let categories
  let suppliers
  let items
  if (isDemo) {
    categories = CATEGORY_SPEND.map((c) => ({
      label: CATEGORIES.find((x) => x.slug === c.slug)?.name ?? c.slug,
      value: Math.round(c.spend * scale),
    })).sort((a, b) => b.value - a.value)

    const totalSupplierSpend = SUPPLIER_SPEND.reduce((s, x) => s + x.spend, 0)
    suppliers = SUPPLIER_SPEND.map((s) => ({
      label: SUPPLIERS.find((x) => x.id === s.id)?.name ?? s.id,
      value: Math.round(s.spend * scale),
      caption: `${Math.round((s.spend / totalSupplierSpend) * 100)}%`,
      orders: s.orders,
    })).sort((a, b) => b.value - a.value)

    items = TOP_ITEMS.map((t) => ({
      label: productById(t.sku)?.name ?? t.sku,
      value: Math.round(t.spend * scale),
    })).sort((a, b) => b.value - a.value)
  } else {
    // Real order lines — a young practice sees honestly-empty charts, not
    // the demo's fabricated dollars.
    const { data: lineRows, error } = await supabase
      .from('order_items')
      .select(
        'line_total, products(name, categories(name)), orders!inner(id, status, suppliers(name))',
      )
      .neq('orders.status', 'draft')
      .neq('orders.status', 'cancelled')
      .limit(2000)
    if (error) throw error

    const catMap = new Map()
    const supMap = new Map()
    const itemMap = new Map()
    for (const r of lineRows ?? []) {
      const amount = Number(r.line_total ?? 0)
      const cat = r.products?.categories?.name ?? 'Uncategorized'
      catMap.set(cat, (catMap.get(cat) ?? 0) + amount)
      const supName = r.orders?.suppliers?.name ?? 'Unknown vendor'
      const sup = supMap.get(supName) ?? { value: 0, orderIds: new Set() }
      sup.value += amount
      if (r.orders?.id) sup.orderIds.add(r.orders.id)
      supMap.set(supName, sup)
      const item = r.products?.name ?? 'Unknown item'
      itemMap.set(item, (itemMap.get(item) ?? 0) + amount)
    }
    const sorted = (m) =>
      [...m.entries()]
        .map(([label, value]) => ({ label, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value)
    const totalSupplierSpend = [...supMap.values()].reduce((s, x) => s + x.value, 0)
    categories = sorted(catMap)
    suppliers = [...supMap.entries()]
      .map(([label, s]) => ({
        label,
        value: Math.round(s.value),
        caption: totalSupplierSpend ? `${Math.round((s.value / totalSupplierSpend) * 100)}%` : '0%',
        orders: s.orderIds.size,
      }))
      .sort((a, b) => b.value - a.value)
    items = sorted(itemMap).slice(0, 8)
  }

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
    // A count is a signed correction (new minus old) — abs() here would turn
    // counting DOWN into an increase. Consumption draws down; the rest add.
    const signed =
      type === 'counted'
        ? quantity
        : ['consumed', 'wasted'].includes(type)
          ? -Math.abs(quantity)
          : Math.abs(quantity)
    row.onHand = Math.max(0, row.onHand + signed)
    if (type === 'counted') row.lastCountedAt = new Date().toISOString()
    if (type === 'received' && (lotNumber || expiresAt)) {
      // The received box is a new lot on the shelf.
      demoLots = [
        ...lots(),
        {
          id: `lot-${Date.now().toString(36)}`,
          inventoryItemId: row.id,
          productName: row.productName,
          brand: row.brand,
          unit: row.unit,
          locationName: row.locationName,
          lotNumber: lotNumber ?? null,
          quantity: Math.abs(quantity),
          expiresAt: expiresAt ?? null,
          receivedAt: new Date().toISOString(),
        },
      ]
    }
    // The item's headline expiry stays the EARLIEST expiring stock — a fresh
    // box must never hide an older lot that is still on the shelf.
    if (expiresAt && (!row.expiresAt || expiresAt < row.expiresAt)) row.expiresAt = expiresAt
    recomputeRow(row)
    ledger().unshift({
      id: `mv-${Date.now().toString(36)}-${ledger().length}`,
      inventoryItemId,
      productName: row.productName,
      type,
      quantity: signed,
      reason,
      lotNumber,
      userName: TEAM[0].name,
      userInitials: TEAM[0].initials,
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
  emit()
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
  emit()
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
    // Same numbering scheme as drafts (max reference + 1) — counting array
    // length collides with ids the moment any order is ever removed.
    const maxRef = s.orders.reduce(
      (max, o) => Math.max(max, Number(String(o.reference ?? '').replace(/\D/g, '')) || 0),
      1042,
    )
    const supplier = SUPPLIERS.find((sup) => sup.id === supplierId)
    const order = {
      id: `ord-${maxRef + 1}`,
      reference: `PO-${maxRef + 1}`,
      supplierId,
      supplierName,
      locationId,
      status: 'submitted',
      shipping: null,
      savings: Number(savings.toFixed(2)),
      placedAt: new Date().toISOString(),
      expectedAt: addDaysIso(new Date().toISOString(), supplier?.leadDays ?? 3),
    }
    // The lines go into the store too — an order that opens as "0 items" and
    // can never be checked in is not an order.
    for (const l of lines) {
      s.orderItems.push([order.id, l.productId, l.quantity, l.unitPrice, 0])
    }
    recomputeOrderTotals(order)
    s.orders.unshift(order)
    emit()
    return order
  }

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      practice_id: await myPracticeId(),
      supplier_id: supplierId,
      location_id: locationId,
      status: 'submitted',
      subtotal,
      tax: subtotal * 0.0825,
      total: subtotal * 1.0825,
      savings,
      placed_at: new Date().toISOString(),
      expected_at: addDaysIso(new Date().toISOString(), 4),
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

  emit()
  return order
}

export function recentMovements(limit = 12) {
  return movements.slice(0, limit)
}
