// Run with: node --test src/lib/reconcile.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { guessInvoiceMapping, reconcileLines, summariseInvoice } from './reconcile.js'

const billed = (over = {}) => ({
  productId: 'MT-N-M',
  description: 'Micro-Touch Nitrile Exam Gloves, Medium',
  quantity: 10,
  packSize: 200,
  price: 31.2,
  ...over,
})

const ordered = (over = {}) => ({
  productId: 'MT-N-M',
  quantity: 10,
  unitPrice: 28.4,
  packSize: 200,
  ...over,
})

const one = (args) => reconcileLines(args)[0]

test('the headline case: billed above the last invoice, to the cent and the percent', () => {
  const line = one({
    lines: [billed()],
    priorPrices: [{ productId: 'MT-N-M', price: 28.4, packSize: 200, invoiceDate: '2026-07-15' }],
    supplierName: 'Henry Schein',
  })

  assert.equal(line.flag, 'price_up')
  assert.equal(line.expectedSource, 'last_invoice')
  assert.equal(line.expectedPrice, 28.4)
  assert.equal(line.variance, 28) // $2.80 over, ten boxes
  assert.equal(line.variancePct, 9.8592) // same rounding the generated column uses
  assert.equal(line.variancePct.toFixed(2), '9.86')
  assert.match(line.message, /Henry Schein billed \$31\.20/)
  assert.match(line.message, /\$28\.40 on the last invoice, Jul 15/)
  assert.match(line.message, /9\.9% higher/)
})

test('order beats contract beats last invoice', () => {
  const args = {
    lines: [billed({ price: 30 })],
    orderLines: [ordered()],
    contractPrices: [{ productId: 'MT-N-M', price: 27.5, packSize: 200 }],
    priorPrices: [{ productId: 'MT-N-M', price: 26, packSize: 200, invoiceDate: '2026-07-15' }],
  }

  assert.equal(one(args).expectedSource, 'order')
  assert.equal(one(args).expectedPrice, 28.4)

  const noOrder = one({ ...args, orderLines: [] })
  assert.equal(noOrder.expectedSource, 'contract')
  assert.equal(noOrder.expectedPrice, 27.5)

  const noContract = one({ ...args, orderLines: [], contractPrices: [] })
  assert.equal(noContract.expectedSource, 'last_invoice')
  assert.equal(noContract.expectedPrice, 26)
})

test('the most recent prior price wins, not the first one handed over', () => {
  const line = one({
    lines: [billed()],
    priorPrices: [
      { productId: 'MT-N-M', price: 24.1, packSize: 200, invoiceDate: '2026-02-02' },
      { productId: 'MT-N-M', price: 28.4, packSize: 200, invoiceDate: '2026-07-15' },
      { productId: 'MT-N-M', price: 26.0, packSize: 200, invoiceDate: '2026-05-30' },
    ],
  })
  assert.equal(line.expectedPrice, 28.4)
})

test('per-each billing against a per-pack contract is not a 200x price rise', () => {
  // The contract is $28.40 for a box of 200. The invoice bills 2,000 gloves at
  // $0.142 each — the same money, printed differently.
  const line = one({
    lines: [billed({ quantity: 2000, packSize: 1, price: 0.142 })],
    contractPrices: [{ productId: 'MT-N-M', price: 28.4, packSize: 200 }],
  })

  assert.equal(line.flag, 'ok')
  assert.equal(line.variance, 0)
  assert.equal(line.expectedUnitPrice, 0.142) // the contract, restated per each
  // Both sides land on the same cent, which is the precision the schema keeps.
  assert.equal(line.expectedPrice, 0.14)
  assert.equal(line.unitPrice, 0.14)
})

test('per-pack billing against a per-each contract is not a 1/200th price drop', () => {
  const line = one({
    lines: [billed({ quantity: 10, packSize: 200, price: 28.4 })],
    contractPrices: [{ productId: 'MT-N-M', price: 0.142, packSize: 1 }],
  })
  assert.equal(line.flag, 'ok')
  assert.equal(line.expectedPrice, 28.4)
})

test('a pack-size substitution is caught as a real rise, not hidden by the repack', () => {
  // Contract: $28.40 / 200 = $0.142 each. Billed: $16.00 for a box of 100 =
  // $0.16 each. Sticker price is lower, the practice is paying 12.7% more.
  const line = one({
    lines: [billed({ quantity: 10, packSize: 100, price: 16 })],
    contractPrices: [{ productId: 'MT-N-M', price: 28.4, packSize: 200 }],
  })
  assert.equal(line.flag, 'price_up')
  assert.equal(line.expectedPrice, 14.2)
  assert.equal(line.variance, 18)
  assert.equal(Number(line.variancePct.toFixed(1)), 12.7)
})

