/**
 * Invoices: reconciliation, and the price creep it exposes.
 *
 * The screens hand this module an invoice — pasted, dropped in as CSV, or
 * typed — and get back what Dentin found when it lined the invoice up against
 * the purchase order, the practice's contracted prices, and what the same
 * items cost last time. Nothing is written until a human has looked at that.
 *
 * The arithmetic itself lives in `../reconcile`, which is pure and tested on
 * its own. This file only decides where the three expectations come from, and
 * that decision is the only thing demo mode and live mode disagree about.
 */
import { cents, emit, isDemo, must, myPracticeId, supabase } from '../repoCore'
import { parseCsv, parseInteger, parseMoney } from '../csv'
import { guessInvoiceMapping, reconcileLines, summariseInvoice } from '../reconcile'
import { recordFoundSavings, recordRecoveredOvercharge } from './savings'
import {
  ORDERS,
  ORDER_ITEMS,
  PRACTICE,
  PRODUCTS,
  SUPPLIERS,
  buildInventory,
  productById,
} from '../demoData'

const INVOICE_STATUSES = ['review', 'clean', 'accepted', 'disputed']

const today = () => new Date().toISOString().slice(0, 10)
const isoDate = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)
const normalize = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const supplierNameFor = (supplierId) =>
  SUPPLIERS.find((s) => s.id === supplierId)?.name ?? supplierId ?? 'Unknown vendor'

/** The label the review screen shows for where an expectation came from. */
function sourceLabel(source, orderReference) {
  if (source === 'order') return orderReference ?? 'the purchase order'
  if (source === 'contract') return 'your contract price'
  if (source === 'last_invoice') return 'the last invoice'
  return null
}

// --- demo store ---------------------------------------------------------------
/**
 * Four invoices from the demo practice's own vendors, as they were billed:
 * [sku, quantity, price]. Pack sizes come from the catalog, because that is
 * where they come from in life too.
 *
 * Nothing about what these invoices *conclude* is written down here. The store
 * runs the same engine live mode runs, against the same purchase orders the
 * rest of the app knows about, so the demo can never claim a flag or an
 * overcharge the engine would not actually produce.
 */
const DEMO_SEED = [
  {
    id: 'invc-87330',
    supplierId: 'henry-schein',
    invoiceNumber: 'INV-87330',
    orderId: null,
    daysAgo: 34,
    source: 'email',
    // Someone read this one and accepted it: the unfamiliar items were
    // genuinely the first of their kind, not a price problem.
    status: 'accepted',
    lines: [
      ['MT-N-M', 8, 28.4],
      ['CTX-L3-EL', 6, 22.4],
      ['HAL-SP-35', 4, 17.2],
      ['3M-AT-1262', 2, 62.0],
    ],
  },
  {
    id: 'invc-4471902',
    supplierId: 'benco',
    invoiceNumber: '4471902',
    orderId: 'ord-1040',
    daysAgo: 24,
    source: 'csv',
    status: 'accepted',
    lines: [
      ['MT-N-M', 8, 26.44],
      ['DEN-NP-MM', 4, 41.55],
      ['CTX-L3-EL', 6, 23.31],
      ['SEP-LID-100', 3, 74.12],
      ['CAR-SE-CL', 6, 11.06],
    ],
  },
  {
    id: 'invc-D55180',
    supplierId: 'darby',
    invoiceNumber: 'D-55180',
    orderId: 'ord-1041',
    daysAgo: 10,
    source: 'csv',
    status: null,
    lines: [
      ['DEN-NP-MM', 5, 41.2], // crept up between the PO and the invoice
      ['YNG-PA-SC', 8, 28.86],
      ['MC-ND-856', 6, 37.42],
      ['SSW-245', 5, 18.94],
      ['CAR-SE-CL', 8, 10.55],
      ['RIC-CR-2', 2, 34.18],
      ['DUK-GZ-22', 3, 41.22],
      ['3M-VAN-100', 2, 236.18], // three were ordered
      ['MTX-CW-160', 2, 19.95], // nobody ordered this
    ],
  },
  {
    id: 'invc-88214',
    supplierId: 'henry-schein',
    invoiceNumber: 'INV-88214',
    orderId: null,
    daysAgo: 4,
    source: 'email',
    status: null,
    lines: [
      ['MT-N-M', 10, 31.2], // $28.40 last month
      ['3M-AT-1262', 2, 68.2],
      ['CTX-L3-EL', 6, 22.4],
      ['HAL-SP-35', 4, 17.2],
      ['DEN-AQ-HB', 2, 118.0],
    ],
  },
]

/**
 * The pricing this demo practice has negotiated, per vendor.
 *
 * Deliberately partial — a contract sheet covers the items a practice thought
 * to negotiate, and gloves are the classic omission. The items it misses are
 * the ones that have to be checked against the last invoice instead, which is
 * exactly the case worth showing.
 *
 * Kept here rather than read from the contract-pricing store in
 * `repository.js`: a domain module that imported the seam it is re-exported
 * from would be a cycle.
 */
