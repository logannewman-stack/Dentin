/**
 * Anonymized cross-practice price benchmarks.
 *
 * A practice reading its own contract knows what it pays. It does not know
 * whether that is good. Pooled across practices, the same contract data
 * answers the question a renewal actually turns on: what does everyone else
 * pay for this?
 *
 * The privacy rules are enforced in the database (migration 0015) and this
 * module does not get to relax them:
 *
 *   * Only quartiles are ever read — never a min, a max, an individual price,
 *     or any practice identity. Those columns do not exist in the views and
 *     nothing here asks for them.
 *   * A row is published only once at least MIN_BENCHMARK_COHORT distinct
 *     practices price the item. Below that the view returns nothing, so an
 *     item simply has no benchmark rather than a thin one.
 *   * Sharing is reciprocal. The views exclude an opted-out practice from
 *     every aggregate; they cannot tell who is *reading* them, so the other
 *     half — showing that practice no benchmark in return — is enforced here,
 *     before any market read is issued.
 */
import { cents, emit, isDemo, must, myPracticeId, registerInvalidator, supabase } from '../repoCore'
import { buildInventory, offersFor, productById } from '../demoData'
import { money, unitMoney } from '../format'

/**
 * The k-anonymity floor, mirrored from `having count(*) >= 5` in the views.
 * Exported so the UI can state the rule instead of hard-coding the number in
 * copy that would drift the day the migration changes.
 */
export const MIN_BENCHMARK_COHORT = 5

// --- demo store -------------------------------------------------------------
let demoSharing = true
let demoPool = null

/**
 * Deterministic 0..1 from a key, so the demo pool is identical on every load —
 * a visitor who reloads must not watch the market move under them.
 */
function noise(key) {
  let h = 2166136261
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (Math.abs(h) % 1000) / 1000
}

/** Unit prices live in fractions of a cent; the views publish them at 4dp. */
function unitCents(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000
}

/**
 * One benchmark row, built the same way in both worlds so the shape cannot
 * drift between the demo and a live practice.
 *
 * `annualImpact` is deliberately grounded in measured consumption rather than
 * a plausible guess: the price gap is per unit inside the pack, and burn is
 * counted in packs, so the pack size is what converts one into the other.
 * With no burn history there is no honest annual figure, and the row carries
 * null rather than a number the practice would have to discover was invented.
 */
function buildRow({
  productId,
  productName,
  brand,
  unit,
  supplierId,
  supplierName,
  yourUnitPrice,
  packSize,
  dailyBurn,
  practices,
  p25UnitPrice,
  medianUnitPrice,
  p75UnitPrice,
}) {
  const your = Number(yourUnitPrice)
  const median = Number(medianUnitPrice)
  const p25 = Number(p25UnitPrice)
  const p75 = Number(p75UnitPrice)
  const pack = Number(packSize) > 0 ? Number(packSize) : 1
  const burn = Number(dailyBurn) > 0 ? Number(dailyBurn) : 0

  const annualPacks = burn > 0 ? burn * 365 : null
  const annualUnits = annualPacks == null ? null : annualPacks * pack

  return {
    productId,
    productName,
    brand: brand ?? null,
    unit: unit ?? null,
    packSize: pack,
    supplierId,
    supplierName,
    yourUnitPrice: your,
    yourPackPrice: cents(your * pack),
    p25UnitPrice: p25,
    medianUnitPrice: median,
    p75UnitPrice: p75,
    practices: Number(practices),
    deltaPct: median > 0 ? ((your - median) / median) * 100 : null,
    // The quartiles decide standing, not a percentage threshold — they are
    // what the pool actually published.
    standing: your > p75 ? 'above' : your < p25 ? 'below' : 'typical',
    dailyBurn: burn,
    annualPacks: annualPacks == null ? null : Math.round(annualPacks),
    annualUnits: annualUnits == null ? null : Math.round(annualUnits),
    annualImpact: annualUnits == null ? null : cents((your - median) * annualUnits),
  }
}

/**
 * Worst first: the biggest annual overpay leads, because that is the item
 * worth a phone call. Rows with no usage history cannot be ranked in money at
 * all, so they follow, ordered by how far off the median they sit.
 */
function worstFirst(a, b) {
  const aNull = a.annualImpact == null
  const bNull = b.annualImpact == null
  if (aNull !== bNull) return aNull ? 1 : -1
  if (!aNull) return b.annualImpact - a.annualImpact
  return (b.deltaPct ?? 0) - (a.deltaPct ?? 0)
}

