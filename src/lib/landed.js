/**
 * Landed-cost engine.
 *
 * "Free shipping" is not savings — savings exist only when one LANDED TOTAL
 * (goods + shipping + surcharges + tax − rebates) is lower than another's.
 * This module prices a whole basket that way for every vendor that can fill
 * it, then interrogates the result: is the free-shipping vendor genuinely
 * cheapest, would padding to a threshold cost more than paying freight,
 * would splitting the basket across two vendors beat every single-vendor
 * plan, and does the winner's lead time put any low item at risk?
 *
 * Pure functions — every input arrives as an argument, nothing is fetched.
 *
 * Shapes:
 *   line   = { id, productId, name, quantity, urgentDays?,   // days of cover left
 *              offers: { [vendorId]: { price, unitPrice, packSize, inStock } } }
 *   vendor = { id, name, shipFee, freeShipOver, surcharge, orderMinimum, leadDays }
 *   tax    = { rate, taxShipping, exempt }
 */

const round2 = (n) => Number(n.toFixed(2))

function shippingFor(vendor, subtotal) {
  const free = vendor.freeShipOver > 0 && subtotal >= vendor.freeShipOver
  return free ? 0 : (vendor.shipFee ?? 0) + (vendor.surcharge ?? 0)
}

function taxFor(tax, subtotal, shipping) {
  if (!tax || tax.exempt) return 0
  return tax.rate * (subtotal + (tax.taxShipping ? shipping : 0))
}

/** Price one vendor against the full basket. */
function priceVendor(vendor, lines, tax, rebates = {}) {
  let subtotal = 0
  let filled = 0
  const vendorLines = []

  for (const line of lines) {
    const offer = line.offers[vendor.id]
    if (!offer || !offer.inStock) continue
    filled += 1
    const cost = offer.price * line.quantity
    subtotal += cost
    vendorLines.push({ ...line, offer, cost })
  }

  const complete = filled === lines.length
  const shipping = shippingFor(vendor, subtotal)
  const rebate = rebates[vendor.id] ?? 0
  const taxAmount = taxFor(tax, subtotal, shipping)
  const meetsMinimum = subtotal >= (vendor.orderMinimum ?? 0)

  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    leadDays: vendor.leadDays ?? null,
    filled,
    complete,
    subtotal: round2(subtotal),
    shipping: round2(shipping),
    tax: round2(taxAmount),
    rebate: round2(rebate),
    landedTotal: round2(subtotal + shipping + taxAmount - rebate),
    freeShipOver: vendor.freeShipOver ?? 0,
    orderMinimum: vendor.orderMinimum ?? 0,
    shipsFree: shipping === 0,
    eligible: complete && meetsMinimum,
    ineligibleReason: !complete
      ? `carries ${filled} of ${lines.length} items`
      : !meetsMinimum
        ? `below ${vendor.orderMinimum} order minimum`
        : null,
    lines: vendorLines,
  }
}

/**
 * Two-vendor split search: assign each line to the cheaper of the pair,
 * price both halves with their own shipping/minimum/tax, and keep the best
 * combination found. Exhaustive over vendor pairs, greedy per line — the
 * threshold-chasing exotic assignments aren't worth their confusion.
 */
function bestSplit(lines, vendors, tax, rebates) {
  let best = null

  for (let i = 0; i < vendors.length; i += 1) {
    for (let j = i + 1; j < vendors.length; j += 1) {
      const [a, b] = [vendors[i], vendors[j]]
      const aLines = []
      const bLines = []

      let coverable = true
      for (const line of lines) {
        const oa = line.offers[a.id]?.inStock ? line.offers[a.id] : null
        const ob = line.offers[b.id]?.inStock ? line.offers[b.id] : null
        if (!oa && !ob) {
          coverable = false
          break
        }
        if (oa && (!ob || oa.price <= ob.price)) aLines.push(line)
        else bLines.push(line)
      }
      if (!coverable || !aLines.length || !bLines.length) continue

      const pa = priceVendor(a, aLines, tax, rebates)
      const pb = priceVendor(b, bLines, tax, rebates)
      // Each half must clear its own vendor's floor.
      if (!pa.eligible || !pb.eligible) continue

      const combined = round2(pa.landedTotal + pb.landedTotal)
      if (!best || combined < best.combined) {
        best = { a: pa, b: pb, combined }
      }
    }
  }

  return best
}