const DEMO_CONTRACTS = [
  { supplierId: 'henry-schein', productId: 'CTX-L3-EL', price: 22.4 },
  { supplierId: 'henry-schein', productId: 'HAL-SP-35', price: 17.2 },
  { supplierId: 'benco', productId: 'CAR-SE-CL', price: 11.06 },
]

let demoInvoices = null

function demoOrderLines(orderId) {
  const order = ORDERS.find((o) => o.id === orderId)
  if (!order) return null
  return {
    orderId: order.id,
    reference: order.reference,
    supplierId: order.supplierId,
    lines: ORDER_ITEMS.filter(([id]) => id === orderId).map(([, sku, quantity, unitPrice]) => ({
      productId: sku,
      quantity,
      unitPrice,
      packSize: productById(sku)?.packSize ?? 1,
    })),
  }
}

/** Goods, freight and tax the way the order ledger already computes them. */
function demoTotals(supplierId, subtotal) {
  const supplier = SUPPLIERS.find((s) => s.id === supplierId)
  const shipping =
    supplier && supplier.freeShipOver > 0 && subtotal >= supplier.freeShipOver
      ? 0
      : (supplier?.shipFee ?? 0)
  const taxRate = PRACTICE.taxExempt ? 0 : (PRACTICE.taxRate ?? 0)
  const tax = (subtotal + (PRACTICE.taxShipping ? shipping : 0)) * taxRate
  return {
    subtotal: cents(subtotal),
    shipping: cents(shipping),
    tax: cents(tax),
    total: cents(subtotal + shipping + tax),
  }
}

function buildDemoInvoices() {
  const built = []

  // Oldest first, so each invoice only ever sees prices billed before it —
  // the same thing the live query does with `invoice_date <`.
  for (const seed of [...DEMO_SEED].sort((a, b) => b.daysAgo - a.daysAgo)) {
    const invoiceDate = isoDate(seed.daysAgo)
    const order = seed.orderId ? demoOrderLines(seed.orderId) : null

    const priorPrices = built
      .filter((i) => i.supplierId === seed.supplierId)
      .flatMap((i) =>
        i.lines.map((l) => ({
          productId: l.productId,
          price: l.price,
          packSize: l.packSize,
          invoiceDate: i.invoiceDate,
          invoiceNumber: i.invoiceNumber,
        })),
      )

    const lines = reconcileLines({
      lines: seed.lines.map(([sku, quantity, price], i) => {
        const product = productById(sku)
        return {
          id: `${seed.id}-${i}`,
          productId: sku,
          productName: product?.name ?? sku,
          brand: product?.brand ?? null,
          unit: product?.unit ?? null,
          description: product?.name ?? sku,
          gtin: product?.gtin ?? null,
          mfrSku: product?.sku ?? null,
          vendorSku: null,
          quantity,
          packSize: product?.packSize ?? 1,
          price,
        }
      }),
      orderLines: order?.lines ?? [],
      contractPrices: DEMO_CONTRACTS.filter((c) => c.supplierId === seed.supplierId).map((c) => ({
        productId: c.productId,
        price: c.price,
        packSize: productById(c.productId)?.packSize ?? 1,
      })),
      priorPrices,
      supplierName: supplierNameFor(seed.supplierId),
      orderReference: order?.reference ?? null,
    })

    const summary = summariseInvoice(lines)
    const totals = demoTotals(
      seed.supplierId,
      lines.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0),
    )

    built.push({
      id: seed.id,
      supplierId: seed.supplierId,
      supplierName: supplierNameFor(seed.supplierId),
      orderId: seed.orderId,
      orderReference: order?.reference ?? null,
      invoiceNumber: seed.invoiceNumber,
      invoiceDate,
      ...totals,
      source: seed.source,
      status: seed.status ?? summary.status,
      flaggedLines: summary.flaggedLines,
      overcharge: summary.overcharge,
      note: null,
      createdAt: new Date(Date.now() - seed.daysAgo * 86400000).toISOString(),
      lines,
    })
  }

  return built.reverse() // newest first, the order every screen wants
}

function store() {
  if (!demoInvoices) demoInvoices = buildDemoInvoices()
  return demoInvoices
}

// --- what an expectation is built from ---------------------------------------
/** The PO an invoice claims to bill, with its lines priced as ordered. */
async function orderLinesFor(orderId) {
  if (!orderId) return null
  if (isDemo) return demoOrderLines(orderId)

  const data = must(
    await supabase
      .from('orders')
      .select('id, reference, supplier_id, order_items(product_id, quantity, unit_price, pack_size)')
      .eq('id', orderId)
      .maybeSingle(),
    'Read the purchase order',
  )
  if (!data) return null

  return {
    orderId: data.id,
    reference: data.reference,
    supplierId: data.supplier_id,
    lines: (data.order_items ?? []).map((l) => ({
      productId: l.product_id,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unit_price),
      packSize: Number(l.pack_size) || 1,
    })),
  }
}

