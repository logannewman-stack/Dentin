/**
 * CSV parsing for vendor price files.
 *
 * Distributor exports are not clean: quoted fields containing commas, a stray
 * BOM from Excel, CRLF line endings, and occasionally semicolon delimiters
 * from a European locale. This handles those rather than assuming split(',').
 */

/** Sniff the delimiter from the header line — comma, semicolon or tab. */
function detectDelimiter(sample) {
  const line = sample.split(/\r?\n/, 1)[0] ?? ''
  const counts = [
    [',', (line.match(/,/g) ?? []).length],
    [';', (line.match(/;/g) ?? []).length],
    ['\t', (line.match(/\t/g) ?? []).length],
  ]
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ','
}

export function parseCsv(text) {
  if (!text?.trim()) return { headers: [], rows: [] }

  // Strip the UTF-8 BOM Excel writes, which otherwise poisons the first header.
  const clean = text.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(clean)

  const records = []
  let field = ''
  let record = []
  let inQuotes = false

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]
    const next = clean[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"'
        i += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      record.push(field)
      field = ''
    } else if (char === '\n') {
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field !== '' || record.length) {
    record.push(field)
    records.push(record)
  }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ''))
  if (!nonEmpty.length) return { headers: [], rows: [] }

  const headers = nonEmpty[0].map((h) => h.trim())
  const rows = nonEmpty.slice(1).map((cells) =>
    headers.reduce((acc, header, i) => {
      acc[header] = (cells[i] ?? '').trim()
      return acc
    }, {}),
  )

  return { headers, rows }
}

/**
 * Guess which column holds which field.
 *
 * Vendors all name these differently — "Item #", "MFG Part", "Your Price",
 * "Contract Price", "UOM Qty". Ranked patterns beat exact-name lookup, and the
 * user can override every guess anyway.
 */
const PATTERNS = {
  gtin: [/^gtin$/i, /^upc$/i, /^ean$/i, /barcode/i, /\bgtin\b/i],
  mfrSku: [
    /^mfr?[\s_-]*(part|sku|item|no|number|#)/i,
    /manufacturer.*(part|sku|number)/i,
    /^mpn$/i,
    /^mfg/i,
  ],
  vendorSku: [/^(item|product|catalog|cat)[\s_-]*(no|number|#|code|id)/i, /^sku$/i, /vendor.*sku/i],
  description: [/^desc/i, /^product[\s_-]*name/i, /^item[\s_-]*desc/i, /^name$/i],
  price: [
    /contract[\s_-]*price/i,
    /your[\s_-]*price/i,
    /net[\s_-]*price/i,
    /^price$/i,
    /unit[\s_-]*cost/i,
    /^cost$/i,
  ],
  packSize: [/pack[\s_-]*(size|qty|quantity)/i, /^uom[\s_-]*qty/i, /units?[\s_-]*per/i, /^qty$/i],
  // Inventory imports (stocktake / order-history exports)
  onHand: [
    /on[\s_-]*hand/i,
    /in[\s_-]*stock/i,
    /current[\s_-]*(qty|stock|count)/i,
    /^(stock|count)$/i,
    /qty[\s_-]*(in[\s_-]*stock|available)/i,
  ],
  parLevel: [/^par([\s_-]*level)?$/i, /target[\s_-]*stock/i, /^max([\s_-]*level)?$/i],
}

export function guessMapping(headers) {
  const mapping = {}
  const taken = new Set()

  for (const [field, patterns] of Object.entries(PATTERNS)) {
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

/** Money columns arrive as "$1,234.56", "1.234,56" or "(12.34)" for credits. */
export function parseMoney(value) {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null

  const negative = /^\(.*\)$/.test(raw)
  let cleaned = raw.replace(/[()]/g, '').replace(/[^0-9.,-]/g, '')

  // "1.234,56" — European grouping. Comma is the decimal separator.
  if (/,\d{2}$/.test(cleaned) && /\./.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    cleaned = cleaned.replace(/,/g, '')
  }

  const n = Number.parseFloat(cleaned)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

export function parseInteger(value, fallback = 1) {
  const n = Number.parseInt(String(value ?? '').replace(/[^0-9-]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
