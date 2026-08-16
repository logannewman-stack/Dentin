// Run with: node --test src/lib/landed.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { computeLandedTotals } from './landed.js'

const TAX = { rate: 0.08, taxShipping: true, exempt: false }

const vendor = (id, over = {}) => ({
  id,
  name: id.toUpperCase(),
  shipFee: 10,
  freeShipOver: 0,
  surcharge: 0,
  orderMinimum: 0,
  leadDays: 3,
  ...over,
})

const line = (id, quantity, offers, urgentDays) => ({
  id,
  productId: id,
  name: id,
  quantity,
  urgentDays,
  offers: Object.fromEntries(
    Object.entries(offers).map(([v, price]) => [
      v,
      { price, unitPrice: price / 100, packSize: 100, inStock: true },
    ]),
  ),
})

test('threshold crossed → shipping zero; landed ranks by all-in, not sticker', () => {
  const r = computeLandedTotals({
    lines: [line('gloves', 10, { a: 30, b: 28 })],
    vendors: [
      vendor('a', { freeShipOver: 250, shipFee: 12 }), // 300 goods → free ship
      vendor('b', { shipFee: 15 }), // 280 goods + 15 ship
    ],
    tax: TAX,
  })
  const a = r.vendors.find((v) => v.vendorId === 'a')
  const b = r.vendors.find((v) => v.vendorId === 'b')
  assert.equal(a.shipping, 0)
  assert.equal(b.shipping, 15)
  // a: 300 × 1.08 = 324 ; b: (280 + 15) × 1.08 = 318.60 → b wins DESPITE a's free shipping
  assert.equal(a.landedTotal, 324)
  assert.equal(b.landedTotal, 318.6)
  assert.equal(r.winner.vendorId, 'b')
  assert.equal(r.freeShipVendor.vendorId, 'a')
  assert.equal(r.freeShipDelta, 5.4) // positive = free shipping is NOT the best deal
})

test('free-shipping vendor with inflated goods gets flagged', () => {
  const r = computeLandedTotals({
    lines: [
      line('x', 5, { fs: 40, c: 30, d: 32 }),
      line('y', 5, { fs: 22, c: 18, d: 20 }),
    ],
    vendors: [
      vendor('fs', { shipFee: 0 }), // "free shipping!" but pricey goods
      vendor('c', { shipFee: 8 }),
      vendor('d', { shipFee: 9 }),
    ],
    tax: TAX,
  })
  assert.equal(r.winner.vendorId, 'c')
  const flag = r.flags.find((f) => f.kind === 'inflated-pricing')
  assert.ok(flag, 'expected inflated-pricing flag')
  // fs goods 310 vs mean-of-others (155 + 95) = 250 → premium 60
  assert.equal(flag.premium, 60)
})

test('inflated-pricing premium counts only comparable lines', () => {
  const r = computeLandedTotals({
    lines: [
      line('x', 5, { fs: 40, c: 30 }),
      line('y', 2, { fs: 50 }), // ONLY the free-ship vendor carries this line
    ],
    vendors: [vendor('fs', { shipFee: 0 }), vendor('c', { shipFee: 8 })],
    tax: TAX,
  })
  const flag = r.flags.find((f) => f.kind === 'inflated-pricing')
  assert.ok(flag, 'expected inflated-pricing flag')
  // Comparable line x only: fs 200 vs mean-of-others 150 → premium 50.
  // The exclusive line y ($100 of goods) has no market mean and must not
  // inflate the premium to 150.
  assert.equal(flag.premium, 50)
})

test('order minimum makes a vendor ineligible', () => {
  const r = computeLandedTotals({
    lines: [line('x', 1, { a: 40, b: 45 })],
    vendors: [vendor('a', { orderMinimum: 50 }), vendor('b')],
    tax: TAX,
  })
  const a = r.vendors.find((v) => v.vendorId === 'a')
  assert.equal(a.eligible, false)
  assert.match(a.ineligibleReason, /minimum/)
  assert.equal(r.winner.vendorId, 'b') // cheaper sticker loses to the floor
})

test('partial coverage marks the vendor, never silently drops lines', () => {
  const r = computeLandedTotals({
    lines: [line('x', 1, { a: 10, b: 12 }), line('y', 1, { b: 20 })],
    vendors: [vendor('a'), vendor('b')],
    tax: TAX,
  })
  const a = r.vendors.find((v) => v.vendorId === 'a')
  assert.equal(a.eligible, false)
  assert.match(a.ineligibleReason, /1 of 2/)
  assert.equal(r.winner.vendorId, 'b')
})