/** Contracted pricing for one vendor that is in force today. */
async function contractPricesFor(supplierId) {
  if (!supplierId) return []

  if (isDemo) {
    return DEMO_CONTRACTS.filter((c) => c.supplierId === supplierId).map((c) => ({
      productId: c.productId,
      price: c.price,
      packSize: productById(c.productId)?.packSize ?? 1,
      vendorSku: null,
    }))
  }

  const day = today()
  const data = must(
    await supabase
      .from('contract_prices')
      .select('product_id, price, pack_size, vendor_sku, effective_from')
      .eq('supplier_id', supplierId)
      .not('product_id', 'is', null)
      .lte('effective_from', day)
      .or(`effective_to.is.null,effective_to.gte.${day}`)
      .order('effective_from', { ascending: false }),
    'Read contract prices',
  )

  // Newest effective date first, so the first row seen for a product is the
  // one in force — the same rule v_effective_prices applies.
  const byProduct = new Map()
  for (const row of data ?? []) {
    if (byProduct.has(row.product_id)) continue
    byProduct.set(row.product_id, {
      productId: row.product_id,
      price: Number(row.price),
      packSize: Number(row.pack_size) || 1,
      vendorSku: row.vendor_sku,
    })
  }
  return [...byProduct.values()]
}

/**
 * What the same vendor billed for the same items before this invoice.
 *
 * Same vendor only. A price billed by somebody else is not evidence a rep can
 * be held to — "you charged us less last month" is an argument, "your
 * competitor charges less" is a different conversation, and the market-scan
 * screen is already having it.
 */
async function priorPricesFor(supplierId, invoiceDate, { excludeInvoiceId = null } = {}) {
  if (!supplierId) return []

  if (isDemo) {
    return store()
      .filter(
        (i) =>
          i.supplierId === supplierId &&
          i.id !== excludeInvoiceId &&
          (!invoiceDate || String(i.invoiceDate) < String(invoiceDate)),
      )
      .flatMap((i) =>
        i.lines
          .filter((l) => l.productId && l.price != null)
          .map((l) => ({
            productId: l.productId,
            price: l.price,
            packSize: l.packSize,
            invoiceDate: i.invoiceDate,
            invoiceNumber: i.invoiceNumber,
          })),
      )
  }

  let query = supabase
    .from('invoice_lines')
    .select(
      'invoice_id, product_id, price, pack_size, invoices!inner(invoice_date, supplier_id, invoice_number)',
    )
    .eq('invoices.supplier_id', supplierId)
    .not('product_id', 'is', null)
    .not('price', 'is', null)
    .limit(2000)
  // An invoice with no date still has a history worth comparing against; it
  // just cannot say which side of it those prices fall on.
  if (invoiceDate) query = query.lt('invoices.invoice_date', invoiceDate)
  if (excludeInvoiceId) query = query.neq('invoice_id', excludeInvoiceId)

  const data = must(await query, 'Read earlier invoice prices')
  return (data ?? []).map((row) => ({
    productId: row.product_id,
    price: Number(row.price),
    packSize: Number(row.pack_size) || 1,
    invoiceDate: row.invoices?.invoice_date ?? null,
    invoiceNumber: row.invoices?.invoice_number ?? null,
  }))
}

/** The catalog, in the shape the matcher indexes. */
async function catalogForMatching() {
  if (isDemo) {
    return PRODUCTS.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      gtin: p.gtin,
      mfrSku: p.sku,
      packSize: p.packSize,
      unit: p.unit,
    }))
  }

  const data = must(
    await supabase
      .from('products')
      .select('id, name, brand, gtin, mfr_sku, pack_size, unit')
      .limit(5000),
    'Read the catalog',
  )
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    gtin: p.gtin,
    mfrSku: p.mfr_sku,
    packSize: p.pack_size,
    unit: p.unit,
  }))
}

// --- parsing and matching ----------------------------------------------------
/** Footer arithmetic, which would double-count if it were read as a line. */
const FOOTER =
  /^(sub[\s_-]*total|invoice[\s_-]*total|order[\s_-]*total|grand[\s_-]*total|total[\s_-]*due|amount[\s_-]*due|balance|sales[\s_-]*tax|tax|remit|please[\s_-]*pay)\b/i

/**
 * Read an invoice out of CSV or pasted text.
 *
 * Freight, handling and fuel surcharges are deliberately NOT skipped. A
 * surprise handling fee is one of the things this feature exists to catch, so
 * it stays a line and comes out flagged as something nobody ordered. Only the
 * totals block at the bottom is dropped, because folding it into the lines
 * would bill the practice for its own invoice twice.
 */