/** The header numbers, derived from the rows so they can never disagree. */
function summarize(rows, contractedItems) {
  const overMedian = rows.filter((r) => r.annualImpact != null && r.annualImpact > 0)
  return {
    rows,
    contractedItems,
    comparableItems: rows.length,
    overMedianCount: rows.filter((r) => r.deltaPct != null && r.deltaPct > 0).length,
    aboveCount: rows.filter((r) => r.standing === 'above').length,
    belowCount: rows.filter((r) => r.standing === 'below').length,
    missingBurnCount: rows.filter((r) => r.annualImpact == null).length,
    annualImpact: cents(overMedian.reduce((sum, r) => sum + r.annualImpact, 0)),
  }
}

/**
 * The demo practice's pooled position.
 *
 * Built off the same tracked inventory the rest of the demo shows, so the
 * annual figures here agree with the burn rates on the inventory screen. Some
 * items land above the market and some below — a screen where every line is
 * bad news reads as a sales pitch, not a benchmark.
 */
function demoBenchmarks() {
  if (demoPool) return demoPool

  const inventory = buildInventory()

  // Burn is summed across locations: one contract line covers the whole
  // practice, so the annual figure has to count every operatory using it.
  const burn = new Map()
  for (const row of inventory) {
    burn.set(row.productId, (burn.get(row.productId) ?? 0) + row.dailyBurn)
  }

  const seen = new Set()
  const rows = []
  let contractedItems = 0

  for (const item of inventory) {
    if (seen.has(item.productId)) continue
    seen.add(item.productId)

    const product = productById(item.productId)
    const contract = offersFor(item.productId).find((o) => o.inStock)
    if (!product || !contract) continue
    contractedItems += 1

    // Not everything a practice buys clears the cohort floor. Leaving a share
    // of items uncomparable is what makes the "N of M" line on the screen mean
    // something.
    if (noise(`${item.productId}:pool`) < 0.18) continue

    const median = unitCents(contract.unitPrice / (1 + (-0.16 + noise(`${item.productId}:gap`) * 0.46)))
    const p25 = unitCents(median * (1 - (0.05 + noise(`${item.productId}:p25`) * 0.07)))
    const p75 = unitCents(median * (1 + (0.06 + noise(`${item.productId}:p75`) * 0.09)))

    rows.push(
      buildRow({
        productId: item.productId,
        productName: item.productName,
        brand: item.brand,
        unit: item.unit,
        supplierId: contract.supplierId,
        supplierName: contract.supplierName,
        yourUnitPrice: unitCents(contract.unitPrice),
        packSize: product.packSize,
        dailyBurn: burn.get(item.productId) ?? 0,
        practices: 14 + Math.round(noise(`${item.productId}:cohort`) * 46),
        p25UnitPrice: p25,
        medianUnitPrice: median,
        p75UnitPrice: p75,
      }),
    )
  }

  demoPool = { rows: rows.sort(worstFirst), contractedItems }
  return demoPool
}

// --- sharing ----------------------------------------------------------------
/**
 * The flag gates every read below, and the price-check screen asks for it once
 * per product viewed. It changes only when this practice changes it, and any
 * local write — including `setBenchmarkSharing`'s own `emit()` — clears it.
 */
let sharingCache = null
registerInvalidator(() => {
  sharingCache = null
})

/** Whether this practice contributes to — and therefore reads — the pool. */
export async function getBenchmarkSharing() {
  if (isDemo) return demoSharing
  if (sharingCache != null) return sharingCache

  const row = must(
    await supabase.from('practices').select('share_benchmarks').limit(1).maybeSingle(),
    'read benchmark sharing',
  )
  // Column default is true; a practice row that has not been read yet must not
  // silently read as opted out.
  sharingCache = row?.share_benchmarks !== false
  return sharingCache
}

/**
 * Turn pooling on or off. Takes effect on the next read in both directions:
 * the views drop this practice's prices from every aggregate immediately, and
 * the reciprocity check below stops serving it a benchmark.
 */
export async function setBenchmarkSharing(on) {
  const sharing = Boolean(on)

  if (isDemo) {
    demoSharing = sharing
    emit()
    return { ok: true, sharing }
  }

  must(
    await supabase
      .from('practices')
      .update({ share_benchmarks: sharing })
      .eq('id', await myPracticeId()),
    'save benchmark sharing',
  )
  emit()
  return { ok: true, sharing }
}

