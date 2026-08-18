/**
 * CSV parsing for vendor price files.
 *
 * Distributor exports are not clean: quoted fields containing commas, a stray
 * BOM from Excel, CRLF line endings, semicolon delimiters from a European
 * locale, pipe-delimited AS/400 dumps, and a title block above the real header
 * ("Contract pricing for account 4471902", "Generated 2026-08-01"). A rep also
 * pastes a block straight out of a spreadsheet, which arrives tab separated.
 *
 * Every one of those is a file a practice actually has in hand, so this reads
 * them rather than asking for a cleaner export.
 */

const DELIMITERS = [',', ';', '\t', '|']

/** Delimiter hits outside quoted runs — "Gloves, Medium" is one field. */
function countOutsideQuotes(line, delimiter) {
  let count = 0
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') i += 1
      else inQuotes = !inQuotes
    } else if (!inQuotes && char === delimiter) {
      count += 1
    }
  }
  return count
}

/**
 * Sniff the delimiter across the first several non-empty lines.
 *
 * A title row carries no delimiter at all, so a guess made from line one alone
 * comes back with the default and splits nothing. The winner is the character
 * that cuts the most lines into the same number of fields; where two agree
 * equally often the one producing more fields wins, which is how a
 * semicolon file full of European decimals ("24,80") stays a semicolon file.
 */
function detectDelimiter(text) {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(0, 12)

  let best = { delimiter: ',', score: 0 }

  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter)).filter((n) => n > 0)
    if (!counts.length) continue

    const tally = new Map()
    for (const n of counts) tally.set(n, (tally.get(n) ?? 0) + 1)

    let fields = 0
    let agree = 0
    for (const [n, times] of tally) {
      if (times > agree || (times === agree && n > fields)) {
        fields = n
        agree = times
      }
    }

    const score = agree * 100 + fields
    if (score > best.score) best = { delimiter, score }
  }

  return best.delimiter
}

/** "1,234.56", "$12", "(9.50)", "200" — a value, not a column name. */
function looksNumeric(cell) {
  const s = String(cell).trim()
  if (!s || !/\d/.test(s)) return false
  return /^[($€£]?\s*-?[\d.,\s]+%?\)?$/.test(s)
}

/**
 * Find the row that is actually the header.
 *
 * Price files routinely open with a title, an account line and a blank row
 * before the columns start. Score each of the first few rows on how much it
 * reads as a header — filled cells, no numbers — and on whether the rows below
 * it line up with its width. A row that is mostly numbers is data.
 */
function findHeaderRow(records) {
  const limit = Math.min(records.length, 8)
  let bestIndex = 0
  let bestScore = -Infinity

  for (let i = 0; i < limit; i += 1) {
    const cells = records[i]
    const filled = cells.filter((c) => c.trim() !== '')
    if (!filled.length) continue

    const numeric = filled.filter(looksNumeric).length
    if (numeric * 2 > filled.length) continue

    const below = records.slice(i + 1, i + 6)
    const consistent = below.filter((r) => r.length === cells.length).length
    const consistency = below.length ? consistent / below.length : 0

    const score = filled.length * 2 + consistency * 10 - numeric * 3
    // Strictly greater, so a tie keeps the earliest row: never skip a real
    // header just because a data row scores the same.
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  return bestIndex
}

/**
 * Unique, non-empty column names.
 *
 * Rows are keyed by header name, so two columns both called "Price" would
 * collapse into one and drop a column of the file without saying so.
 */
function uniqueHeaders(cells) {
  const used = new Set()

  return cells.map((raw, i) => {
    const base = String(raw ?? '').trim() || `Column ${i + 1}`
    if (!used.has(base)) {
      used.add(base)
      return base
    }
    let n = 2
    while (used.has(`${base} ${n}`)) n += 1
    const name = `${base} ${n}`
    used.add(name)
    return name
  })
}

export function parseCsv(text) {
  if (!text?.trim()) return { headers: [], rows: [], delimiter: ',', skippedRows: 0 }

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
  if (!nonEmpty.length) return { headers: [], rows: [], delimiter, skippedRows: 0 }

  const skippedRows = findHeaderRow(nonEmpty)
  const headers = uniqueHeaders(nonEmpty[skippedRows].map((h) => h.trim()))
  const rows = nonEmpty.slice(skippedRows + 1).map((cells) =>
    headers.reduce((acc, header, i) => {
      acc[header] = (cells[i] ?? '').trim()
      return acc
    }, {}),
  )

  return { headers, rows, delimiter, skippedRows }
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
  // Ranked after vendorSku on purpose: "Item Number" is an identity column,
  // where a bare "Item" is almost always what the thing is called.
  description: [
    /^desc/i,
    /^product[\s_-]*name/i,
    /^item[\s_-]*(desc|name)/i,
    /^name$/i,
    /^item$/i,
  ],
  // Ranked by how close the column is to what the invoice will say. A file
  // carrying both "List Price" and "Your Price" must map the one the practice
  // actually pays, so list sits at the bottom of the ladder.
  price: [
    /contract(ed)?[\s_-]*(price|cost)/i,
    /^contracted$/i,
    /your[\s_-]*(price|cost)/i,
    /net[\s_-]*(price|cost)/i,
    /^net$/i,
    /^(ea|each)[\s_-]*(price|cost)/i,
    /case[\s_-]*(price|cost)/i,
    /^price$/i,
    /unit[\s_-]*(price|cost)/i,
    /^cost$/i,
    /list[\s_-]*price/i,
  ],
  packSize: [
    /pack[\s_-]*(size|qty|quantity)/i,
    /^uom[\s_-]*qty/i,
    /units?[\s_-]*per/i,
    /case[\s_-]*(qty|quantity|pack|count)/i,
    /^(pack|pkg|uom)$/i,
    /^qty$/i,
  ],
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
  } else if (!/\./.test(cleaned) && /,\d{1,2}$/.test(cleaned)) {
    // "12,34" — no dot anywhere and one or two digits after the final comma:
    // a decimal comma. "1,234" (three digits) stays a thousands separator.
    cleaned = cleaned.replace(/,(\d{1,2})$/, '.$1').replace(/,/g, '')
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