export function parseInvoiceText(text) {
  const { headers, rows } = parseCsv(text)
  const mapping = guessInvoiceMapping(headers)

  const kept = []
  const skippedRows = []

  rows.forEach((row, index) => {
    const cell = (field) => (mapping[field] ? String(row[mapping[field]] ?? '').trim() : '')
    const description = cell('description')
    const identity = Boolean(cell('gtin') || cell('mfrSku') || cell('vendorSku'))
    const price = parseMoney(mapping.price ? row[mapping.price] : null)
    const lineTotal = parseMoney(mapping.lineTotal ? row[mapping.lineTotal] : null)

    if (!description && !identity && price == null && lineTotal == null) {
      skippedRows.push({ index, reason: 'Nothing on the row', row })
      return
    }
    if (!identity && FOOTER.test(description)) {
      skippedRows.push({ index, reason: 'Invoice totals, not a line', row })
      return
    }
    kept.push(row)
  })

  return { headers, rows: kept, mapping, skippedRows }
}

/** The invoice number and date, taken from the first row that carries them. */
export function invoiceHeaderFrom(rows, mapping) {
  const value = (field) => {
    if (!mapping?.[field]) return null
    for (const row of rows ?? []) {
      const v = String(row[mapping[field]] ?? '').trim()
      if (v) return v
    }
    return null
  }

  // Vendors print dates every way there is. Only an unambiguous one is worth
  // pre-filling; anything else the human types, rather than Dentin quietly
  // choosing between the 6th of July and the 7th of June.
  const raw = value('invoiceDate')
  let invoiceDate = null
  if (raw) {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
    const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw)
    if (iso) invoiceDate = `${iso[1]}-${iso[2]}-${iso[3]}`
    else if (us) {
      invoiceDate = `${us[3]}-${String(us[1]).padStart(2, '0')}-${String(us[2]).padStart(2, '0')}`
    }
  }

  return { invoiceNumber: value('invoiceNumber'), invoiceDate }
}

/**
 * Tie each billed row to a catalog product.
 *
 * Barcode first, then the manufacturer's part number, then the vendor's own
 * item number where a contract file has taught Dentin what those mean, then a
 * normalized description. A row that matches nothing is kept anyway:
 * invoice_lines stores the description and the numbers as printed, so an
 * unmatched line can still be read by a human and matched later.
 */
export async function matchInvoiceRows(rows, mapping, { supplierId = null, orderId = null } = {}) {
  const catalog = await catalogForMatching()
  const contract = supplierId ? await contractPricesFor(supplierId) : []
  const order = orderId ? await orderLinesFor(orderId) : null

  const byGtin = new Map(catalog.filter((p) => p.gtin).map((p) => [String(p.gtin), p]))
  const bySku = new Map(catalog.filter((p) => p.mfrSku).map((p) => [p.mfrSku.toUpperCase(), p]))
  const byName = new Map(catalog.map((p) => [normalize(p.name), p]))
  const byId = new Map(catalog.map((p) => [p.id, p]))
  // The vendor's own item numbers, learned from their contract file. Only ever
  // meaningful per vendor — next door the same number means something else.
  const byVendorSku = new Map(
    contract
      .filter((c) => c.vendorSku && byId.has(c.productId))
      .map((c) => [String(c.vendorSku).toUpperCase(), byId.get(c.productId)]),
  )
  const onOrder = new Set((order?.lines ?? []).map((l) => l.productId))

  return (rows ?? []).map((row, index) => {
    const raw = (field) => (mapping?.[field] ? String(row[mapping[field]] ?? '').trim() : '')
    const gtin = raw('gtin').replace(/\D/g, '')
    const mfrSku = raw('mfrSku')
    const vendorSku = raw('vendorSku')
    const description = raw('description')

    let product = null
    let matchedBy = null
    if (gtin && byGtin.has(gtin)) {
      product = byGtin.get(gtin)
      matchedBy = 'gtin'
    } else if (mfrSku && bySku.has(mfrSku.toUpperCase())) {
      product = bySku.get(mfrSku.toUpperCase())
      matchedBy = 'mpn'
    } else if (vendorSku && byVendorSku.has(vendorSku.toUpperCase())) {
      product = byVendorSku.get(vendorSku.toUpperCase())
      matchedBy = 'vendor-sku'
    } else if (description && byName.has(normalize(description))) {
      product = byName.get(normalize(description))
      matchedBy = 'name'
    }

    const quantity = (mapping?.quantity ? parseMoney(row[mapping.quantity]) : null) ?? 1
    // Pack size decides whether a price is per box or per glove, and getting
    // it wrong is a 200x error. The invoice's own column wins; the catalog's
    // pack size is the fallback, because the vendor is selling what we
    // catalogued.
    const packSize = parseInteger(
      mapping?.packSize ? row[mapping.packSize] : null,
      product?.packSize ?? 1,
    )
    const price = parseMoney(mapping?.price ? row[mapping.price] : null)
    const lineTotal = parseMoney(mapping?.lineTotal ? row[mapping.lineTotal] : null)
    // Plenty of invoices print only the extended amount. Backing the unit
    // price out of it beats dropping the line.
    const billed = price ?? (lineTotal != null && quantity ? cents(lineTotal / quantity) : null)

    return {
      index,
      productId: product?.id ?? null,
      productName: product?.name ?? null,
      brand: product?.brand ?? null,
      unit: product?.unit ?? null,
      description: description || product?.name || '—',
      gtin: gtin || null,
      mfrSku: mfrSku || null,
      vendorSku: vendorSku || null,
      quantity,
      packSize,
      price: billed,
      lineTotal: lineTotal ?? (billed != null ? cents(billed * quantity) : null),
      product,
      matchedBy,
      onOrder: product ? onOrder.has(product.id) : false,
      usable: billed != null,
      issue:
        billed == null
          ? 'No price found in the mapped columns'
          : !product
            ? 'No catalog product matched — it will be saved as printed'
            : null,
    }
  })
}

