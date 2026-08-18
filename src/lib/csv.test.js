// Run with: node --test src/lib/csv.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { guessMapping, parseCsv, parseInteger, parseMoney } from './csv.js'

test('a block pasted out of Excel arrives tab separated', () => {
  const pasted = [
    'Item Number\tMFG Part\tDescription\tUOM Qty\tYour Price',
    '4471902\tMT-N-M\tMicro-Touch Nitrile Exam Gloves Medium\t200\t24.80',
    '4471903\tCTX-L3-EL\tLevel 3 Procedure Masks Earloop\t50\t19.95',
  ].join('\n')

  const { headers, rows, delimiter, skippedRows } = parseCsv(pasted)
  assert.equal(delimiter, '\t')
  assert.equal(skippedRows, 0)
  assert.deepEqual(headers, ['Item Number', 'MFG Part', 'Description', 'UOM Qty', 'Your Price'])
  assert.equal(rows.length, 2)
  assert.equal(rows[0]['Your Price'], '24.80')
})

test('semicolon file with European decimals stays semicolon delimited', () => {
  // The decimal commas are one-per-line and would out-vote a header-only sniff.
  const text = [
    'Artikelnummer;Beschreibung;Menge;Preis',
    '4471902;Nitril Handschuhe M;200;24,80',
    '4471903;Mundschutz Typ IIR;50;19,95',
  ].join('\r\n')

  const { headers, rows, delimiter } = parseCsv(text)
  assert.equal(delimiter, ';')
  assert.equal(headers.length, 4)
  assert.equal(rows[0].Preis, '24,80')
  assert.equal(parseMoney(rows[0].Preis), 24.8)
})

test('pipe delimited, with a UTF-8 BOM and CRLF endings', () => {
  const text = '﻿SKU|Description|Net\r\nMT-N-M|Nitrile gloves|24.80\r\n'
  const { headers, rows, delimiter } = parseCsv(text)
  assert.equal(delimiter, '|')
  assert.deepEqual(headers, ['SKU', 'Description', 'Net'])
  assert.equal(rows[0].SKU, 'MT-N-M')
})

test('junk rows above the header are skipped and counted', () => {
  const text = [
    'Meridian Dental Supply — Contracted Price File',
    'Generated 2026-08-01 for account 4471902',
    '',
    'Item Number,MFG Part,Description,UOM Qty,Your Price',
    '4471902,MT-N-M,Micro-Touch Nitrile Exam Gloves Medium,200,24.80',
    '4471903,CTX-L3-EL,Level 3 Procedure Masks Earloop,50,19.95',
  ].join('\n')

  const { headers, rows, skippedRows } = parseCsv(text)
  assert.equal(skippedRows, 2)
  assert.deepEqual(headers, ['Item Number', 'MFG Part', 'Description', 'UOM Qty', 'Your Price'])
  assert.equal(rows.length, 2)
  assert.equal(rows[1]['MFG Part'], 'CTX-L3-EL')
})

test('a clean file is not mistaken for a preamble', () => {
  const text = 'Description,Price\nCotton rolls,38.00\nGauze 2x2,46.00'
  const { skippedRows, rows } = parseCsv(text)
  assert.equal(skippedRows, 0)
  assert.equal(rows.length, 2)
})

test('repeated and blank column names are made unique, so no column is lost', () => {
  const text = 'Item,,Price,Price\nMT-N-M,x,31.00,24.80'
  const { headers, rows } = parseCsv(text)
  assert.deepEqual(headers, ['Item', 'Column 2', 'Price', 'Price 2'])
  assert.equal(rows[0].Price, '31.00')
  assert.equal(rows[0]['Price 2'], '24.80')
})

test('quoted fields keep the delimiter inside them', () => {
  const text = 'Description,Price\n"Gloves, Nitrile, Medium",24.80\n"He said ""fine""",1.00'
  const { rows } = parseCsv(text)
  assert.equal(rows[0].Description, 'Gloves, Nitrile, Medium')
  assert.equal(rows[0].Price, '24.80')
  assert.equal(rows[1].Description, 'He said "fine"')
})

test('nothing in, nothing out — never a crash', () => {
  assert.deepEqual(parseCsv(''), { headers: [], rows: [], delimiter: ',', skippedRows: 0 })
  assert.deepEqual(parseCsv('   \n  \n'), { headers: [], rows: [], delimiter: ',', skippedRows: 0 })
})

test('guessMapping prefers the price the practice actually pays', () => {
  const mapping = guessMapping(['Item Number', 'MFG Part', 'Description', 'List Price', 'Your Price'])
  assert.equal(mapping.price, 'Your Price')
  assert.equal(mapping.vendorSku, 'Item Number')
  assert.equal(mapping.mfrSku, 'MFG Part')
  assert.equal(mapping.description, 'Description')
})

test('guessMapping reads the shapes vendors actually ship', () => {
  assert.equal(guessMapping(['SKU', 'Desc', 'Net']).price, 'Net')
  assert.equal(guessMapping(['SKU', 'Desc', 'Contracted Price']).price, 'Contracted Price')
  assert.equal(guessMapping(['SKU', 'Desc', 'Ea Price', 'Case Price']).price, 'Ea Price')
  assert.equal(guessMapping(['Desc', 'List Price']).price, 'List Price')
  assert.equal(guessMapping(['Desc', 'Case Qty', 'Net Price']).packSize, 'Case Qty')

  // A distributor export headed "Catalog # / Mfr Part / Item / Pack / Net Price"
  const tsv = guessMapping(['Catalog #', 'Mfr Part', 'Item', 'Pack', 'Net Price'])
  assert.deepEqual(tsv, {
    mfrSku: 'Mfr Part',
    vendorSku: 'Catalog #',
    description: 'Item',
    price: 'Net Price',
    packSize: 'Pack',
  })
})

test('parseMoney reads the formats price columns arrive in', () => {
  assert.equal(parseMoney('$1,234.56'), 1234.56)
  assert.equal(parseMoney('(12.34)'), -12.34) // credit, in accounting parens
  assert.equal(parseMoney('1.234,56'), 1234.56) // European grouping
  assert.equal(parseMoney('12,34'), 12.34) // decimal comma
  assert.equal(parseMoney('1,234'), 1234) // thousands comma, not a decimal
  assert.equal(parseMoney(''), null)
  assert.equal(parseMoney('N/A'), null)
  assert.equal(parseMoney(null), null)
})

test('parseInteger falls back rather than returning zero or a negative', () => {
  assert.equal(parseInteger('200'), 200)
  assert.equal(parseInteger('box of 50', 1), 50)
  assert.equal(parseInteger('', 1), 1)
  assert.equal(parseInteger('0', 1), 1)
  assert.equal(parseInteger(undefined, 12), 12)
})