export function computeLandedTotals({ lines, vendors, tax, rebates = {} }) {
  const priced = vendors
    .map((v) => priceVendor(v, lines, tax, rebates))
    .sort((a, b) => a.landedTotal - b.landedTotal)

  const eligible = priced.filter((p) => p.eligible)
  const winner = eligible[0] ?? null
  const runnerUp = eligible[1] ?? null

  // The free-shipping offer on the table: the best-landed vendor whose
  // shipping is zero for this basket (threshold cleared or genuinely free).
  const freeShipVendor = eligible.find((p) => p.shipsFree) ?? null

  const trueSavings = winner && runnerUp ? round2(runnerUp.landedTotal - winner.landedTotal) : null
  const freeShipDelta =
    winner && freeShipVendor && freeShipVendor.vendorId !== winner.vendorId
      ? round2(freeShipVendor.landedTotal - winner.landedTotal)
      : null

  const flags = []

  // Free shipping absorbed into line prices: the zero-freight vendor's goods
  // cost more than the same basket at the mean of everyone else's prices.
  if (freeShipVendor) {
    let atMean = 0
    let comparable = 0
    for (const line of lines) {
      const fs = line.offers[freeShipVendor.vendorId]
      const others = Object.entries(line.offers)
        .filter(([id, o]) => id !== freeShipVendor.vendorId && o.inStock)
        .map(([, o]) => o.price)
      if (!fs?.inStock || !others.length) continue
      comparable += 1
      atMean += (others.reduce((s, p) => s + p, 0) / others.length) * line.quantity
    }
    const premium = round2(freeShipVendor.subtotal - atMean)
    if (comparable && premium > 0.005) {
      flags.push({
        kind: 'inflated-pricing',
        vendorId: freeShipVendor.vendorId,
        vendorName: freeShipVendor.vendorName,
        premium,
        message: `${freeShipVendor.vendorName} ships free but its goods run $${premium.toFixed(2)} above the market mean for this basket — the freight is in the line prices.`,
      })
    }
  }

  // Padding to a threshold: only sane when the gap is smaller than the
  // freight it erases — and even then it must beat the current winner.
  for (const p of eligible) {
    if (p.freeShipOver > 0 && p.subtotal < p.freeShipOver && p.shipping > 0) {
      const gap = round2(p.freeShipOver - p.subtotal)
      const paddedGoods = p.freeShipOver
      const paddedLanded = round2(paddedGoods + taxFor(tax, paddedGoods, 0) - (rebates[p.vendorId] ?? 0))
      flags.push({
        kind: 'padding',
        vendorId: p.vendorId,
        vendorName: p.vendorName,
        gap,
        shippingAvoided: p.shipping,
        worthIt: gap < p.shipping,
        paddedLanded,
        message:
          gap < p.shipping
            ? `${p.vendorName}: adding $${gap.toFixed(2)} of stock you'd buy anyway clears free shipping and beats paying $${p.shipping.toFixed(2)} freight.`
            : `${p.vendorName}: padding $${gap.toFixed(2)} to reach free shipping costs more than the $${p.shipping.toFixed(2)} freight it avoids — don't.`,
      })
    }
  }

  // Two-vendor split, only surfaced when it genuinely beats the best
  // single-vendor plan by more than rounding.
  const split = bestSplit(lines, vendors, tax, rebates)
  if (split && winner && split.combined < winner.landedTotal - Math.max(2, winner.landedTotal * 0.003)) {
    flags.push({
      kind: 'split',
      saving: round2(winner.landedTotal - split.combined),
      plan: split,
      message: `Splitting — ${split.a.lines.length} line${split.a.lines.length === 1 ? '' : 's'} at ${split.a.vendorName}, ${split.b.lines.length} at ${split.b.vendorName} — lands at $${split.combined.toFixed(2)}, $${(winner.landedTotal - split.combined).toFixed(2)} under the best single order.`,
    })
  }

  // Lead-time risk: the winner arrives after some line runs dry.
  if (winner) {
    const atRisk = lines.filter(
      (l) => l.urgentDays != null && winner.leadDays != null && winner.leadDays > l.urgentDays,
    )
    if (atRisk.length) {
      const fastest = eligible.reduce(
        (min, p) => (p.leadDays != null && (min == null || p.leadDays < min.leadDays) ? p : min),
        null,
      )
      flags.push({
        kind: 'lead-time',
        items: atRisk.map((l) => ({ name: l.name, urgentDays: l.urgentDays })),
        winnerLeadDays: winner.leadDays,
        fastestVendorName: fastest?.vendorName ?? null,
        fastestLeadDays: fastest?.leadDays ?? null,
        message: `${atRisk.length} item${atRisk.length === 1 ? ' runs' : 's run'} out before ${winner.vendorName}'s ${winner.leadDays}-day delivery${fastest && fastest.vendorId !== winner.vendorId ? ` — ${fastest.vendorName} arrives in ${fastest.leadDays}` : ''}.`,
      })
    }
  }

  // Step 1's normalized table, for display: per-use-unit price per vendor.
  const unitTable = lines.map((l) => ({
    id: l.id,
    name: l.name,
    quantity: l.quantity,
    perUnit: Object.fromEntries(
      Object.entries(l.offers)
        .filter(([, o]) => o.inStock)
        .map(([vendorId, o]) => [vendorId, o.unitPrice]),
    ),
  }))

  return {
    vendors: priced,
    winner,
    runnerUp,
    freeShipVendor,
    trueSavings,
    trueSavingsPct:
      trueSavings != null && runnerUp ? round2((trueSavings / runnerUp.landedTotal) * 100) : null,
    freeShipDelta,
    freeShipDeltaPct:
      freeShipDelta != null && freeShipVendor
        ? round2((freeShipDelta / freeShipVendor.landedTotal) * 100)
        : null,
    flags,
    unitTable,
  }
}