// --- the reconciliation itself ------------------------------------------------
/**
 * Reconcile an invoice against everything the practice already knows, and hand
 * back the preview. Nothing is saved: a human looks first.
 */
export async function reconcileInvoice({
  supplierId,
  orderId = null,
  invoiceNumber = null,
  invoiceDate = null,
  matchedRows = [],
  totals = {},
  source = 'paste',
  note = null,
} = {}) {
  // Demo and live differ only in where these three come from. Everything below
  // is one code path in both worlds, so the demo can never show a conclusion
  // the live engine would not reach.
  const [order, contractPrices, priorPrices] = await Promise.all([
    orderLinesFor(orderId),
    contractPricesFor(supplierId),
    priorPricesFor(supplierId, invoiceDate),
  ])

  const lines = reconcileLines({
    lines: (matchedRows ?? [])
      .filter((r) => r.usable !== false)
      .map((r) => ({
        productId: r.productId ?? null,
        productName: r.productName ?? null,
        brand: r.brand ?? null,
        unit: r.unit ?? null,
        description: r.description,
        gtin: r.gtin ?? null,
        mfrSku: r.mfrSku ?? null,
        vendorSku: r.vendorSku ?? null,
        matchedBy: r.matchedBy ?? null,
        quantity: r.quantity,
        packSize: r.packSize,
        price: r.price,
        lineTotal: r.lineTotal ?? null,
      })),
    orderLines: order?.lines ?? [],
    contractPrices,
    priorPrices,
    supplierName: supplierNameFor(supplierId),
    orderReference: order?.reference ?? null,
  })

  const summary = summariseInvoice(lines)
  const subtotal = cents(totals.subtotal ?? lines.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0))
  const shipping = cents(totals.shipping ?? 0)
  const tax = cents(totals.tax ?? 0)

  return {
    supplierId,
    supplierName: supplierNameFor(supplierId),
    orderId: order?.orderId ?? null,
    orderReference: order?.reference ?? null,
    invoiceNumber,
    invoiceDate,
    source,
    note,
    subtotal,
    shipping,
    tax,
    total: cents(totals.total ?? subtotal + shipping + tax),
    lines,
    matchedLines: lines.filter((l) => l.productId).length,
    unmatchedLines: lines.filter((l) => !l.productId).length,
    ...summary,
  }
}

/**
 * Commit a reviewed invoice.
 *
 * One logical unit: an invoice row with no lines under it is worse than no
 * invoice at all — it would sit on the list claiming an overcharge nobody can
 * open — so a failed line insert takes the header down with it.
 */