test('tax applies to shipping only when the state says so', () => {
  const basket = {
    lines: [line('x', 1, { a: 100 })],
    vendors: [vendor('a', { shipFee: 10 })],
  }
  const taxed = computeLandedTotals({ ...basket, tax: { rate: 0.1, taxShipping: true, exempt: false } })
  const untaxed = computeLandedTotals({ ...basket, tax: { rate: 0.1, taxShipping: false, exempt: false } })
  const exempt = computeLandedTotals({ ...basket, tax: { rate: 0.1, taxShipping: true, exempt: true } })
  assert.equal(taxed.vendors[0].landedTotal, 121) // (100+10) × 1.1
  assert.equal(untaxed.vendors[0].landedTotal, 120) // 100×1.1 + 10
  assert.equal(exempt.vendors[0].landedTotal, 110) // no tax at all
})

test('padding: worth it when the gap is smaller than the freight it erases', () => {
  const r = computeLandedTotals({
    lines: [line('x', 8, { a: 30 })], // 240 goods, 10 short of the 250 bar
    vendors: [vendor('a', { freeShipOver: 250, shipFee: 14 })],
    tax: TAX,
  })
  const flag = r.flags.find((f) => f.kind === 'padding')
  assert.ok(flag)
  assert.equal(flag.gap, 10)
  assert.equal(flag.worthIt, true) // $10 of useful stock beats $14 freight
})

test('padding: flagged as a trap when the gap exceeds the shipping', () => {
  const r = computeLandedTotals({
    lines: [line('x', 5, { a: 30 })], // 150 goods, 100 short of the bar
    vendors: [vendor('a', { freeShipOver: 250, shipFee: 12 })],
    tax: TAX,
  })
  const flag = r.flags.find((f) => f.kind === 'padding')
  assert.ok(flag)
  assert.equal(flag.worthIt, false) // $100 of padding to dodge $12 → no
})

test('padding: not worth it when the padded total still loses to the winner', () => {
  const r = computeLandedTotals({
    lines: [line('x', 8, { a: 30, b: 26 })],
    vendors: [
      vendor('a', { freeShipOver: 250, shipFee: 14 }), // 240 goods → $10 gap < $14 freight
      vendor('b', { shipFee: 5 }), // (208 + 5) × 1.08 = 230.04 — the winner
    ],
    tax: TAX,
  })
  assert.equal(r.winner.vendorId, 'b')
  const flag = r.flags.find((f) => f.kind === 'padding')
  assert.ok(flag)
  assert.equal(flag.gap, 10)
  assert.equal(flag.paddedLanded, 270) // padded a: 250 × 1.08
  assert.equal(flag.worthIt, false) // beats a's own freight, still $39.96 over b
})

test('split across two vendors can beat every single-vendor plan', () => {
  // a is much cheaper on x, b much cheaper on y; either alone overpays badly.
  const r = computeLandedTotals({
    lines: [
      line('x', 10, { a: 20, b: 34 }),
      line('y', 10, { a: 33, b: 21 }),
    ],
    vendors: [vendor('a', { shipFee: 8 }), vendor('b', { shipFee: 8 })],
    tax: TAX,
  })
  const flag = r.flags.find((f) => f.kind === 'split')
  assert.ok(flag, 'expected a split recommendation')
  // split goods 200+210 + 2×8 ship = 426 ×1.08 = 460.08 vs single-a (530+8)×1.08 = 581.04
  assert.equal(flag.plan.combined, 460.08)
  assert.ok(flag.saving > 100)
})

test('lead-time risk: cheapest vendor slower than an item can wait', () => {
  const r = computeLandedTotals({
    lines: [line('x', 2, { slow: 50, fast: 55 }, 2)], // 2 days of cover left
    vendors: [
      vendor('slow', { leadDays: 6 }),
      vendor('fast', { leadDays: 1, shipFee: 12 }),
    ],
    tax: TAX,
  })
  assert.equal(r.winner.vendorId, 'slow')
  const flag = r.flags.find((f) => f.kind === 'lead-time')
  assert.ok(flag)
  assert.equal(flag.fastestVendorName, 'FAST')
})

test('true savings vs runner-up is landed-to-landed', () => {
  const r = computeLandedTotals({
    lines: [line('x', 4, { a: 25, b: 26 })],
    vendors: [vendor('a', { shipFee: 5 }), vendor('b', { shipFee: 5 })],
    tax: TAX,
  })
  // a (100+5)×1.08 = 113.40 ; b (104+5)×1.08 = 117.72 → 4.32
  assert.equal(r.trueSavings, 4.32)
  assert.ok(Math.abs(r.trueSavingsPct - 3.67) < 0.01)
})
