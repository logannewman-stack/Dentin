import { timingSafeEqual } from 'node:crypto'
import { adminClient, json } from '../_lib/supabase.js'

/**
 * POST /api/imports/email — a price file arriving by email.
 *
 * OPERATOR SETUP. This endpoint receives nothing on its own; until the mail
 * side is configured, the forwarding address the app shows goes nowhere:
 *
 *   1. MX records for `in.dentininventory.com` pointed at an inbound-email
 *      provider (Resend, Postmark, Mailgun and SendGrid are all read here).
 *   2. That provider set to POST parsed inbound mail to
 *      https://<your-deployment>/api/imports/email
 *   3. SPF/DKIM/DMARC records the provider asks for, so a forwarded rep email
 *      is not silently binned before it reaches step 2.
 *   4. Optional: set INBOUND_EMAIL_SECRET and have the provider send it as an
 *      `x-inbound-secret` header, a bearer token, or `?key=`. While the
 *      variable is unset the check is skipped, so this endpoint never depends
 *      on configuration that does not exist yet.
 *
 * The practice is identified only by the token in the recipient address
 * (`prices+<token>@…`), which is random per practice. An address that does not
 * resolve gets a flat 404 — never a hint about which half was wrong.
 */

// Vendor price files are small. A few thousand rows of CSV is well under this;
// anything larger is somebody's newsletter or a scanned PDF.
const MAX_TEXT_BYTES = 2 * 1024 * 1024
const DELIMITERS = [',', ';', '\t', '|']

/** First non-empty string among the shapes the providers use. */
function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/** Flatten "to" into plain addresses — a string, a list, or objects with .Email. */
function collectAddresses(value, out = []) {
  if (!value) return out
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const item of value) collectAddresses(item, out)
  else if (typeof value === 'object') {
    collectAddresses(value.Email ?? value.email ?? value.address ?? value.to ?? null, out)
  }
  return out
}

/**
 * The practice token out of the recipient address.
 *
 * `prices+<token>@…` is what the app hands out. A provider that rewrites the
 * local part still leaves the plus-tag intact, so that is the fallback.
 */
function tokenFrom(addresses) {
  for (const address of addresses) {
    const tagged = /prices\+([A-Za-z0-9_-]{6,64})@/i.exec(address)
    if (tagged) return tagged[1].toLowerCase()
  }
  for (const address of addresses) {
    const plus = /[A-Za-z0-9._-]+\+([A-Za-z0-9_-]{6,64})@/i.exec(address)
    if (plus) return plus[1].toLowerCase()
  }
  return null
}

/** Control characters, tab and newline aside, mean these bytes were not text. */
function looksLikeText(sample) {
  let control = 0
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i)
    if (code === 9 || code === 10 || code === 13) continue
    if (code < 32 || code === 127) control += 1
  }
  return control * 20 < sample.length
}

/** Attachment payloads arrive base64 (Postmark, Resend) or as plain text. */
function decodeContent(value, declaredEncoding) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const encoding = String(declaredEncoding ?? '').toLowerCase()
  const looksBase64 =
    /^[A-Za-z0-9+/\s]+={0,2}\s*$/.test(value) && value.replace(/\s/g, '').length > 24

  if (encoding === 'base64' || (!encoding && looksBase64)) {
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8')
      // A spreadsheet decodes to text; a PDF decodes to control characters.
      // Keep the original when decoding made it worse.
      if (looksLikeText(decoded.slice(0, 400))) return decoded
    } catch {
      /* not base64 after all — fall through to the raw value */
    }
  }
  return value
}

/** Separators outside quoted runs — "Gloves, Medium" is one field, not two. */
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
 * Is this rows and columns, or is it a newsletter?
 *
 * A table puts the same number of separators on nearly every line. Prose has
 * commas in it too, but never the same count line after line — which is what
 * separates a price file from a rep saying hello. A title block above the
 * header is allowed for, so the agreement is measured, not demanded.
 */
function looksTabular(text) {
  if (!text || !text.trim()) return false
  if (/<html|<!doctype html/i.test(text.slice(0, 400))) return false

  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(0, 40)
  if (lines.length < 2) return false

  return DELIMITERS.some((delimiter) => {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter))
    const withDelimiter = counts.filter((n) => n > 0).length
    if (withDelimiter < 2) return false

    const tally = new Map()
    for (const n of counts) if (n > 0) tally.set(n, (tally.get(n) ?? 0) + 1)

    for (const [width, agree] of tally) {
      if (agree < 2 || agree < withDelimiter * 0.8) continue
      // A price row carries a number. An email signature lines up just as
      // neatly and carries none.
      const numeric = lines.filter((line, i) => counts[i] === width && /\d/.test(line)).length
      if (numeric * 2 >= agree) return true
    }
    return false
  })
}

/**
 * Best-effort row count: the lines that share the table's shape, less the
 * header. Title lines above the header are not rows, and counting them would
 * disagree with what the import screen goes on to show.
 */
function countRows(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')

  let best = 0
  for (const delimiter of DELIMITERS) {
    const tally = new Map()
    for (const line of lines) {
      const n = countOutsideQuotes(line, delimiter)
      if (n > 0) tally.set(n, (tally.get(n) ?? 0) + 1)
    }
    if (tally.size) best = Math.max(best, ...tally.values())
  }

  return best >= 2 ? best - 1 : Math.max(0, lines.length - 1)
}

