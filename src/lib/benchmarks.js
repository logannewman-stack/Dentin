/**
 * Industry benchmarks and inventory formulas.
 *
 * The numbers here are the published consensus for dental supply management,
 * kept in one place so screens read policy rather than hard-code thresholds.
 *
 * Sources are noted per constant. Two caveats worth carrying into the UI:
 *
 *  - The savings figures attached to automated inventory in the trade press
 *    come from vendor case studies, not peer-reviewed work. Dentin does not
 *    quote them as promises anywhere.
 *  - No published survey reports how often practices *actually* order. The
 *    biweekly default below is the consensus recommendation, not observed
 *    behaviour, and is labelled that way where it appears.
 */

/**
 * Clinical supply spend as a share of collections.
 *
 * "Clinical supplies" excludes lab fees, equipment, repairs and office
 * supplies — mixing those in is the most common way a practice concludes it
 * is overspending when it is not.
 *
 * General-practice guidance clusters at 5–7% (Journal of the Michigan Dental
 * Association) with accounting benchmarks a point lower at 4–6% (Aldrich);
 * specialty bands from the same JMDA summary.
 */
export const SPEND_BENCHMARKS = {
  general: {
    label: 'General dentistry',
    low: 5,
    high: 7,
    note: 'Well-managed practices trend to the low end of the band.',
  },
  pediatric: { label: 'Pediatric', low: 4, high: 6, note: 'High volume, low material cost per case.' },
  ortho: { label: 'Orthodontics', low: 8, high: 10, note: 'Brackets and wires carry the spend.' },
  endo: { label: 'Endodontics', low: 8, high: 10, note: 'Rotary files are a consumable, not an instrument.' },
  perio: { label: 'Periodontics', low: 11, high: 13, note: 'Grafting materials dominate.' },
  prostho: { label: 'Prosthodontics', low: 11, high: 13, note: 'Impression and lab-adjacent materials.' },
  oralSurgery: {
    label: 'Oral surgery',
    low: 10,
    high: 15,
    note: 'Implant components can run hundreds per case before the first suture.',
  },
}

/**
 * Specialties where percent-of-collections hides the truth.
 *
 * High case fees mask per-case material inflation, so cost per procedure is
 * the sharper metric: percent-of-collections tells you whether to look, cost
 * per procedure tells you where.
 */
export const COST_PER_PROCEDURE_TYPES = new Set(['oralSurgery', 'perio', 'prostho'])

/** Collections is a trailing three-month window — one bulk order distorts a month. */
export const SPEND_WINDOW_MONTHS = 3

export function spendBand(practiceType) {
  return SPEND_BENCHMARKS[practiceType] ?? SPEND_BENCHMARKS.general
}

/**
 * Where a practice sits against its band.
 * `status` drives the UI: under / on-target / over.
 */
export function assessSpend({ supplySpend, collections, practiceType = 'general' }) {
  const band = spendBand(practiceType)
  if (!collections || collections <= 0) return null

  const pct = (supplySpend / collections) * 100
  const status = pct > band.high ? 'over' : pct < band.low ? 'under' : 'on'

  // What hitting the top of the band would cost, i.e. the gap worth chasing.
  const overBy = status === 'over' ? supplySpend - (band.high / 100) * collections : 0

  return {
    pct,
    band,
    status,
    overBy,
    annualisedOverBy: overBy * (12 / SPEND_WINDOW_MONTHS),
    usesCostPerProcedure: COST_PER_PROCEDURE_TYPES.has(practiceType),
  }
}

// ---------------------------------------------------------------------------
// Reorder point and par level
// ---------------------------------------------------------------------------

/**
 * Safety stock: 20% of a week's consumption. Small, because the point of a
 * reorder point is to cover lead time — safety stock only absorbs variance.
 */
export const SAFETY_STOCK_WEEKS = 0.2

/** Par floor and ceiling, in days of cover. */
export const PAR_MIN_DAYS = 30
export const PAR_MAX_DAYS = 60

/**
 * Reorder point = (daily burn x lead time) + safety stock.
 *
 * The whole purpose is that stock lasts until the delivery lands. A reorder
 * point below burn x lead time guarantees a gap no matter how promptly the
 * order is placed, which is the single most common par-level mistake.
 */
export function suggestedReorderPoint({ dailyBurn, leadDays }) {
  if (!dailyBurn || dailyBurn <= 0 || !leadDays) return null
  const coverLeadTime = dailyBurn * leadDays
  const safety = dailyBurn * 7 * SAFETY_STOCK_WEEKS
  return Math.max(1, Math.ceil(coverLeadTime + safety))
}

export function suggestedPar({ dailyBurn, days = PAR_MAX_DAYS }) {
  if (!dailyBurn || dailyBurn <= 0) return null
  return Math.max(1, Math.ceil(dailyBurn * days))
}

/**
 * Compare what is set against what the formula says, and describe the risk in
 * the terms a practice owner cares about — days short, not percentages.
 */