test('billed quantity short of the order is a quantity mismatch, price still reported', () => {
  const line = one({
    lines: [billed({ quantity: 8, price: 29.9 })],
    orderLines: [ordered({ quantity: 10 })],
    orderReference: 'PO-1043',
  })

  assert.equal(line.flag, 'qty_mismatch')
  assert.equal(line.orderedQuantity, 10)
  assert.equal(line.expectedSource, 'order')
  assert.equal(line.variance, 12) // ($29.90 − $28.40) × 8 — the price gap survives
  assert.match(line.message, /Billed 8 where PO-1043 ordered 10/)
  assert.match(line.message, /5\.3% higher/)
})

test('a quantity mismatch does not claim a price change inside the tolerance', () => {
  const line = one({
    lines: [billed({ quantity: 8, price: 28.45 })], // 5¢ over — inside the band
    orderLines: [ordered({ quantity: 10 })],
    orderReference: 'PO-1043',
  })
  assert.equal(line.flag, 'qty_mismatch')
  assert.match(line.message, /at the price agreed/)
})

test('a quantity mismatch across different pack sizes is stated in units', () => {
  // Ordered 10 boxes of 200; billed 12 boxes of 100 — fewer gloves, not more.
  const line = one({
    lines: [billed({ quantity: 12, packSize: 100, price: 14.2 })],
    orderLines: [ordered({ quantity: 10, packSize: 200 })],
    orderReference: 'PO-1043',
  })
  assert.equal(line.flag, 'qty_mismatch')
  assert.equal(line.billedUnits, 1200)
  assert.equal(line.orderedUnits, 2000)
  assert.match(line.message, /Billed 1200 units where PO-1043 ordered 2000 units/)
})

test('a PO line split across two shipment lines is not two short deliveries', () => {
  const lines = reconcileLines({
    lines: [billed({ quantity: 6 }), billed({ quantity: 4 })],
    orderLines: [ordered({ quantity: 10 })],
    orderReference: 'PO-1043',
  })
  assert.deepEqual(
    lines.map((l) => l.flag),
    ['price_up', 'price_up'],
  )
})

test('an item nobody ordered is flagged even when its price is defensible', () => {
  const line = one({
    lines: [billed({ productId: 'MTX-CW-160', description: 'CaviWipes', price: 21.75 })],
    orderLines: [ordered()],
    contractPrices: [{ productId: 'MTX-CW-160', price: 21.75, packSize: 200 }],
    orderReference: 'PO-1043',
    supplierName: 'Benco Dental',
  })

  assert.equal(line.flag, 'not_on_order')
  assert.equal(line.expectedSource, 'contract') // the price context survives the flag
  assert.equal(line.variance, 0)
  assert.match(line.message, /not on PO-1043/)
})

test('a handling fee riding along on a PO shows up as not on the order', () => {
  const line = one({
    lines: [{ description: 'Fuel & handling surcharge', quantity: 1, packSize: 1, price: 12.5 }],
    orderLines: [ordered()],
    orderReference: 'PO-1043',
  })
  assert.equal(line.flag, 'not_on_order')
  assert.equal(line.expectedPrice, null)
  assert.equal(line.variance, null)
})

test('a first-time item has no wrong price, only an unfamiliar one', () => {
  const line = one({ lines: [billed({ productId: 'DEN-AQ-HB', price: 118 })] })

  assert.equal(line.flag, 'new_item')
  assert.equal(line.expectedPrice, null)
  assert.equal(line.expectedSource, null)
  assert.equal(line.variance, null)
  assert.equal(line.variancePct, null)
  assert.match(line.message, /first time it has been invoiced/)
})

test('a credit line is never read as a price rise', () => {
  const lines = reconcileLines({
    lines: [
      billed(), // $2.80 over on ten boxes
      billed({ quantity: -2, description: 'Credit — returned short-dated stock' }),
    ],
    priorPrices: [{ productId: 'MT-N-M', price: 28.4, packSize: 200, invoiceDate: '2026-07-15' }],
  })

  const credit = lines[1]
  assert.equal(credit.isCredit, true)
  assert.equal(credit.flag, 'ok')
  assert.equal(credit.variance, -5.6)
  assert.match(credit.message, /Credit of \$62\.40/)

  // The overcharge is the $28 genuinely over-billed. Netting the credit
  // against it would report $22.40 and lose the argument.
  const summary = summariseInvoice(lines)
  assert.equal(summary.overcharge, 28)
  assert.equal(summary.flaggedLines, 1)
})

test('a negative price is a credit too', () => {
  const line = one({
    lines: [billed({ quantity: 1, price: -31.2 })],
    priorPrices: [{ productId: 'MT-N-M', price: 28.4, packSize: 200, invoiceDate: '2026-07-15' }],
  })
  assert.equal(line.isCredit, true)
  assert.equal(line.flag, 'ok')
})

test('tolerance: rounding noise stays quiet, a real rise does not', () => {
  const at = (price) =>
    one({
      lines: [billed({ price })],
      contractPrices: [{ productId: 'MT-N-M', price: 28.4, packSize: 200 }],
    }).flag

  // Band on $28.40 is half a percent — 14.2 cents.
  assert.equal(at(28.4), 'ok')
  assert.equal(at(28.54), 'ok') // 14¢ over: inside the band
  assert.equal(at(28.55), 'price_up') // 15¢ over: outside it
  assert.equal(at(28.26), 'ok') // 14¢ under
  assert.equal(at(28.25), 'price_down')
  assert.equal(at(28.97), 'price_up') // a 2% rise clears the band four times over
})

