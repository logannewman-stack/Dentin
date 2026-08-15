// Run with: node --test src/lib/gs1.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { gtinCandidates, parseScanPayload } from './gs1.js'

const GS = '\u001d'

test('GS1-128 element string with symbology id and FNC1 separators', () => {
  const p = parseScanPayload(`]C101000999990000101727063010LOT42${GS}21SER9`)
  assert.equal(p.kind, 'gs1')
  assert.equal(p.gtin, '00099999000010')
  assert.equal(p.expiresAt, '2027-06-30')
  assert.equal(p.lot, 'LOT42')
  assert.equal(p.serial, 'SER9')
})

test('variable-length lot mid-string, terminated by GS', () => {
  const p = parseScanPayload(`010009999900001010B7${GS}17270600`)
  assert.equal(p.gtin, '00099999000010')
  assert.equal(p.lot, 'B7')
  // day "00" = end of month per the GS1 spec
  assert.equal(p.expiresAt, '2027-06-30')
})

test('lot at end of data without a trailing separator', () => {
  const p = parseScanPayload('01000999990000101726123110A1-3B')
  assert.equal(p.lot, 'A1-3B')
  assert.equal(p.expiresAt, '2026-12-31')
})

test('best-before (15) stands in for expiry only when 17 is absent', () => {
  assert.equal(parseScanPayload('010009999900001015271115').expiresAt, '2027-11-15')
  const both = parseScanPayload(`01000999990000101527111517270630`)
  assert.equal(both.expiresAt, '2027-06-30')
})

test('human-readable parenthesized form', () => {
  const p = parseScanPayload('(01)00099999000010(17)271231(10)B7')
  assert.equal(p.kind, 'gs1')
  assert.equal(p.gtin, '00099999000010')
  assert.equal(p.expiresAt, '2027-12-31')
  assert.equal(p.lot, 'B7')
})

test('GS1 Digital Link URL with path and query AIs', () => {
  const p = parseScanPayload('https://id.gs1.org/01/00099999000010/10/B7?17=271231')
  assert.equal(p.kind, 'digital-link')
  assert.equal(p.gtin, '00099999000010')
  assert.equal(p.lot, 'B7')
  assert.equal(p.expiresAt, '2027-12-31')
})

test('plain UPC-A stays a bare gtin', () => {
  const p = parseScanPayload('099999000010')
  assert.equal(p.kind, 'gtin')
  assert.equal(p.gtin, '099999000010')
  assert.equal(p.lot, null)
})

test('EAN-13 behind a symbology id', () => {
  const p = parseScanPayload(']E00099999000010')
  assert.equal(p.kind, 'gtin')
  assert.equal(p.gtin, '0099999000010')
})

test('ITF-14 (14 digits) is a gtin, not an element string', () => {
  const p = parseScanPayload('00099999000010')
  assert.equal(p.kind, 'gtin')
  assert.equal(p.gtin, '00099999000010')
})

test('ordinary URL is url, not a product', () => {
  const p = parseScanPayload('https://example.com/promo?utm=q3')
  assert.equal(p.kind, 'url')
  assert.equal(p.gtin, null)
})

test('free text QR payload is text', () => {
  const p = parseScanPayload('WIFI:T:WPA;S:FrontDesk;;')
  assert.equal(p.kind, 'text')
})

test('numeric-looking text that is not GS1 does not false-positive', () => {
  // "20" is an AI but its value here is non-numeric → parser must bail to text
  assert.equal(parseScanPayload('20% off sealants today').kind, 'text')
})

test('gtinCandidates bridges GTIN-14 ↔ UPC-12 ↔ EAN-13', () => {
  const c = gtinCandidates('00099999000010')
  assert.ok(c.includes('00099999000010'))
  assert.ok(c.includes('099999000010'))
  assert.ok(c.includes('0099999000010'))
  assert.ok(c.length <= 5)
})

test('gtinCandidates on a short or junk code stays sane', () => {
  assert.deepEqual(gtinCandidates('123'), [])
  assert.ok(gtinCandidates('099999000010').includes('099999000010'))
})