export function assessLevels({ dailyBurn, leadDays, reorderPoint, parLevel }) {
  const rop = suggestedReorderPoint({ dailyBurn, leadDays })
  const parMin = suggestedPar({ dailyBurn, days: PAR_MIN_DAYS })
  const parMax = suggestedPar({ dailyBurn, days: PAR_MAX_DAYS })
  if (rop == null) return null

  const shortfall = rop - reorderPoint
  const daysShort = dailyBurn > 0 ? shortfall / dailyBurn : 0

  return {
    suggestedReorderPoint: rop,
    suggestedParMin: parMin,
    suggestedParMax: parMax,
    reorderPointIsLow: shortfall > 0.5,
    daysShort: Math.max(0, Math.round(daysShort)),
    parIsHigh: parMax != null && parLevel > parMax * 1.5,
    parIsLow: parMin != null && parLevel < parMin * 0.5,
  }
}

// ---------------------------------------------------------------------------
// Purchasing policy — a per-SKU decision, never a practice-wide one
// ---------------------------------------------------------------------------

/**
 * How far ahead to buy a given item.
 *
 * Shelf-stable, high-turnover goods reward bulk when the discount clears
 * ~15%. Short-dated materials do not, regardless of discount — an expired
 * composite is a total loss plus a disposal problem. High-cost, low-frequency
 * items are bought just in time because the carrying cost dominates.
 */
export const PURCHASE_POLICIES = {
  bulk: {
    label: 'Buy in bulk',
    days: [90, 180],
    tone: 'good',
    rationale: 'Shelf-stable and high turnover — worth buying deep when the discount clears 15%.',
  },
  standard: {
    label: 'Standard cadence',
    days: [60, 90],
    tone: 'brand',
    rationale: 'Shorter shelf life caps how far ahead it is worth buying.',
  },
  jit: {
    label: 'Just in time',
    days: [14, 30],
    tone: 'warning',
    rationale: 'High cost or short dated — carrying cost and expiry outweigh any discount.',
  },
}

/** Discount at which buying deep starts to pay on a shelf-stable item. */
export const BULK_DISCOUNT_THRESHOLD = 15

/**
 * Classify an item from what Dentin already knows: shelf life, unit cost and
 * turnover. Deliberately conservative — anything expensive or short-dated
 * lands in JIT rather than bulk.
 */
export function purchasePolicyFor({ shelfLifeDays, unitCost, dailyBurn, isEquipment }) {
  if (isEquipment) return 'jit'
  if (shelfLifeDays != null && shelfLifeDays <= 365) return 'jit'
  if (unitCost != null && unitCost >= 200) return 'jit'
  if (shelfLifeDays != null && shelfLifeDays <= 730) return 'standard'
  if (dailyBurn >= 0.2 && (unitCost == null || unitCost < 60)) return 'bulk'
  return 'standard'
}

// ---------------------------------------------------------------------------
// Ordering cadence
// ---------------------------------------------------------------------------

/**
 * Twice a month is the consensus recommendation. Ordering weekly is treated
 * as a failure state in procurement KPIs, not diligence: each extra order
 * carries shipping and small-order fees that dwarf the benefit of holding a
 * few days less stock.
 */
export const CADENCES = {
  weekly: { label: 'Weekly', days: 7, advised: false },
  biweekly: { label: 'Every two weeks', days: 14, advised: true },
  monthly: { label: 'Monthly', days: 30, advised: true },
}

/** Typical small-order fee a distributor adds below its minimum. */
export const SMALL_ORDER_FEE = 20
/** Rush shipping costs meaningfully more than a scheduled order. */
export const RUSH_ORDER_PREMIUM_PCT = 30

/** Storage ceilings — bulk buying is bounded by where it physically goes. */
export const STORAGE_LIMITS = {
  centralWeeks: 6,
  operatoryWeeks: 1,
}

export function nextOrderDate(lastOrderedAt, cadence = 'biweekly') {
  const days = CADENCES[cadence]?.days ?? 14
  const base = lastOrderedAt ? new Date(lastOrderedAt) : new Date()
  return new Date(base.getTime() + days * 86400000)
}

/**
 * Pareto: the SKUs that carry negotiation leverage.
 *
 * The top fifth of items by spend is typically ~80% of the bill, and it is the
 * only part worth taking to a rep. Returns the smallest set reaching the
 * target share of spend.
 */
export function negotiationLeverage(items, targetShare = 0.8) {
  const sorted = [...items].filter((i) => i.spend > 0).sort((a, b) => b.spend - a.spend)
  const total = sorted.reduce((sum, i) => sum + i.spend, 0)
  if (!total) return { items: [], total: 0, share: 0, coversPct: 0 }

  const picked = []
  let running = 0
  for (const item of sorted) {
    picked.push(item)
    running += item.spend
    if (running / total >= targetShare) break
  }

  return {
    items: picked,
    total: running,
    share: running / total,
    coversPct: (picked.length / sorted.length) * 100,
  }
}
