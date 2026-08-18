/**
 * Invoice reconciliation and price-creep arithmetic.
 *
 * A quoted price and a billed price are not the same number, and the gap is
 * where a practice quietly loses thousands a year. Distributors raise
 * contracted items between orders, substitute a pack size, add a handling
 * fee, or bill a quantity nobody received. None of it is visible unless
 * someone lines the invoice up against the purchase order, which takes an
 * afternoon nobody has.
 *
 * This module does the lining up. Pure functions — every input arrives as an
 * argument and nothing is fetched — so the arithmetic that decides whether a
 * practice was overcharged can be tested on its own, without a database and
 * without a screen.
 *
 * Shapes:
 *   line          = { productId, description, quantity, packSize, price }
 *                   `price` is what the invoice bills per unit of sale: per
 *                   box when the vendor sells boxes, per each when it sells
 *                   eaches. `packSize` says which of those it is.
 *   orderLine     = { productId, quantity, unitPrice, packSize }
 *   contractPrice = { productId, price, packSize }
 *   priorPrice    = { productId, price, packSize, invoiceDate, invoiceNumber }
 */

/**
 * How far apart two prices can be and still be "the same price".
 *
 * Two harmless things move a billed price by a fraction of a cent. The vendor
 * rounds the pack price to cents; and a per-each price, printed to four
 * decimals, has to be multiplied back up by the pack size before it can be
 * compared — which turns a half-hundredth of a cent of printing rounding into
 * 2.5 cents on a box of 500. A flat one-cent band is no cover for that, so the
 * band is proportional as well: a difference has to clear BOTH a cent and half
 * a percent before Dentin calls it a price change.
 *
 * Half a percent is chosen deliberately. It is wider than any rounding
 * artifact a pack conversion can produce, and four times narrower than the 2%
 * creep that is worth a phone call to the rep — so a real rise cannot hide
 * inside it, and a rounding artifact can never start an argument.
 */
const TOLERANCE_ABS = 0.01
const TOLERANCE_PCT = 0.005

/** Quantities are numeric(10,2); this is well under the smallest real step. */
const QTY_EPSILON = 0.001

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const round4 = (n) => Math.round((Number(n) + Number.EPSILON) * 10000) / 10000