test('tolerance: on a sub-dollar unit price the cent floor governs', () => {
  const at = (price) =>
    one({
      lines: [billed({ quantity: 500, packSize: 1, price })],
      contractPrices: [{ productId: 'MT-N-M', price: 0.5, packSize: 1 }],
    }).flag

  assert.equal(at(0.51), 'ok') // exactly a cent — not "more than" a cent
  assert.equal(at(0.52), 'price_up')
  assert.equal(at(0.49), 'ok')
  assert.equal(at(0.48), 'price_down')
})

test('a price drop is reported, and never counted as an overcharge', () => {
  const lines = reconcileLines({
    lines: [billed({ price: 25 })],
    contractPrices: [{ productId: 'MT-N-M', price: 28.4, packSize: 200 }],
    supplierName: 'Darby Dental',
  })

  assert.equal(lines[0].flag, 'price_down')
  assert.equal(lines[0].variance, -34)
  assert.match(lines[0].message, /12\.0% lower/)
  assert.equal(summariseInvoice(lines).overcharge, 0)
})

test('an invoice where everything matched is clean, not empty', () => {
  const lines = reconcileLines({
    lines: [billed({ price: 28.4 }), billed({ productId: 'CTX-L3-EL', packSize: 50, price: 22.4 })],
    contractPrices: [
      { productId: 'MT-N-M', price: 28.4, packSize: 200 },
      { productId: 'CTX-L3-EL', price: 22.4, packSize: 50 },
    ],
  })

  const summary = summariseInvoice(lines)
  assert.deepEqual(summary, { flaggedLines: 0, overcharge: 0, status: 'clean' })
  assert.match(lines[0].message, /matching your contract price/)
})

test('a missing pack size is treated as eaches, never as a divide by zero', () => {
  const line = one({
    lines: [billed({ packSize: 0, price: 0.142, quantity: 2000 })],
    contractPrices: [{ productId: 'MT-N-M', price: 0.142, packSize: null }],
  })
  assert.equal(line.packSize, 1)
  assert.equal(line.flag, 'ok')
  assert.ok(Number.isFinite(line.expectedPrice))
})

test('summary: an invoice with differences waits for a human', () => {
  const lines = reconcileLines({
    lines: [billed(), billed({ productId: 'CTX-L3-EL', packSize: 50, price: 22.4 })],
    contractPrices: [
      { productId: 'MT-N-M', price: 28.4, packSize: 200 },
      { productId: 'CTX-L3-EL', price: 22.4, packSize: 50 },
    ],
  })
  assert.deepEqual(summariseInvoice(lines), {
    flaggedLines: 1,
    overcharge: 28,
    status: 'review',
  })
})

test('column guessing reads a distributor invoice export', () => {
  const mapping = guessInvoiceMapping([
    'Invoice No',
    'Invoice Date',
    'Item Number',
    'MFG Part',
    'Description',
    'UOM Qty',
    'Qty Shipped',
    'Unit Price',
    'Extended Price',
  ])

  assert.deepEqual(mapping, {
    invoiceNumber: 'Invoice No',
    invoiceDate: 'Invoice Date',
    mfrSku: 'MFG Part',
    vendorSku: 'Item Number',
    description: 'Description',
    packSize: 'UOM Qty',
    quantity: 'Qty Shipped',
    lineTotal: 'Extended Price',
    price: 'Unit Price',
  })
})

test('column guessing keeps the extended amount out of the unit price', () => {
  const mapping = guessInvoiceMapping(['SKU', 'Description', 'Qty', 'Price', 'Amount'])
  assert.equal(mapping.price, 'Price')
  assert.equal(mapping.lineTotal, 'Amount')
  assert.equal(mapping.quantity, 'Qty')
})

test('column guessing does not read "UOM Qty" as the quantity billed', () => {
  const mapping = guessInvoiceMapping(['Description', 'UOM Qty', 'Quantity', 'Each', 'Total'])
  assert.equal(mapping.packSize, 'UOM Qty')
  assert.equal(mapping.quantity, 'Quantity')
  assert.equal(mapping.price, 'Each')
  assert.equal(mapping.lineTotal, 'Total')
})

test('column guessing finds nothing rather than guessing wrong', () => {
  const mapping = guessInvoiceMapping(['Column A', 'Column B'])
  assert.deepEqual(mapping, {})
  assert.deepEqual(guessInvoiceMapping([]), {})
})

test('no lines is a clean, empty result — never a crash', () => {
  assert.deepEqual(reconcileLines(), [])
  assert.deepEqual(reconcileLines({}), [])
  assert.deepEqual(summariseInvoice(), { flaggedLines: 0, overcharge: 0, status: 'clean' })
})
