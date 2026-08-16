// Run with: node --test src/lib/spoilage.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeBulkTier, analyzeBulkTiers } from './spoilage.js'

test('fast burner: the case saves money with zero spoilage', () => {
  // 0.5 packs/day, 18-month shelf life, nothing on hand → 8 packs = 16 days
  const r = analyzeBulkTier({
    units: 8,
    unitPrice: 22,
    baseUnitPrice: 26,
    dailyBurn: 0.5,
    shelfLifeDays: 540,
    onHand: 0,
  })
  assert.equal(r.verdict, 'saves')
  assert.equal(r.spoiledUnits, 0)
  assert.equal(r.effectiveUnitPrice, 22)
  assert.ok(Math.abs(r.stickerSavings - 32) < 0.001)
  assert.ok(Math.abs(r.netVsBase - 32) < 0.001)
})

test('slow burner: most of the bulk expires and the deal loses money', () => {
  // 0.01 packs/day (~1 pack per 100 days), 12-month shelf life:
  // usable ≈ 3.65 packs of a 16-pack case → ~77% spoils
  const r = analyzeBulkTier({
    units: 16,
    unitPrice: 40,
    baseUnitPrice: 48,
    dailyBurn: 0.01,
    shelfLifeDays: 365,
    onHand: 0,
  })
  assert.equal(r.verdict, 'loses')
  assert.ok(r.spoilPct > 70 && r.spoilPct < 85, `spoilPct ${r.spoilPct}`)
  // effective cost per used pack far exceeds the sticker
  assert.ok(r.effectiveUnitPrice > 150, `effective ${r.effectiveUnitPrice}`)
  assert.ok(r.netVsBase < 0)
  assert.ok(Math.abs(r.lossDollars - r.spoiledUnits * 40) < 0.001)
})

test('middle case: some spoilage but the discount still wins', () => {
  // usable = 10 of 12 → 2 spoil; discount deep enough to stay ahead:
  // net = 10×30 − 12×20 = 60 > 0
  const r = analyzeBulkTier({
    units: 12,
    unitPrice: 20,
    baseUnitPrice: 30,
    dailyBurn: 0.05,
    shelfLifeDays: 200,
    onHand: 0,
  })
  assert.equal(r.verdict, 'risky')
  assert.ok(Math.abs(r.spoiledUnits - 2) < 0.001)
  assert.ok(r.netVsBase > 0)
})

test('stock on hand delays the new case and increases spoilage', () => {
  const fresh = analyzeBulkTier({
    units: 10, unitPrice: 10, baseUnitPrice: 12,
    dailyBurn: 0.05, shelfLifeDays: 220, onHand: 0,
  })
  const queued = analyzeBulkTier({
    units: 10, unitPrice: 10, baseUnitPrice: 12,
    dailyBurn: 0.05, shelfLifeDays: 220, onHand: 4,
  })
  assert.ok(queued.spoiledUnits > fresh.spoiledUnits)
  // 4 on hand → 80-day delay → usable window 140d → 7 usable → 3 spoil
  assert.ok(Math.abs(queued.spoiledUnits - 3) < 0.001)
})

test('no expiry: bulk is judged on price alone', () => {
  const r = analyzeBulkTier({
    units: 50, unitPrice: 3, baseUnitPrice: 4,
    dailyBurn: 0.02, shelfLifeDays: null, onHand: 0,
  })
  assert.equal(r.verdict, 'saves')
  assert.equal(r.spoilPct, 0)
  assert.equal(r.safeUnits, Infinity)
})

test('no burn history: honest "unknown", never a guess', () => {
  const r = analyzeBulkTier({
    units: 8, unitPrice: 22, baseUnitPrice: 26,
    dailyBurn: 0, shelfLifeDays: 540, onHand: 0,
  })
  assert.equal(r.verdict, 'unknown')
  assert.equal(r.indeterminate, true)
})

test('tiny fractional spoilage reads as zero, not a scare', () => {
  // usable 9.95 of 10 → 0.05 spoil → noise
  const r = analyzeBulkTier({
    units: 10, unitPrice: 10, baseUnitPrice: 11,
    dailyBurn: 0.0995, shelfLifeDays: 100, onHand: 0,
  })
  assert.equal(r.spoiledUnits, 0)
  assert.equal(r.verdict, 'saves')
})

test('sub-2% spoilage on a big purchase is also noise', () => {
  // 100 packs, usable 98.5 → 1.5% raw spoil → suppressed
  const r = analyzeBulkTier({
    units: 100, unitPrice: 5, baseUnitPrice: 6,
    dailyBurn: 0.985, shelfLifeDays: 100, onHand: 0,
  })
  assert.equal(r.spoiledUnits, 0)
  assert.equal(r.verdict, 'saves')
})

test('analyzeBulkTiers recommends the cheapest effective price that does not lose', () => {
  const tiers = analyzeBulkTiers(
    [
      { label: 'Single', units: 1, unitPrice: 30 },
      { label: 'Case of 6', units: 6, unitPrice: 26 },
      { label: 'Bulk 24', units: 24, unitPrice: 21 },
    ],
    { baseUnitPrice: 30, dailyBurn: 0.04, shelfLifeDays: 240, onHand: 1 },
  )
  // 24-pack: usable ≈ (240 − 25) × 0.04 ≈ 8.6 → massive spoil → loses
  assert.equal(tiers[2].verdict, 'loses')
  // 6-pack fits easily → saves, and should be the recommendation
  assert.equal(tiers[1].verdict, 'saves')
  assert.equal(tiers[1].recommended, true)
  assert.equal(tiers[2].recommended, false)
})