export async function saveInvoice(preview) {
  if (!preview) throw new Error('Nothing to save')
  const summary = summariseInvoice(preview.lines ?? [])

  if (isDemo) {
    const id = `invc-${Date.now().toString(36)}`
    store().unshift({
      id,
      supplierId: preview.supplierId,
      supplierName: preview.supplierName ?? supplierNameFor(preview.supplierId),
      orderId: preview.orderId ?? null,
      orderReference: preview.orderReference ?? null,
      invoiceNumber: preview.invoiceNumber ?? null,
      invoiceDate: preview.invoiceDate ?? today(),
      subtotal: preview.subtotal ?? 0,
      shipping: preview.shipping ?? 0,
      tax: preview.tax ?? 0,
      total: preview.total ?? 0,
      source: preview.source ?? 'paste',
      status: summary.status,
      flaggedLines: summary.flaggedLines,
      overcharge: summary.overcharge,
      note: preview.note ?? null,
      createdAt: new Date().toISOString(),
      lines: (preview.lines ?? []).map((l, i) => ({ ...l, id: `${id}-${i}` })),
    })
    emit()
    return id
  }

  const practiceId = await myPracticeId()
  const invoice = must(
    await supabase
      .from('invoices')
      .insert({
        practice_id: practiceId,
        supplier_id: preview.supplierId ?? null,
        order_id: preview.orderId ?? null,
        invoice_number: preview.invoiceNumber ?? null,
        invoice_date: preview.invoiceDate ?? null,
        subtotal: preview.subtotal ?? null,
        shipping: preview.shipping ?? null,
        tax: preview.tax ?? null,
        total: preview.total ?? null,
        source: preview.source ?? 'paste',
        status: summary.status,
        flagged_lines: summary.flaggedLines,
        overcharge: summary.overcharge,
        note: preview.note ?? null,
      })
      .select('id')
      .single(),
    'Save the invoice',
  )

  try {
    // variance and variance_pct are generated columns — Postgres computes them
    // from price, expected_price and quantity, and rejects a write to either.
    must(
      await supabase.from('invoice_lines').insert(
        (preview.lines ?? []).map((l) => ({
          invoice_id: invoice.id,
          practice_id: practiceId,
          product_id: l.productId ?? null,
          description: l.description ?? null,
          gtin: l.gtin ?? null,
          mfr_sku: l.mfrSku ?? null,
          vendor_sku: l.vendorSku ?? null,
          quantity: l.quantity ?? 1,
          pack_size: l.packSize ?? 1,
          unit_price: l.unitPrice ?? null,
          price: l.price ?? null,
          line_total: l.lineTotal ?? null,
          expected_price: l.expectedPrice ?? null,
          expected_source: l.expectedSource ?? null,
          flag: l.flag ?? 'ok',
          note: l.message ?? null,
        })),
      ),
      'Save the invoice lines',
    )
  } catch (e) {
    await supabase.from('invoices').delete().eq('id', invoice.id)
    throw e
  }

  await recordInvoiceValue(invoice.id, preview, summary)

  emit()
  return invoice.id
}

/**
 * Feed the value ledger from a filed invoice.
 *
 * The distinction is the whole point of that screen. Money billed above what
 * was agreed is *found* — spotting a $40 overcharge is not the same as having
 * $40 back, and disputing it is an intention, not a payment. Only a credit
 * that actually turns up on a later invoice is *captured*.
 *
 * Never fatal: a practice must be able to file an invoice even if the ledger
 * write fails, so this reports nothing upward.
 */
async function recordInvoiceValue(invoiceId, preview, summary) {
  try {
    if (summary.overcharge > 0) {
      await recordFoundSavings([
        {
          kind: 'found',
          source: 'invoice',
          amount: summary.overcharge,
          ref: `invoice:${invoiceId}`,
          supplierId: preview.supplierId ?? null,
          orderId: preview.orderId ?? null,
          detail: `${summary.flaggedLines} ${
            summary.flaggedLines === 1 ? 'line' : 'lines'
          } billed above your price${
            preview.invoiceNumber ? ` on ${preview.invoiceNumber}` : ''
          }`,
        },
      ])
    }

    // A credit line is the vendor giving money back — the only signal here
    // that anything actually moved.
    for (const line of preview.lines ?? []) {
      if (!line.isCredit) continue
      const amount = Math.abs(Number(line.lineTotal ?? (line.price ?? 0) * (line.quantity ?? 0)))
      if (!(amount > 0)) continue
      await recordRecoveredOvercharge({
        invoiceId,
        // Lines are saved in one batch and their ids are not read back, so the
        // natural key is the invoice plus the line's position on it. Stable
        // across a re-import of the same file, which is what idempotency needs.
        lineId: `${invoiceId}:${line.index ?? line.description ?? 'line'}`,
        amount,
        supplierId: preview.supplierId ?? null,
        productId: line.productId ?? null,
        detail: `Credit on ${preview.invoiceNumber ?? 'an invoice'}${
          line.description ? ` · ${line.description}` : ''
        }`,
      })
    }
  } catch {
    // Deliberately swallowed — see above.
  }
}