// --- coverage ---------------------------------------------------------------
/**
 * How far along the pool is.
 *
 * Read even when this practice has sharing off: the counts are aggregate, they
 * are not a benchmark, and they are what makes the opt-in decision an informed
 * one rather than a blind toggle.
 */
export async function getMarketCoverage() {
  const sharing = await getBenchmarkSharing()

  if (isDemo) {
    const { rows } = demoBenchmarks()
    return {
      contributingPractices: 214,
      comparableProducts: 486,
      pricedProducts: 1180,
      sharing,
      unlocked: sharing && rows.length > 0,
    }
  }

  const row = (must(await supabase.rpc('market_coverage'), 'read market coverage') ?? [])[0] ?? {}
  const comparableProducts = Number(row.comparable_products ?? 0)

  return {
    contributingPractices: Number(row.contributing_practices ?? 0),
    comparableProducts,
    pricedProducts: Number(row.priced_products ?? 0),
    sharing,
    unlocked: sharing && comparableProducts > 0,
  }
}

// --- live reads -------------------------------------------------------------
const today = () => new Date().toISOString().slice(0, 10)

/**
 * This practice's contracted prices as they stand today, one row per product
 * per vendor — the same slice migration 0015 pools from, so "yours" and the
 * distribution it is measured against are built from the same rule.
 */
async function currentContracts(productId = null) {
  const day = today()
  let q = supabase
    .from('contract_prices')
    .select(
      'product_id, supplier_id, unit_price, pack_size, effective_from, products(name, brand, unit), suppliers(name)',
    )
    .not('product_id', 'is', null)
    .gt('unit_price', 0)
    .lte('effective_from', day)
    .or(`effective_to.is.null,effective_to.gte.${day}`)
    .limit(4000)
  // The price-check screen wants one item; pulling the whole sheet to throw
  // all but one row away is a round trip per product view.
  if (productId) q = q.eq('product_id', productId)

  const rows = must(await q, 'read your contracted prices')

  // Latest sheet wins per product + vendor, matching the view's
  // `distinct on (…) order by effective_from desc`.
  const byPair = new Map()
  for (const r of rows ?? []) {
    const key = `${r.product_id}:${r.supplier_id}`
    const held = byPair.get(key)
    if (!held || String(r.effective_from) > String(held.effective_from)) byPair.set(key, r)
  }

  return [...byPair.values()].map((r) => ({
    productId: r.product_id,
    supplierId: r.supplier_id,
    supplierName: r.suppliers?.name ?? 'Your vendor',
    productName: r.products?.name ?? 'Unnamed item',
    brand: r.products?.brand ?? null,
    unit: r.products?.unit ?? null,
    unitPrice: Number(r.unit_price),
    packSize: Number(r.pack_size ?? 1),
  }))
}

/**
 * The cheapest contract the practice holds for each product.
 *
 * The all-vendor view pools one price per practice — their best — so a
 * practice with five vendor contracts cannot outvote a practice with one.
 * Comparing anything else against that distribution would be comparing two
 * different measurements.
 */
function bestPerProduct(contracts) {
  const best = new Map()
  for (const c of contracts) {
    const held = best.get(c.productId)
    if (!held || c.unitPrice < held.unitPrice) best.set(c.productId, c)
  }
  return best
}

/** Burn per product, summed over every location that stocks it. */
async function burnByProduct(productId = null) {
  let q = supabase.from('v_inventory_status').select('product_id, daily_burn')
  if (productId) q = q.eq('product_id', productId)

  const rows = must(await q, 'read consumption history')
  const burn = new Map()
  for (const r of rows ?? []) {
    if (!r.product_id) continue
    burn.set(r.product_id, (burn.get(r.product_id) ?? 0) + Number(r.daily_burn ?? 0))
  }
  return burn
}

/** `.in()` rides in the URL, so long id lists go over in batches. */
async function marketRowsFor(productIds) {
  const found = new Map()
  for (let i = 0; i < productIds.length; i += 120) {
    const chunk = productIds.slice(i, i + 120)
    const rows = must(
      await supabase
        .from('v_market_benchmarks')
        .select('product_id, practices, p25_unit_price, median_unit_price, p75_unit_price')
        .in('product_id', chunk),
      'read market benchmarks',
    )
    for (const r of rows ?? []) found.set(r.product_id, r)
  }
  return found
}