const num = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Pack size is a divisor. Zero or missing means "sold as eaches", not "÷ 0". */
const packOf = (value) => {
  const n = Math.trunc(Number(value))
  return Number.isFinite(n) && n > 0 ? n : 1
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "Jun 12" — the same shape `format.shortDate` renders, without pulling
 * date-fns into a module whose whole point is that it depends on nothing.
 * Parsed by hand because `new Date('2026-06-12')` is UTC midnight, which
 * renders as the 11th anywhere west of Greenwich.
 */
function shortDate(value) {
  if (!value) return null
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return `${MONTHS[m - 1]} ${d}`
}

/** Money for a sentence a dentist reads: "$1,204.50", "-$31.20". */
function usd(value) {
  const n = num(value)
  const [whole, fraction] = Math.abs(n).toFixed(2).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${n < 0 ? '-' : ''}$${grouped}.${fraction}`
}

const qtyText = (value) => {
  const n = num(value)
  return Number.isInteger(n) ? String(n) : String(round2(n))
}

const pctText = (value) => `${Math.abs(num(value)).toFixed(1)}%`

// --- column guessing ---------------------------------------------------------
/**
 * Which column holds which field, for an invoice rather than a price file.
 *
 * An invoice carries things a price sheet does not — an invoice number, a
 * date, a billed quantity, an extended amount — and names them differently at
 * every distributor ("Qty Shipped", "Ext Price", "UOM Qty"). Ranked patterns
 * beat exact-name lookup, and the user can override every guess anyway.
 *
 * Field order matters: each header is claimed once, so the fields whose names
 * overlap are resolved in the order that gets them right. Pack size runs
 * before quantity so "UOM Qty" is read as units-per-pack and not as the amount
 * billed; the extended amount runs before the unit price so "Extended Price"
 * cannot be mistaken for the price of one.
 */
const INVOICE_PATTERNS = {
  invoiceNumber: [
    /invoice[\s_-]*(no|number|num|#|id)/i,
    /^inv[\s_-]*(no|number|num|#)/i,
    /^invoice$/i,
  ],
  invoiceDate: [
    /invoice[\s_-]*date/i,
    /^inv[\s_-]*date/i,
    /(bill|billing|ship|shipped|order)[\s_-]*date/i,
    /^date$/i,
  ],
  gtin: [/^gtin$/i, /^upc$/i, /^ean$/i, /barcode/i, /\bgtin\b/i],
  mfrSku: [
    /^mfr?[\s_-]*(part|sku|item|no|number|#)/i,
    /manufacturer.*(part|sku|number)/i,
    /^mpn$/i,
    /^mfg/i,
  ],
  vendorSku: [
    /^(item|product|catalog|cat)[\s_-]*(no|number|num|#|code|id)/i,
    /vendor.*(item|sku|number)/i,
    /^sku$/i,
    /^item$/i,
  ],
  description: [/^desc/i, /item[\s_-]*desc/i, /product[\s_-]*(name|desc)/i, /^name$/i, /descri/i],
  packSize: [
    /pack[\s_-]*(size|qty|quantity)/i,
    /^uom[\s_-]*qty/i,
    /(units?|each|ea)[\s_-]*per/i,
    /^qty[\s_-]*per/i,
    /^pack$/i,
  ],
  quantity: [
    /(qty|quantity)[\s_-]*(shipped|shpd|ship|billed|invoiced|ordered)/i,
    /^quantity$/i,
    /^qty$/i,
    /^ship(ped)?$/i,
    /quantity/i,
    /^qty/i,
  ],
  lineTotal: [
    /^ext(ended)?[\s_-]*(price|amount|amt|total|cost)?$/i,
    /extended/i,
    /line[\s_-]*(total|amount|amt)/i,
    /^net[\s_-]*amount$/i,
    /^amount$/i,
    /^amt$/i,
    /^total$/i,
  ],
  price: [
    /unit[\s_-]*(price|cost)/i,
    /price[\s_-]*(each|ea|per)/i,
    /(your|net|contract|invoiced?|billed)[\s_-]*price/i,
    /^price$/i,
    /^(each|ea)$/i,
    /^cost$/i,
    /price/i,
  ],
}

export function guessInvoiceMapping(headers = []) {
  const mapping = {}
  const taken = new Set()

  for (const [field, patterns] of Object.entries(INVOICE_PATTERNS)) {
    for (const pattern of patterns) {
      const hit = headers.find((h) => !taken.has(h) && pattern.test(h))
      if (hit) {
        mapping[field] = hit
        taken.add(hit)
        break
      }
    }
  }

  return mapping
}

// --- reconciliation ----------------------------------------------------------
/**
 * Where the expectation for one line comes from, in order of authority.
 *
 * The purchase order wins: it is the number the practice agreed to for this
 * shipment. Then the contract, which is the number the practice agreed to for
 * the year. Then whatever the same item cost last time, which is not an
 * agreement but is evidence. Nothing left means the item is new, and a new
 * item has no wrong price — only an unfamiliar one.
 *
 * Everything is normalised to a per-each price before it is judged. Vendors
 * bill per pack and per each interchangeably, and half the "40% price rise" a
 * naive comparison finds is really a box of 200 being invoiced as 200 units —
 * a 20x or 1/20th error stated with total confidence. The expectation is then
 * converted back into the unit of sale THIS invoice used, so `expectedPrice`
 * sits next to `price` in the same currency of meaning.
 *
 * Both sides are rounded to cents at that point, because `price` and
 * `expected_price` are both numeric(10,2) in the database: judging the same
 * numbers Postgres will store is what keeps the preview a human approves and
 * the row that gets saved from ever disagreeing. The rounding is symmetric, so
 * it cannot bias the comparison, and the one-cent floor in the tolerance below
 * is wide enough to absorb it.
 */
function expectationFor(line, ctx) {
  const packSize = packOf(line.packSize)
  const productId = line.productId ?? null

  const order = productId ? ctx.orderByProduct.get(productId) : null
  if (order) {
    // A PO with no pack size recorded is assumed to have been ordered in the
    // same unit of sale it was billed in — the only assumption here that
    // cannot invent a 20x error out of nothing.
    const orderPack = order.packSize || packSize
    const perEach = num(order.unitPrice) / orderPack
    return {
      source: 'order',
      label: ctx.orderReference ?? 'the purchase order',
      perEach,
      price: round2(perEach * packSize),
      order,
    }
  }

  const contract = productId ? ctx.contractByProduct.get(productId) : null
  if (contract) {
    const perEach = num(contract.price) / packOf(contract.packSize)
    return {
      source: 'contract',
      label: 'your contract price',
      perEach,
      price: round2(perEach * packSize),
    }
  }

  const prior = productId ? ctx.priorByProduct.get(productId) : null
  if (prior) {
    const perEach = num(prior.price) / packOf(prior.packSize)
    const when = shortDate(prior.invoiceDate)
    return {
      source: 'last_invoice',
      label: when ? `last invoice, ${when}` : 'the last invoice',
      perEach,
      price: round2(perEach * packSize),
      when,
    }
  }

  return null
}

/** "PO-1043" / "your contract price" / "the last invoice, Jun 12". */
function sourceName(expectation) {
  if (!expectation) return 'the purchase order'
  if (expectation.source === 'order') return expectation.label
  if (expectation.source === 'contract') return 'your contract price'
  return `the ${expectation.label}`
}

/** The sentence a practice manager can read out to a rep, verbatim. */
function describe({
  line,
  expectation,
  flag,
  variancePct,
  orderedText,
  billedText,
  isCredit,
  priceDiffers,
}) {
  const billed = usd(line.price)
  const subject = line.supplierName ? `${line.supplierName} billed ${billed}` : `Billed ${billed}`

  if (isCredit) {
    const value = usd(Math.abs(num(line.price) * num(line.quantity)))
    return `Credit of ${value}. Money coming back is never counted as an overcharge.`
  }

  if (flag === 'qty_mismatch') {
    // Same tolerance the flag uses, so a quantity note can never claim a price
    // change the rest of the screen is calling a match.
    const priceClause =
      expectation && priceDiffers
        ? `, and at ${billed} against ${usd(expectation.price)} — ${pctText(variancePct)} ${
            variancePct > 0 ? 'higher' : 'lower'
          }`
        : ', at the price agreed'
    return `Billed ${billedText} where ${sourceName(expectation)} ordered ${orderedText}${priceClause}.`
  }

  if (flag === 'not_on_order') {
    // Only a contract or a prior invoice can price a line the PO never had.
    const context = !expectation
      ? ''
      : expectation.source === 'contract'
        ? ` Your contract price is ${usd(expectation.price)}.`
        : ` It cost ${usd(expectation.price)} on the ${expectation.label}.`
    const po = line.orderReference ?? 'the purchase order'
    return `${subject} for an item that is not on ${po}.${context}`
  }

  if (flag === 'new_item') {
    return `${subject}. Nothing to compare it against — this is the first time it has been invoiced.`
  }

  if (flag === 'price_up' || flag === 'price_down') {
    const against =
      expectation.source === 'order'
        ? `on an item ordered at ${usd(expectation.price)} on ${expectation.label}`
        : expectation.source === 'contract'
          ? `on an item your contract prices at ${usd(expectation.price)}`
          : `on an item that cost ${usd(expectation.price)} on the ${expectation.label}`
    return `${subject} ${against} — ${pctText(variancePct)} ${
      flag === 'price_up' ? 'higher' : 'lower'
    }.`
  }

  return expectation ? `Billed ${billed}, matching ${sourceName(expectation)}.` : `Billed ${billed}.`
}

/**
 * Annotate every billed line with what it should have cost, where that
 * expectation came from, and how far off it landed.
 *
 * `orderLines` being non-empty is what makes this invoice claim to bill a
 * purchase order — a line that matches nothing on it is reported as such,
 * because an item nobody ordered is a bigger question than its price.
 */
export function reconcileLines({
  lines = [],
  orderLines = [],
  contractPrices = [],
  priorPrices = [],
  supplierName = null,
  orderReference = null,
} = {}) {
  const orderByProduct = new Map()
  for (const o of orderLines) {
    if (!o?.productId) continue
    const packSize = packOf(o.packSize)
    const quantity = num(o.quantity)
    const seen = orderByProduct.get(o.productId)
    // One product can appear twice on a PO (two locations, two lines). The
    // quantities add; the price is the one the practice agreed to, which is
    // the same on both lines in every case worth handling.
    if (seen) {
      seen.quantity += quantity
      seen.units += quantity * packSize
    } else {
      orderByProduct.set(o.productId, {
        quantity,
        units: quantity * packSize,
        unitPrice: num(o.unitPrice),
        packSize,
      })
    }
  }

  const contractByProduct = new Map()
  for (const c of contractPrices) {
    if (!c?.productId || c.price == null) continue
    if (!contractByProduct.has(c.productId)) contractByProduct.set(c.productId, c)
  }

  const priorByProduct = new Map()
  for (const p of priorPrices) {
    if (!p?.productId || p.price == null) continue
    const seen = priorByProduct.get(p.productId)
    // ISO dates sort correctly as strings, which keeps this free of Date
    // parsing and of the timezone slip that comes with it.
    if (!seen || String(p.invoiceDate ?? '') > String(seen.invoiceDate ?? '')) {
      priorByProduct.set(p.productId, p)
    }
  }

  // Billed units per product across the WHOLE invoice, so a PO line split
  // across two shipment lines is not read as two short deliveries.
  const billedUnits = new Map()
  for (const line of lines) {
    if (!line?.productId) continue
    const units = num(line.quantity) * packOf(line.packSize)
    billedUnits.set(line.productId, (billedUnits.get(line.productId) ?? 0) + units)
  }

  const hasOrder = orderByProduct.size > 0
  const ctx = { orderByProduct, contractByProduct, priorByProduct, orderReference }

  return lines.map((raw) => {
    const line = { ...raw, supplierName: raw.supplierName ?? supplierName, orderReference }
    const packSize = packOf(line.packSize)
    const quantity = num(line.quantity, 1)
    const price = line.price == null ? null : round2(line.price)
    // A credit reverses a charge. Comparing it to a price would report money
    // coming back as money going out, which reads exactly backwards.
    const isCredit = quantity < 0 || (price != null && price < 0)

    const expectation = price == null ? null : expectationFor(line, ctx)
    const expectedPrice = expectation ? expectation.price : null
    const variance =
      expectedPrice == null || price == null ? null : round2((price - expectedPrice) * quantity)
    const variancePct =
      expectedPrice == null || expectedPrice === 0 || price == null
        ? null
        : round4(((price - expectedPrice) / expectedPrice) * 100)

    const order = expectation?.source === 'order' ? expectation.order : null
    const orderedUnits = order ? order.units : null
    const billed = line.productId ? (billedUnits.get(line.productId) ?? 0) : quantity * packSize
    const qtyMismatch =
      order != null && !isCredit && Math.abs(billed - orderedUnits) > QTY_EPSILON

    // Same pack size on both sides is the ordinary case, and "billed 12 where
    // the PO ordered 10" is what a human wants to read. Only when the packs
    // differ does the unit count have to be spelled out.
    const samePack = order != null && order.packSize === packSize
    const billedText = samePack
      ? qtyText(billed / packSize)
      : `${qtyText(billed)} units`
    const orderedText = samePack
      ? qtyText(order ? order.quantity : 0)
      : `${qtyText(orderedUnits ?? 0)} units`

    // Rounded before it is compared: 0.51 − 0.50 is 0.010000000000000009 in
    // binary floating point, and an unrounded compare would call a penny-exact
    // match a price rise.
    const diff = expectedPrice == null || price == null ? null : round2(price - expectedPrice)
    const priceDiffers =
      diff != null && Math.abs(diff) > Math.max(TOLERANCE_ABS, Math.abs(expectedPrice) * TOLERANCE_PCT)

    let flag = 'ok'
    if (isCredit) flag = 'ok'
    else if (hasOrder && !order) flag = 'not_on_order'
    else if (qtyMismatch) flag = 'qty_mismatch'
    else if (!expectation) flag = 'new_item'
    else if (priceDiffers) flag = diff > 0 ? 'price_up' : 'price_down'

    return {
      ...line,
      quantity,
      packSize,
      price,
      unitPrice: price == null ? null : round4(price / packSize),
      lineTotal:
        line.lineTotal != null
          ? round2(line.lineTotal)
          : price == null
            ? null
            : round2(price * quantity),
      expectedPrice,
      expectedUnitPrice: expectation ? round4(expectation.perEach) : null,
      expectedSource: expectation ? expectation.source : null,
      expectedLabel: expectation ? expectation.label : null,
      orderedQuantity: order ? order.quantity : null,
      orderedUnits,
      billedUnits: billed,
      variance,
      variancePct,
      isCredit,
      flag,
      message: describe({
        line,
        expectation,
        flag,
        variancePct,
        orderedText,
        billedText,
        isCredit,
        priceDiffers,
      }),
    }
  })
}

/**
 * What the whole invoice adds up to.
 *
 * `overcharge` sums the positive variances only. Netting them against credits
 * and price drops would produce a smaller, calmer number that hides the thing
 * the practice actually needs to argue about: a rep will happily explain that
 * the invoice "nets out", and the $40 rise on gloves still gets paid every
 * month afterwards.
 */
export function summariseInvoice(lines = []) {
  const flaggedLines = lines.filter((l) => l.flag && l.flag !== 'ok').length
  const overcharge = round2(
    lines.reduce((sum, l) => sum + (num(l.variance) > 0 ? num(l.variance) : 0), 0),
  )
  return { flaggedLines, overcharge, status: flaggedLines > 0 ? 'review' : 'clean' }
}