// --- reads --------------------------------------------------------------------
export async function listInvoices() {
  if (isDemo) {
    return store()
      .map(({ lines, ...header }) => ({ ...header, lineCount: lines.length }))
      .sort((a, b) => String(b.invoiceDate ?? '').localeCompare(String(a.invoiceDate ?? '')))
  }

  const data = must(
    await supabase
      .from('invoices')
      .select('*, suppliers(name), orders(reference)')
      .order('invoice_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    'List invoices',
  )

  return (data ?? []).map((i) => ({
    id: i.id,
    supplierId: i.supplier_id,
    supplierName: i.suppliers?.name ?? null,
    orderId: i.order_id,
    orderReference: i.orders?.reference ?? null,
    invoiceNumber: i.invoice_number,
    invoiceDate: i.invoice_date,
    subtotal: i.subtotal == null ? null : Number(i.subtotal),
    shipping: i.shipping == null ? null : Number(i.shipping),
    tax: i.tax == null ? null : Number(i.tax),
    total: i.total == null ? null : Number(i.total),
    source: i.source,
    status: i.status,
    flaggedLines: Number(i.flagged_lines ?? 0),
    overcharge: Number(i.overcharge ?? 0),
    note: i.note,
    createdAt: i.created_at,
    lineCount: null,
  }))
}

export async function getInvoice(id) {
  if (isDemo) return store().find((i) => i.id === id) ?? null

  const data = must(
    await supabase
      .from('invoices')
      .select('*, suppliers(name), orders(reference), invoice_lines(*, products(name, brand, unit))')
      .eq('id', id)
      .maybeSingle(),
    'Read the invoice',
  )
  if (!data) return null

  const orderReference = data.orders?.reference ?? null

  return {
    id: data.id,
    supplierId: data.supplier_id,
    supplierName: data.suppliers?.name ?? null,
    orderId: data.order_id,
    orderReference,
    invoiceNumber: data.invoice_number,
    invoiceDate: data.invoice_date,
    subtotal: data.subtotal == null ? null : Number(data.subtotal),
    shipping: data.shipping == null ? null : Number(data.shipping),
    tax: data.tax == null ? null : Number(data.tax),
    total: data.total == null ? null : Number(data.total),
    source: data.source,
    status: data.status,
    flaggedLines: Number(data.flagged_lines ?? 0),
    overcharge: Number(data.overcharge ?? 0),
    note: data.note,
    createdAt: data.created_at,
    lines: (data.invoice_lines ?? []).map((l) => ({
      id: l.id,
      productId: l.product_id,
      productName: l.products?.name ?? null,
      brand: l.products?.brand ?? null,
      unit: l.products?.unit ?? null,
      description: l.description,
      gtin: l.gtin,
      mfrSku: l.mfr_sku,
      vendorSku: l.vendor_sku,
      quantity: Number(l.quantity),
      packSize: Number(l.pack_size),
      unitPrice: l.unit_price == null ? null : Number(l.unit_price),
      price: l.price == null ? null : Number(l.price),
      lineTotal: l.line_total == null ? null : Number(l.line_total),
      expectedPrice: l.expected_price == null ? null : Number(l.expected_price),
      expectedSource: l.expected_source,
      expectedLabel: sourceLabel(l.expected_source, orderReference),
      // Generated by the database from price, expected_price and quantity.
      variance: l.variance == null ? null : Number(l.variance),
      variancePct: l.variance_pct == null ? null : Number(l.variance_pct),
      flag: l.flag,
      message: l.note,
    })),
  }
}

/** A human's verdict: accepted anyway, or sent back to the rep. */
export async function setInvoiceStatus(id, status, note = null) {
  if (!INVOICE_STATUSES.includes(status)) throw new Error(`Unknown invoice status: ${status}`)

  if (isDemo) {
    const invoice = store().find((i) => i.id === id)
    if (!invoice) throw new Error('Invoice not found')
    invoice.status = status
    if (note != null) invoice.note = note
    emit()
    return { ok: true }
  }

  const patch = note == null ? { status } : { status, note }
  must(await supabase.from('invoices').update(patch).eq('id', id), 'Update the invoice')
  emit()
  return { ok: true }
}

export async function deleteInvoice(id) {
  if (isDemo) {
    const at = store().findIndex((i) => i.id === id)
    if (at >= 0) store().splice(at, 1)
    emit()
    return { ok: true }
  }

  // invoice_lines cascade on the foreign key, so the lines go with it.
  must(await supabase.from('invoices').delete().eq('id', id), 'Delete the invoice')
  emit()
  return { ok: true }
}

/**
 * Items whose billed price has climbed, worst first.
 *
 * "Worst" is what the rise costs over a year at the practice's own burn rate,
 * because a 10% rise on gloves is a thousand dollars and a 10% rise on spore
 * tests is sixty. Items whose usage Dentin does not know follow behind, ranked
 * by the size of the rise — the only honest ordering left for them. Their
 * yearly impact stays null rather than being guessed at: an invented usage
 * figure turns a real finding into a number a rep can dismiss.
 */
export async function getPriceCreep() {
  const rows = isDemo ? demoPriceCreep() : await livePriceCreep()
  const burn = await dailyBurnByProduct()

  return rows
    .map((r) => {
      const increase = cents(r.latestPrice - r.earliestPrice)
      const perDay = burn.get(r.productId) ?? 0
      return {
        ...r,
        increase,
        increasePct: r.earliestPrice ? (increase / r.earliestPrice) * 100 : null,
        annualImpact: perDay > 0 ? cents(increase * perDay * 365) : null,
        dailyBurn: perDay > 0 ? perDay : null,
      }
    })
    .filter((r) => r.increase > 0.01)
    .sort((a, b) => {
      if (a.annualImpact != null && b.annualImpact != null) return b.annualImpact - a.annualImpact
      if (a.annualImpact != null) return -1
      if (b.annualImpact != null) return 1
      return (b.increasePct ?? 0) - (a.increasePct ?? 0)
    })
}

/** The demo's own read of the same grouping v_price_creep performs. */
function demoPriceCreep() {
  const groups = new Map()

  for (const invoice of store()) {
    for (const line of invoice.lines) {
      if (!line.productId || line.price == null) continue
      const key = `${line.productId}:${invoice.supplierId}`
      const group = groups.get(key) ?? {
        productId: line.productId,
        productName: line.productName ?? productById(line.productId)?.name ?? line.description,
        supplierId: invoice.supplierId,
        supplierName: invoice.supplierName,
        prices: [],
      }
      group.prices.push({ date: invoice.invoiceDate, price: line.price })
      groups.set(key, group)
    }
  }

  return [...groups.values()]
    .filter((g) => g.prices.length > 1) // the view's `having count(*) > 1`
    .map((g) => {
      const sorted = [...g.prices].sort((a, b) => String(a.date).localeCompare(String(b.date)))
      const amounts = sorted.map((p) => p.price)
      return {
        productId: g.productId,
        productName: g.productName,
        supplierId: g.supplierId,
        supplierName: g.supplierName,
        invoices: sorted.length,
        firstSeen: sorted[0].date,
        lastSeen: sorted[sorted.length - 1].date,
        lowestPrice: Math.min(...amounts),
        highestPrice: Math.max(...amounts),
        earliestPrice: amounts[0],
        latestPrice: amounts[amounts.length - 1],
      }
    })
}

async function livePriceCreep() {
  const data = must(await supabase.from('v_price_creep').select('*'), 'Read price creep')
  return (data ?? []).map((r) => ({
    productId: r.product_id,
    productName: r.product_name,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    invoices: Number(r.invoices ?? 0),
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    lowestPrice: Number(r.lowest_price),
    highestPrice: Number(r.highest_price),
    earliestPrice: Number(r.earliest_price),
    latestPrice: Number(r.latest_price),
  }))
}

/** Packs consumed per day per product, summed across locations. */
async function dailyBurnByProduct() {
  const burn = new Map()

  if (isDemo) {
    for (const row of buildInventory()) {
      if (!row?.dailyBurn) continue
      burn.set(row.productId, (burn.get(row.productId) ?? 0) + row.dailyBurn)
    }
    return burn
  }

  const data = must(
    await supabase.from('v_inventory_status').select('product_id, daily_burn'),
    'Read usage',
  )
  for (const row of data ?? []) {
    const rate = Number(row.daily_burn ?? 0)
    if (rate > 0) burn.set(row.product_id, (burn.get(row.product_id) ?? 0) + rate)
  }
  return burn
}

/**
 * "Is this invoice for PO-1043?"
 *
 * Orders from the same vendor, close enough in time to be what this invoice
 * bills. Best guess first: the nearest order placed at or before the invoice
 * date, because a vendor bills after it ships.
 */
export async function suggestOrderForInvoice({ supplierId, invoiceDate } = {}) {
  if (!supplierId) return []
  // Midday, so a date-only invoice date cannot land a day out through the
  // timezone offset when it is subtracted from a timestamp.
  const on = invoiceDate ? new Date(`${String(invoiceDate).slice(0, 10)}T12:00:00`) : new Date()

  const orders = isDemo
    ? ORDERS.filter(
        (o) =>
          o.supplierId === supplierId && o.placedAt && !['draft', 'cancelled'].includes(o.status),
      ).map((o) => ({
        orderId: o.id,
        reference: o.reference,
        placedAt: o.placedAt,
        total: o.total,
        status: o.status,
      }))
    : (
        must(
          await supabase
            .from('orders')
            .select('id, reference, placed_at, total, status')
            .eq('supplier_id', supplierId)
            .not('placed_at', 'is', null)
            .neq('status', 'draft')
            .neq('status', 'cancelled')
            .order('placed_at', { ascending: false })
            .limit(20),
          'Find matching orders',
        ) ?? []
      ).map((o) => ({
        orderId: o.id,
        reference: o.reference,
        placedAt: o.placed_at,
        total: o.total == null ? null : Number(o.total),
        status: o.status,
      }))

  return orders
    .map((o) => ({ ...o, daysApart: Math.round((on - new Date(o.placedAt)) / 86400000) }))
    // Sixty days back covers slow terms; a week forward covers an invoice
    // dated before somebody got round to marking the PO as placed.
    .filter((o) => o.daysApart >= -7 && o.daysApart <= 60)
    .sort((a, b) => Math.abs(a.daysApart) - Math.abs(b.daysApart))
    .map((o, i) => ({ ...o, best: i === 0 }))
}