// --- reads ------------------------------------------------------------------
/**
 * Every contracted item this practice holds that the market can price, worst
 * first, with the pool's coverage attached so the screen can be honest about
 * an empty result instead of just showing nothing.
 */
export async function getPriceBenchmarks() {
  const coverage = await getMarketCoverage()

  // Reciprocity: a practice that contributes nothing is shown nothing. This is
  // the app's half of the rule — the views cannot see who is asking.
  if (!coverage.sharing) return { ...coverage, ...summarize([], 0) }

  if (isDemo) {
    const { rows, contractedItems } = demoBenchmarks()
    return { ...coverage, ...summarize(rows, contractedItems) }
  }

  const contracts = await currentContracts()
  const best = bestPerProduct(contracts)
  if (!best.size) return { ...coverage, ...summarize([], 0) }

  const [market, burn] = await Promise.all([marketRowsFor([...best.keys()]), burnByProduct()])

  const rows = []
  for (const [productId, mine] of best) {
    const m = market.get(productId)
    if (!m) continue
    rows.push(
      buildRow({
        productId,
        productName: mine.productName,
        brand: mine.brand,
        unit: mine.unit,
        supplierId: mine.supplierId,
        supplierName: mine.supplierName,
        yourUnitPrice: mine.unitPrice,
        packSize: mine.packSize,
        dailyBurn: burn.get(productId) ?? 0,
        practices: m.practices,
        p25UnitPrice: m.p25_unit_price,
        medianUnitPrice: m.median_unit_price,
        p75UnitPrice: m.p75_unit_price,
      }),
    )
  }

  return { ...coverage, ...summarize(rows.sort(worstFirst), best.size) }
}

/**
 * One item's benchmark plus the vendor-by-vendor split — the actionable one.
 * "You pay this at Schein, the median Schein account pays that" is a sentence
 * a rep has to answer.
 *
 * Returns null when the item is not comparable, so a caller can render nothing
 * rather than a placeholder promising a number that does not exist.
 */
export async function getBenchmarkForProduct(productId) {
  if (!productId) return null

  const sharing = await getBenchmarkSharing()
  if (!sharing) return null

  if (isDemo) {
    const row = demoBenchmarks().rows.find((r) => r.productId === productId)
    if (!row) return null

    const byVendor = offersFor(productId)
      .filter((o) => o.inStock)
      .map((o) => {
        // Never under the all-vendor median: that one pools each practice's
        // best price, so it is the floor every single-vendor median sits on.
        const median = unitCents(
          row.medianUnitPrice * (1 + noise(`${productId}:${o.supplierId}`) * 0.16),
        )
        return {
          supplierId: o.supplierId,
          supplierName: o.supplierName,
          practices: 7 + Math.round(noise(`${productId}:${o.supplierId}:n`) * 28),
          p25UnitPrice: unitCents(median * 0.93),
          medianUnitPrice: median,
          p75UnitPrice: unitCents(median * 1.08),
          yourUnitPrice: o.supplierId === row.supplierId ? row.yourUnitPrice : null,
          isYours: o.supplierId === row.supplierId,
        }
      })

    return { ...row, byVendor: sortVendors(byVendor), sharing, unlocked: true }
  }

  // Nothing contracted for this item means nothing to compare, and the market
  // reads below are not worth issuing.
  const contracts = await currentContracts(productId)
  if (!contracts.length) return null

  const [marketRows, vendorRows, burnMap] = await Promise.all([
    marketRowsFor([productId]),
    supabase
      .from('v_market_benchmarks_by_vendor')
      .select('supplier_id, practices, p25_unit_price, median_unit_price, p75_unit_price')
      .eq('product_id', productId)
      .then((r) => must(r, 'read market benchmarks by vendor') ?? []),
    burnByProduct(productId),
  ])

  const market = marketRows.get(productId)
  if (!market) return null

  const mine = bestPerProduct(contracts).get(productId)
  const burn = burnMap.get(productId) ?? 0
  const row = buildRow({
    productId,
    productName: mine.productName,
    brand: mine.brand,
    unit: mine.unit,
    supplierId: mine.supplierId,
    supplierName: mine.supplierName,
    yourUnitPrice: mine.unitPrice,
    packSize: mine.packSize,
    dailyBurn: burn,
    practices: market.practices,
    p25UnitPrice: market.p25_unit_price,
    medianUnitPrice: market.median_unit_price,
    p75UnitPrice: market.p75_unit_price,
  })

  const names = new Map()
  if (vendorRows.length) {
    const suppliers =
      must(
        await supabase
          .from('suppliers')
          .select('id, name')
          .in(
            'id',
            vendorRows.map((v) => v.supplier_id),
          ),
        'read vendor names',
      ) ?? []
    for (const s of suppliers) names.set(s.id, s.name)
  }

  const yoursByVendor = new Map(contracts.map((c) => [c.supplierId, c.unitPrice]))
  const byVendor = vendorRows.map((v) => ({
    supplierId: v.supplier_id,
    supplierName: names.get(v.supplier_id) ?? 'Vendor',
    practices: Number(v.practices),
    p25UnitPrice: Number(v.p25_unit_price),
    medianUnitPrice: Number(v.median_unit_price),
    p75UnitPrice: Number(v.p75_unit_price),
    yourUnitPrice: yoursByVendor.get(v.supplier_id) ?? null,
    isYours: yoursByVendor.has(v.supplier_id),
  }))

  return { ...row, byVendor: sortVendors(byVendor), sharing, unlocked: true }
}

