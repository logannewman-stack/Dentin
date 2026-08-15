/**
 * Scan payload parsing.
 *
 * A scanner in an operatory sees more than UPCs: unit-of-use boxes carry GS1
 * DataMatrix or QR codes with lot and expiry, reps hand out GS1 Digital Link
 * URLs, and the occasional label is a plain website link. This module turns
 * any of those into one normalized shape the Scan screen can act on without
 * guessing — whatever the code didn't carry stays null.
 *
 * Follows the GS1 General Specifications for the application identifiers that
 * actually appear on dental packaging:
 *   01/02 GTIN · 17 expiry · 15 best-before · 10 lot · 21 serial
 */

const GS = '\u001d' // ASCII 29 — FNC1 group separator

// AIs whose payload is a fixed digit count. Values must be numeric; hitting a
// non-digit here means the string was never a GS1 element string.
const FIXED_AI = {
  '00': 18, // SSCC
  '01': 14, // GTIN
  '02': 14, // GTIN of contained trade items
  11: 6, // production date
  12: 6, // due date
  13: 6, // packaging date
  15: 6, // best-before date
  16: 6, // sell-by date
  17: 6, // expiry date
  20: 2, // internal product variant
}

// Variable-length AIs run until a group separator or the end of the data.
const VARIABLE_AI = new Set([
  '10', // lot / batch
  '21', // serial
  '22', // consumer product variant
  '30', // variable count
  '37', // count of contained items
  '235', // third-party GTIN extension
  '240', // additional product id
  '241', // customer part number
  '250', // secondary serial
  '251', // reference to source entity
  '90', '91', '92', '93', '94', '95', '96', '97', '98', '99', // internal
])

const DL_KEYS = ['01', '10', '17', '21']

/** `]C1`, `]Q3`, `]d2`, `]E0`… — AIM symbology identifiers some scanners prepend. */
function stripSymbologyId(s) {
  return /^\][A-Za-z]\d/.test(s) ? s.slice(3) : s
}

/**
 * GS1 date (YYMMDD) → ISO date string. Day "00" means "any day of the month"
 * per the spec, which for expiry reads as end of month.
 */
