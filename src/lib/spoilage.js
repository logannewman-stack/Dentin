/**
 * Bulk-deal spoilage math.
 *
 * The bulk trap: the case's sticker unit price is lower, but shelf life ×
 * burn rate decides how much of the case actually gets used. This module
 * prices a tier honestly — what fraction will expire first, what the
 * effective unit cost becomes after that waste, and whether the deal still
 * beats buying small.
 *
 * Model (stated, not hidden):
 * - Burn is packs/day, ideally derived from the practice's CDT procedure
 *   history; the caller says where it came from.
 * - Stock is used first-expiring-first, so units already on hand are
 *   consumed before the new purchase — the new stock waits its turn.
 * - Delivered stock is assumed to arrive with the product's full shelf
 *   life remaining. Real lots vary; this is the optimistic bound, which
 *   makes a "this will spoil" verdict conservative rather than alarmist.
 *
 * Pure functions, no I/O, no clock — everything arrives as arguments.
 */

/**
 * @param {object} tier
 * @param {number} tier.units          packs in this purchase
 * @param {number} tier.unitPrice      price per pack at this tier
 * @param {number} tier.baseUnitPrice  price per pack buying the small quantity
 * @param {number} tier.dailyBurn      packs consumed per day (>= 0)
 * @param {number|null} tier.shelfLifeDays  null = no practical expiry
 * @param {number} [tier.onHand]       packs already on the shelf (consumed first)
 */
export function analyzeBulkTier({
  units,
  unitPrice,
  baseUnitPrice,
  dailyBurn,
  shelfLifeDays,
  onHand = 0,
}) {
  const totalCost = units * unitPrice
  const stickerSavings = (baseUnitPrice - unitPrice) * units

  // No usage history — the honest answer is "cannot predict", not a guess.
  if (!dailyBurn || dailyBurn <= 0) {
    return {
      indeterminate: true,
      units,
      unitPrice,
      totalCost,
      stickerSavings,
      daysOfSupply: null,
      spoiledUnits: 0,
      spoilPct: 0,
      lossDollars: 0,
      effectiveUnitPrice: unitPrice,
      netVsBase: null,
      safeUnits: null,
      verdict: 'unknown',
    }
  }

  const daysOfSupply = units / dailyBurn

  // No practical expiry (burs, instruments): the price break is the whole story.
  if (shelfLifeDays == null) {
    return {
      indeterminate: false,
      units,
      unitPrice,
      totalCost,
      stickerSavings,
      daysOfSupply,
      spoiledUnits: 0,
      spoilPct: 0,
      lossDollars: 0,
      effectiveUnitPrice: unitPrice,
      netVsBase: stickerSavings,
      safeUnits: Infinity,
      verdict: stickerSavings > 0.005 ? 'saves' : 'even',
    }
  }

  // Existing stock is used first, so the new purchase starts aging on the
  // shelf while the old stock is drawn down.
  const queueDelayDays = onHand / dailyBurn
  const usableWindowDays = Math.max(0, shelfLifeDays - queueDelayDays)
  const usableUnits = usableWindowDays * dailyBurn

  const usedUnits = Math.min(units, usableUnits)
  const spoiledUnitsRaw = units - usedUnits
  // Below a tenth of a pack — or 2% of the purchase — is measurement noise,
  // not a warning worth interrupting anyone for.
  const noiseFloor = Math.max(0.1, units * 0.02)
  const spoiledUnits = spoiledUnitsRaw < noiseFloor ? 0 : spoiledUnitsRaw

  const spoilPct = units > 0 ? (spoiledUnits / units) * 100 : 0
  const lossDollars = spoiledUnits * unitPrice
  const effectiveUnitPrice = usedUnits > 0.0001 ? totalCost / usedUnits : Infinity

  // What the used portion would have cost at the small-pack price, minus what
  // the whole tier cost — positive means the deal still comes out ahead.
  const netVsBase = baseUnitPrice * usedUnits - totalCost

  const verdict =
    spoiledUnits === 0
      ? stickerSavings > 0.005
        ? 'saves'
        : 'even'
      : netVsBase > 0.005
        ? 'risky'
        : 'loses'

  return {
    indeterminate: false,
    units,
    unitPrice,
    totalCost,
    stickerSavings,
    daysOfSupply,
    spoiledUnits,
    spoilPct,
    lossDollars,
    effectiveUnitPrice,
    netVsBase,
    safeUnits: Math.floor(usableUnits),
    verdict,
  }
}

/**
 * Analyze a set of tiers and pick the recommendation: the cheapest effective
 * unit price among tiers that don't lose money, preferring zero spoilage on
 * ties. Returns tiers in the given order with `recommended` flagged.
 */
export function analyzeBulkTiers(tiers, context) {
  const analyzed = tiers.map((t) => ({
    ...t,
    ...analyzeBulkTier({ ...context, units: t.units, unitPrice: t.unitPrice }),
  }))

  let best = null
  for (const t of analyzed) {
    if (t.indeterminate || t.verdict === 'loses') continue
    if (
      !best ||
      t.effectiveUnitPrice < best.effectiveUnitPrice - 0.0001 ||
      (Math.abs(t.effectiveUnitPrice - best.effectiveUnitPrice) <= 0.0001 &&
        t.spoiledUnits < best.spoiledUnits)
    ) {
      best = t
    }
  }

  return analyzed.map((t) => ({ ...t, recommended: best ? t === best : false }))
}