/** Your own vendors first — that is the row the conversation starts from. */
function sortVendors(rows) {
  return [...rows].sort((a, b) => {
    if (a.isYours !== b.isYours) return a.isYours ? -1 : 1
    return a.medianUnitPrice - b.medianUnitPrice
  })
}

// --- negotiation ------------------------------------------------------------
/**
 * The sentences a practice can read to a rep, verbatim.
 *
 * Numbers and an ask, nothing else — no adjectives, no leverage language, and
 * never a reference to another practice. Every claim is a published statistic
 * about a group, which is the only thing the pool contains and the only thing
 * a rep can be asked to answer.
 *
 * Accepts either a row from `getPriceBenchmarks()` or the detail object from
 * `getBenchmarkForProduct()`; the vendor-specific line appears only when the
 * by-vendor split is present and covers the vendor you actually buy from.
 */
export function getNegotiationScript(row) {
  if (!row) return { lines: [], text: '' }

  const name = [row.productName, row.brand ? `(${row.brand})` : null].filter(Boolean).join(' ')
  const label = [name, row.unit].filter(Boolean).join(' · ')
  // "a unit" is wrong for something sold singly; "each" is wrong for a glove
  // out of a box of 200. One word, picked once, used throughout.
  const per = row.packSize > 1 ? 'a unit' : 'each'
  const lines = [`${label}. Our account: ${row.supplierName}.`]

  lines.push(
    row.packSize > 1
      ? `We pay ${unitMoney(row.yourUnitPrice)} a unit on our current contract — ${money(row.yourPackPrice)} a pack of ${row.packSize}.`
      : `We pay ${unitMoney(row.yourUnitPrice)} each on our current contract.`,
  )

  const over = row.deltaPct != null && row.deltaPct > 0
  const gapPct = row.deltaPct == null ? null : Math.abs(Math.round(row.deltaPct))

  lines.push(
    `The median contracted price across ${row.practices} practices is ${unitMoney(row.medianUnitPrice)} ${per}.` +
      (gapPct != null && gapPct > 0
        ? ` That puts us ${gapPct}% ${over ? 'above' : 'below'} it.`
        : ' That is where we sit.'),
  )

  const ownVendor = (row.byVendor ?? []).find((v) => v.isYours)
  if (ownVendor) {
    lines.push(
      `Across ${ownVendor.practices} accounts with ${ownVendor.supplierName}, the median is ${unitMoney(ownVendor.medianUnitPrice)} ${per}.`,
    )
  }

  // No burn history means no honest volume claim, so the sentence is dropped
  // rather than filled with an estimate a rep could pull apart.
  if (row.annualImpact != null && row.annualPacks > 0 && over) {
    lines.push(
      `We buy about ${row.annualPacks} of these a year. At that volume the difference is ${money(Math.abs(row.annualImpact))} a year.`,
    )
  }

  lines.push(
    over
      ? `Ask: match ${unitMoney(row.medianUnitPrice)} ${per} on our next order. If that is not possible, tell us what volume commitment does.`
      : `Ask: hold ${unitMoney(row.yourUnitPrice)} ${per} through the next contract term.`,
  )

  return { lines, text: lines.join('\n\n') }
}