function gs1Date(value) {
  if (!/^\d{6}$/.test(value)) return null
  const yy = Number(value.slice(0, 2))
  const mm = Number(value.slice(2, 4))
  let dd = Number(value.slice(4, 6))
  if (mm < 1 || mm > 12) return null
  const year = yy >= 51 ? 1900 + yy : 2000 + yy // GS1 century window
  const lastDay = new Date(Date.UTC(year, mm, 0)).getUTCDate()
  if (dd === 0 || dd > lastDay) dd = lastDay
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

/**
 * Parse a concatenated GS1 element string ("01…17…10…", with or without
 * group separators). Returns null when nothing recognizable was parsed.
 */
function parseElementString(input) {
  const out = { gtin: null, lot: null, serial: null }
  let expiry = null
  let bestBefore = null
  let parsedAny = false
  let i = 0

  while (i < input.length) {
    if (input[i] === GS) {
      i += 1
      continue
    }

    const two = input.slice(i, i + 2)
    const three = input.slice(i, i + 3)
    let ai = null
    if (FIXED_AI[two] !== undefined || VARIABLE_AI.has(two)) ai = two
    else if (VARIABLE_AI.has(three)) ai = three
    if (!ai) break // unknown AI — keep whatever parsed so far

    i += ai.length
    let value
    const fixedLen = FIXED_AI[ai]
    if (fixedLen !== undefined) {
      value = input.slice(i, i + fixedLen)
      if (!/^\d+$/.test(value) || value.length < fixedLen) break // not an element string
      i += fixedLen
    } else {
      const gsAt = input.indexOf(GS, i)
      value = gsAt === -1 ? input.slice(i) : input.slice(i, gsAt)
      i = gsAt === -1 ? input.length : gsAt
      if (!value) continue
    }

    parsedAny = true
    if (ai === '01' || ai === '02') out.gtin = out.gtin ?? value
    else if (ai === '17') expiry = gs1Date(value)
    else if (ai === '15') bestBefore = gs1Date(value)
    else if (ai === '10') out.lot = value
    else if (ai === '21') out.serial = value
  }

  if (!parsedAny) return null
  out.expiresAt = expiry ?? bestBefore ?? null
  return out
}

/** Human-readable form: "(01)00099…(17)271231(10)A42". */
function parseParenForm(input) {
  if (!/^\(\d{2,4}\)/.test(input)) return null
  let synthetic = ''
  const re = /\((\d{2,4})\)([^(]*)/g
  let m
  while ((m = re.exec(input)) !== null) synthetic += m[1] + m[2].trim() + GS
  return parseElementString(synthetic)
}

/** GS1 Digital Link: https://id.gs1.org/01/<gtin>/10/<lot>?17=YYMMDD… */
function parseDigitalLink(input) {
  let url
  try {
    url = new URL(input)
  } catch {
    return null
  }

  const segments = url.pathname
    .split('/')
    .map((seg) => {
      try {
        return decodeURIComponent(seg)
      } catch {
        return seg
      }
    })
    .filter(Boolean)

  const found = {}
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (DL_KEYS.includes(segments[i]) && found[segments[i]] === undefined) {
      found[segments[i]] = segments[i + 1]
      i += 1
    }
  }
  for (const key of DL_KEYS) {
    const v = url.searchParams.get(key)
    if (v && found[key] === undefined) found[key] = v
  }

  if (!found['01'] || !/^\d{8,14}$/.test(found['01'])) return null
  return {
    gtin: found['01'],
    lot: found['10'] ?? null,
    serial: found['21'] ?? null,
    expiresAt: found['17'] ? gs1Date(found['17']) : null,
  }
}

/**
 * Catalog lookup candidates for a scanned GTIN. A GS1 code carries GTIN-14
 * ("00" + UPC-A for most US products) while catalogs commonly store the
 * 12-digit UPC, so the same product can be written three ways. Ordered
 * most-likely-first; capped so the live path stays at a few RPCs per scan.
 */
export function gtinCandidates(code) {
  const digits = String(code ?? '').replace(/\D/g, '')
  if (digits.length < 6) return []
  const out = []
  const push = (v) => {
    if (v && !out.includes(v)) out.push(v)
  }
  push(digits)
  const significant = digits.replace(/^0+/, '')
  for (const len of [12, 13, 14, 8]) {
    if (significant.length <= len) push(significant.padStart(len, '0'))
  }
  return out.slice(0, 5)
}

/**
 * Normalize any scanned payload.
 *
 * @returns {{
 *   kind: 'gs1' | 'digital-link' | 'gtin' | 'url' | 'text',
 *   raw: string,
 *   gtin: string | null,
 *   lot: string | null,
 *   expiresAt: string | null,  // ISO date
 *   serial: string | null,
 * }}
 */
export function parseScanPayload(raw) {
  const original = String(raw ?? '').trim()
  const base = { raw: original, gtin: null, lot: null, expiresAt: null, serial: null }
  if (!original) return { ...base, kind: 'text' }

  const s = stripSymbologyId(original)

  if (/^https?:\/\//i.test(s)) {
    const dl = parseDigitalLink(s)
    return dl ? { ...base, kind: 'digital-link', ...dl } : { ...base, kind: 'url' }
  }

  const paren = parseParenForm(s)
  if (paren) return { ...base, kind: 'gs1', ...paren }

  // A bare numeric scan at a standard length is the barcode itself.
  if (/^\d+$/.test(s) && [8, 12, 13, 14].includes(s.length)) {
    return { ...base, kind: 'gtin', gtin: s }
  }

  // Anything else starting with two digits may be a concatenated element
  // string (GS1-128, GS1 DataMatrix/QR). The parser bails cleanly if not.
  if (/^\d{2}/.test(s)) {
    const parsed = parseElementString(s)
    if (parsed && (parsed.gtin || parsed.lot || parsed.expiresAt || parsed.serial)) {
      return { ...base, kind: 'gs1', ...parsed }
    }
  }

  return { ...base, kind: 'text' }
}