async function rawBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_TEXT_BYTES * 2) break
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * The posted payload as an object, whatever the provider sent. An unknown
 * shape comes back null so the caller can answer plainly instead of crashing.
 */
async function readPayload(req) {
  const type = String(req.headers['content-type'] ?? '')
  if (type.includes('multipart/form-data')) return null

  let body = req.body
  if (body == null || body === '') body = await rawBody(req)

  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body

  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body ?? '')
  if (!text.trim()) return null

  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    if (type.includes('application/x-www-form-urlencoded')) {
      return Object.fromEntries(new URLSearchParams(text))
    }
    return null
  }
}

/** Optional shared secret. Unset means the endpoint is open, by design. */
function secretOk(req) {
  const expected = process.env.INBOUND_EMAIL_SECRET
  if (!expected) return true

  const url = new URL(req.url ?? '/', 'http://localhost')
  const provided =
    firstString(
      req.headers['x-inbound-secret'],
      req.headers['x-webhook-secret'],
      String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''),
      url.searchParams.get('key'),
    ) ?? ''

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
  if (!secretOk(req)) return json(res, 401, { error: 'Unauthorized' })

  let payload
  try {
    payload = await readPayload(req)
  } catch (e) {
    return json(res, 400, { error: `Could not read that payload: ${e.message}` })
  }
  if (!payload) {
    return json(res, 400, {
      error: 'Unrecognized inbound payload — expected parsed JSON or form-encoded mail',
    })
  }

  const recipients = collectAddresses([
    payload.to,
    payload.To,
    payload.ToFull,
    payload.recipient,
    payload.Recipient,
    payload.OriginalRecipient,
    payload.envelope?.to,
    payload.envelope?.To,
    payload['envelope[to]'],
  ])
  const token = tokenFrom(recipients)
  if (!token) return json(res, 400, { error: 'No recipient address in that payload' })

  const fromAddress =
    collectAddresses([
      payload.from,
      payload.From,
      payload.FromFull,
      payload.sender,
      payload.Sender,
      payload.envelope?.from,
    ])[0] ?? null
  const subject = firstString(payload.subject, payload.Subject) ?? null

  // Attachment first: a rep attaches the export and writes "see attached".
  const attachments = payload.attachments ?? payload.Attachments ?? payload.attachment ?? []
  const files = Array.isArray(attachments) ? attachments : []

  let filename = null
  let text = ''

  for (const file of files) {
    const name = firstString(file?.filename, file?.Name, file?.FileName, file?.name) ?? ''
    const contentType = String(
      file?.contentType ?? file?.ContentType ?? file?.content_type ?? file?.type ?? '',
    ).toLowerCase()
    const isTabular =
      /\.(csv|tsv|txt|tab|psv)$/i.test(name) ||
      contentType.includes('csv') ||
      contentType.includes('tab-separated') ||
      contentType === 'text/plain'
    if (!isTabular) continue

    const decoded = decodeContent(
      file?.content ?? file?.Content ?? file?.data ?? file?.Data ?? '',
      file?.encoding ?? file?.ContentEncoding ?? file?.contentEncoding,
    )
    if (decoded.trim()) {
      filename = name || null
      text = decoded
      break
    }
  }

  if (!text.trim()) {
    text =
      firstString(
        payload.text,
        payload.TextBody,
        payload['body-plain'],
        payload['stripped-text'],
        payload.plain,
        payload.body,
      ) ?? ''
  }

  const admin = adminClient()

  // The token is the only identifier; a miss is a flat 404 either way, so a
  // guessed address learns nothing from the response.
  const { data: practice, error: lookupError } = await admin
    .from('practices')
    .select('id')
    .eq('import_token', token)
    .maybeSingle()
  if (lookupError) return json(res, 500, { error: lookupError.message })
  if (!practice) return json(res, 404, { error: 'Not found' })

  // The practice is known from here on, so a rejection is recorded where they
  // can see it rather than disappearing into a log they cannot read.
  const reject = async (reason) => {
    const { error } = await admin.from('price_imports').insert({
      practice_id: practice.id,
      source: 'email',
      filename,
      from_address: fromAddress,
      subject,
      content: text.slice(0, 2000),
      byte_size: Buffer.byteLength(text, 'utf8'),
      status: 'failed',
      note: reason,
    })
    if (error) return json(res, 500, { error: error.message })
    return json(res, 400, { error: reason, recorded: true })
  }

  const byteSize = Buffer.byteLength(text, 'utf8')
  if (byteSize > MAX_TEXT_BYTES) {
    return reject(`That file is ${(byteSize / 1048576).toFixed(1)} MB — the limit is 2 MB of text`)
  }
  if (!looksTabular(text)) {
    return reject('No rows and columns found — attach the price file as a CSV')
  }

  const { data, error } = await admin
    .from('price_imports')
    .insert({
      practice_id: practice.id,
      supplier_id: null,
      source: 'email',
      filename,
      from_address: fromAddress,
      subject,
      content: text,
      byte_size: byteSize,
      row_count: countRows(text),
      status: 'pending',
    })
    .select('id')
    .maybeSingle()
  if (error) return json(res, 500, { error: error.message })

  return json(res, 200, { ok: true, id: data?.id ?? null, rowCount: countRows(text) })
}
