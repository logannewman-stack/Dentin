/**
 * Price imports — turning whatever the rep sent into the practice's own prices.
 *
 * Until a practice's negotiated prices are loaded, every comparison Dentin
 * makes is against a seeded list price, which is a guess. So this module is
 * built around removing friction rather than demanding a clean file: a vendor
 * the practice has no account with yet, a file forwarded by email, a row that
 * matched nothing and has to be fixed by hand — all of it is handled, and the
 * fix is remembered so the next file from that vendor matches instantly.
 *
 * Matching runs a ladder, strongest first: a match a human already confirmed,
 * then barcode, then manufacturer part number, then description. A wrong price
 * is worse than a missing price — it quietly moves money on every screen that
 * reads it — so a description that only nearly matches comes back unusable and
 * waits for a person, instead of guessing.
 */
import { cents, emit, isDemo, must, myPracticeId, supabase } from '../repoCore'
import { PRODUCTS } from '../demoData'
import { parseCsv, parseInteger, parseMoney } from '../csv'

/** Where forwarded price files land. DNS setup lives in api/imports/email.js. */
const IMPORT_DOMAIN = 'in.dentininventory.com'

// --- demo stores ------------------------------------------------------------
/** key: `${supplierId}:${mfrSku}` → the practice's negotiated price */
const demoContracts = new Map()

function contractKey(supplierId, mfrSku) {
  return `${supplierId}:${mfrSku}`
}

/**
 * The demo practice's contracted price for one item, or undefined.
 *
 * `repository.js` reads this when it compares offers: a contract price
 * overrides the catalog price for that vendor, because it is what the invoice
 * will say. The store lives here because this module is what fills it.
 */
export function demoContractFor(supplierId, mfrSku) {
  return demoContracts.get(contractKey(supplierId, mfrSku))
}

/** key: `${supplierId}:${vendorSku}` → catalog product id */
const demoVendorMap = new Map()

function mapKey(supplierId, vendorSku) {
  return `${supplierId}:${String(vendorSku ?? '').trim().toUpperCase()}`
}

// Two matches a person confirmed on an earlier import. Seeded so the demo
// shows what the second file from a vendor actually feels like.
demoVendorMap.set(mapKey('henry-schein', '4471902'), 'MT-N-M')
demoVendorMap.set(mapKey('henry-schein', '4471915'), 'MTX-CW-160')

const DEMO_SCHEIN_FILE = `Henry Schein — Contracted Price Schedule
Account HS-4471902 · Ridgeline Dental Studio · effective 2026-08-01

Item Number,MFG Part,Description,UOM Qty,List Price,Your Price
4471902,MT-N-M,"Micro-Touch Nitrile Exam Gloves, Medium",200,32.18,26.40
4471903,MT-N-L,"Micro-Touch Nitrile Exam Gloves, Large",200,32.18,26.40
4471915,MTX-CW-160,CaviWipes Disinfectant Towelettes,160,24.15,19.85
4471922,CTX-L3-EL,"Level 3 Procedure Masks, Earloop",50,27.20,21.75
4471948,HAL-SP-35,"Sterilization Pouches, 3.5in x 9in",200,20.98,16.90
4471955,3M-AT-1262,Attest Biological Spore Tests,25,76.03,63.10
4472011,3M-FSU-A2B,"Filtek Supreme Ultra, A2 Body",20,102.12,88.75
4472018,ULT-UE-KIT,Ultra-Etch 35% Etchant Kit,20,71.04,61.20
4472090,SEP-ART-100,Septocaine Articaine 4% w/ Epi,50,146.52,124.90
4472144,HS-BIB-2PLY,Patient Bibs 2-Ply Lavender (Schein Brand),500,38.40,29.95`

const DEMO_DARBY_FILE = `Catalog #\tMfr Part\tItem\tPack\tNet Price
880431-11\tRIC-CR-2\tCotton Rolls #2 Medium\t2000\t33.20
880431-24\tDUK-GZ-22\tGauze Sponges 2x2 8-Ply\t5000\t41.15
880431-36\tCAR-SE-CL\tSaliva Ejectors Clear\t100\t10.85
880431-52\tYNG-PA-SC\tDisposable Prophy Angles Soft Cup\t100\t28.60`

/**
 * The demo inbox: two files a rep actually sent. One carries a title block
 * above the header and a house-brand row nothing will match, because that is
 * what real files do.
 */
const DEMO_IMPORTS = [
  {
    id: 'imp-schein-aug',
    supplierId: 'henry-schein',
    source: 'email',
    filename: 'HS_ContractPricing_Aug2026.csv',
    fromAddress: 'm.ferrer@henryschein.example',
    subject: 'Your 2026 contracted pricing — Ridgeline Dental',
    content: DEMO_SCHEIN_FILE,
    rowCount: 10,
  },
  {
    id: 'imp-darby-aug',
    supplierId: 'darby',
    source: 'email',
    filename: 'darby-net-pricing.txt',
    fromAddress: 't.lange@darbydental.example',
    subject: 'Net pricing on your consumables',
    content: DEMO_DARBY_FILE,
    rowCount: 4,
  },
]

let demoInbox = null

function inbox() {
  if (!demoInbox) {
    demoInbox = DEMO_IMPORTS.map((row, i) => ({
      ...row,
      byteSize: row.content.length,
      status: 'pending',
      appliedCount: null,
      note: null,
      appliedAt: null,
      // Staggered so the inbox reads like mail, not like a fixture.
      receivedAt: new Date(Date.now() - (i * 4 + 1) * 86400000).toISOString(),
    }))
  }
  return demoInbox
}

// --- catalog ----------------------------------------------------------------
/**
 * The catalog in one shape for both worlds. Read whole rather than queried per
 * row: a price file runs to thousands of rows and matching is local work.
 */
async function loadCatalog() {
  if (isDemo) {
    return PRODUCTS.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      gtin: p.gtin,
      mfrSku: p.sku,
      packSize: p.packSize,
      unit: p.unit,
    }))
  }

  const data = must(
    await supabase
      .from('products')
      .select('id, name, brand, gtin, mfr_sku, pack_size, unit')
      .limit(5000),
    'read the catalog',
  )
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    gtin: p.gtin,
    mfrSku: p.mfr_sku,
    packSize: p.pack_size,
    unit: p.unit,
  }))
}

// --- identity keys ----------------------------------------------------------
/**
 * One canonical form for every GTIN length.
 *
 * A UPC-12 on an invoice and a GTIN-14 in the catalog are the same item — the
 * longer form is the shorter one padded with zeros — so strip the padding and
 * compare what is left.
 */
function gtinKey(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length < 8) return ''
  return digits.replace(/^0+/, '') || '0'
}

/** `MT-N-M`, `mt n m` and `MTNM` are one part number written three ways. */
function mpnKey(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

// Packaging words carry no identity — every second row says "box" or "each".
const NOISE = new Set([
  'the', 'and', 'for', 'with', 'of', 'a', 'an', 'per', 'ea', 'each', 'box', 'bx', 'case', 'cs',
  'pack', 'pk', 'ct', 'count', 'qty', 'size', 'item', 'brand',
])

/**
 * Description tokens, with numbers weighted double.
 *
 * "A2" against "A3", "2x2" against "4x4" — the digits are the whole difference
 * between two otherwise identical products, so they have to count for more
 * than the words every row shares.
 */
function tokenize(text) {
  const weights = new Map()
  for (const raw of String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw) continue
    const numeric = /\d/.test(raw)
    if (!numeric && (raw.length < 2 || NOISE.has(raw))) continue
    weights.set(raw, numeric ? 2 : 1)
  }
  return weights
}

function totalWeight(weights) {
  let sum = 0
  for (const w of weights.values()) sum += w
  return sum
}

/** Weighted Dice overlap: 1 is the same words, 0 is nothing in common. */
function similarity(a, aTotal, b, bTotal) {
  if (!aTotal || !bTotal) return 0
  let shared = 0
  for (const [token, weight] of a) if (b.has(token)) shared += weight
  return (2 * shared) / (aTotal + bTotal)
}

// A description match has to be strong AND clearly ahead of the runner-up.
// "Nitrile Gloves Medium" and "Nitrile Gloves Large" both score high against a
// row that omits the size, and applying either would put a real price on the
// wrong item. A wrong price is worse than a missing one: it reads as good news
// and moves money. So a close pair is left for a person to resolve.
const NAME_MIN_SCORE = 0.62
const NAME_MIN_GAP = 0.08

function buildIndexes(catalog) {
  const byId = new Map()
  const gtins = new Map()
  const mpns = new Map()
  const tokens = new Map()
  const docs = []

  catalog.forEach((product, i) => {
    byId.set(product.id, product)

    // Two catalog products sharing an identity key make that key useless —
    // hold null rather than pick one of them at random.
    const g = gtinKey(product.gtin)
    if (g) gtins.set(g, gtins.has(g) ? null : product)

    const m = mpnKey(product.mfrSku)
    if (m) mpns.set(m, mpns.has(m) ? null : product)

    const weights = tokenize(`${product.name} ${product.brand ?? ''}`)
    docs.push({ product, weights, total: totalWeight(weights) })
    for (const token of weights.keys()) {
      const posting = tokens.get(token)
      if (posting) posting.push(i)
      else tokens.set(token, [i])
    }
  })

  return { byId, gtins, mpns, tokens, docs }
}

/**
 * Best catalog product for a free-text description, or null when the best
 * guess is not good enough to spend money on.
 */
function matchByDescription(description, indexes) {
  const weights = tokenize(description)
  const total = totalWeight(weights)
  if (!total) return { product: null, score: 0, nearest: null }

  // Rare tokens first: a brand or a size narrows the field, where "gloves"
  // would drag in half the catalog before anything is scored.
  const postings = [...weights.keys()]
    .map((token) => indexes.tokens.get(token))
    .filter(Boolean)
    .sort((a, b) => a.length - b.length)

  const candidates = new Set()
  for (const posting of postings) {
    if (candidates.size >= 400 && posting.length > 200) break
    for (const i of posting) candidates.add(i)
    if (candidates.size >= 1500) break
  }

  let best = null
  let bestScore = 0
  let runnerUp = 0

  for (const i of candidates) {
    const doc = indexes.docs[i]
    const score = similarity(weights, total, doc.weights, doc.total)
    if (score > bestScore) {
      runnerUp = bestScore
      bestScore = score
      best = doc.product
    } else if (score > runnerUp) {
      runnerUp = score
    }
  }

  if (!best || bestScore < NAME_MIN_SCORE || bestScore - runnerUp < NAME_MIN_GAP) {
    // Name the runner-up only when it was genuinely in contention. A 0.3 score
    // is not a near miss, and offering it would make the guess look considered.
    return { product: null, score: bestScore, nearest: bestScore >= 0.45 ? best : null }
  }
  return { product: best, score: bestScore, nearest: null }
}

/** vendor item number → product id, for every match a human has confirmed. */
async function learnedMatches(supplierId) {
  if (!supplierId) return new Map()

  if (isDemo) {
    const prefix = `${supplierId}:`
    const out = new Map()
    for (const [key, productId] of demoVendorMap) {
      if (key.startsWith(prefix)) out.set(key.slice(prefix.length), productId)
    }
    return out
  }

  const data = must(
    await supabase
      .from('vendor_item_map')
      .select('vendor_sku, product_id')
      .eq('supplier_id', supplierId),
    'read learned matches',
  )
  return new Map((data ?? []).map((r) => [String(r.vendor_sku).trim().toUpperCase(), r.product_id]))
}

/**
 * Match imported price-file rows against the catalog.
 *
 * Nothing is applied here — this only reports what *would* match, so the
 * import can be previewed and corrected before it changes a price the practice
 * sees. `options.supplierId` unlocks the learned matches for that vendor.
 */
export async function matchContractRows(rows, mapping, options = {}) {
  const supplierId = options.supplierId ?? null
  const [catalog, learned] = await Promise.all([loadCatalog(), learnedMatches(supplierId)])
  const indexes = buildIndexes(catalog)

  return rows.map((row, index) => {
    const gtin = mapping.gtin ? String(row[mapping.gtin] ?? '').replace(/\D/g, '') : ''
    const mfrSku = mapping.mfrSku ? String(row[mapping.mfrSku] ?? '').trim() : ''
    const description = mapping.description ? row[mapping.description] : ''
    const price = parseMoney(mapping.price ? row[mapping.price] : null)
    // 0 when the file has no usable pack column, so the catalog can answer
    // instead — see below.
    const filePackSize = parseInteger(mapping.packSize ? row[mapping.packSize] : null, 0)
    const vendorSku = mapping.vendorSku ? String(row[mapping.vendorSku] ?? '').trim() : ''

    let product = null
    let matchedBy = null
    let confidence = 0
    let nearest = null

    const learnedId = vendorSku ? learned.get(vendorSku.toUpperCase()) : null
    const learnedProduct = learnedId ? indexes.byId.get(learnedId) : null
    const byGtin = gtin ? indexes.gtins.get(gtinKey(gtin)) : null
    const byMpn = mfrSku ? indexes.mpns.get(mpnKey(mfrSku)) : null

    if (learnedProduct) {
      product = learnedProduct
      matchedBy = 'learned'
      confidence = 1
    } else if (byGtin) {
      product = byGtin
      matchedBy = 'gtin'
      confidence = 0.99
    } else if (byMpn) {
      product = byMpn
      matchedBy = 'mpn'
      confidence = 0.95
    } else if (description) {
      const hit = matchByDescription(description, indexes)
      if (hit.product) {
        product = hit.product
        matchedBy = 'name'
        confidence = Number(hit.score.toFixed(2))
      } else {
        nearest = hit.nearest
      }
    }

    return {
      index,
      gtin: gtin || null,
      mfrSku: mfrSku || null,
      vendorSku: vendorSku || null,
      description: description || product?.name || '—',
      price,
      // The file's pack size wins. Without one, the catalog's beats defaulting
      // to 1: pack size is a property of the item, and every per-unit price in
      // the app is this price divided by it — "$33.20 a cotton roll" would be
      // wrong on every screen that reads it.
      packSize: filePackSize || product?.packSize || 1,
      product,
      matchedBy,
      confidence,
      // A row with no price cannot be applied even if the product matched.
      usable: Boolean(product && price != null && price >= 0),
      issue:
        price == null
          ? 'No price found in the mapped column'
          : !product
            ? nearest
              ? `Nearest is ${nearest.name} — not certain enough to use`
              : 'No catalog product matched'
            : null,
    }
  })
}

/**
 * Remember that a vendor's catalog number is this product.
 *
 * Vendor item numbers are the vendor's own invention and nothing resolves them
 * from first principles. Once a person says which product it is, that is true
 * forever, so every later file from that vendor matches it instantly.
 */
export async function rememberVendorMatch({ supplierId, vendorSku, productId }) {
  if (!supplierId || !vendorSku || !productId) return { ok: true, remembered: false }

  if (isDemo) {
    demoVendorMap.set(mapKey(supplierId, vendorSku), productId)
    return { ok: true, remembered: true }
  }

  must(
    await supabase.from('vendor_item_map').upsert(
      {
        practice_id: await myPracticeId(),
        supplier_id: supplierId,
        vendor_sku: String(vendorSku).trim(),
        product_id: productId,
        confirmed_by: 'manual',
      },
      { onConflict: 'practice_id,supplier_id,vendor_sku' },
    ),
    'remember this match',
  )
  return { ok: true, remembered: true }
}

/**
 * Record the identity matches an import resolved on its own, so a vendor file
 * that only carries item numbers next time still lands.
 *
 * `ignoreDuplicates` on purpose: a row a human confirmed outranks anything the
 * importer worked out, and must not be overwritten by a later file.
 */
async function rememberConfidentMatches(supplierId, usable, practiceId) {
  const learnable = usable.filter(
    (row) => row.vendorSku && ['gtin', 'mpn', 'manual'].includes(row.matchedBy),
  )
  if (!learnable.length) return

  if (isDemo) {
    for (const row of learnable) {
      const key = mapKey(supplierId, row.vendorSku)
      if (!demoVendorMap.has(key)) demoVendorMap.set(key, row.product.id)
    }
    return
  }

  must(
    await supabase.from('vendor_item_map').upsert(
      learnable.map((row) => ({
        practice_id: practiceId,
        supplier_id: supplierId,
        vendor_sku: row.vendorSku,
        product_id: row.product.id,
        confirmed_by: 'auto',
      })),
      { onConflict: 'practice_id,supplier_id,vendor_sku', ignoreDuplicates: true },
    ),
    'remember what this import matched',
  )
}

/**
 * Apply matched rows as this practice's contracted pricing for one vendor.
 * `options.importId` links the prices back to the file they came from and
 * closes that file out of the inbox.
 */
export async function importContractPrices(supplierId, matched, options = {}) {
  const importId = options.importId ?? null
  const usable = matched.filter((m) => m.usable)

  if (isDemo) {
    for (const row of usable) {
      demoContracts.set(contractKey(supplierId, row.product.mfrSku), {
        price: cents(row.price),
        packSize: row.packSize || row.product.packSize,
        vendorSku: row.vendorSku,
        matchedBy: row.matchedBy,
        importedAt: new Date().toISOString(),
      })
    }
    await rememberConfidentMatches(supplierId, usable, null)

    const record = importId ? inbox().find((i) => i.id === importId) : null
    if (record) {
      record.status = 'applied'
      record.supplierId = supplierId
      record.appliedCount = usable.length
      record.appliedAt = new Date().toISOString()
    }
    emit()
    return { applied: usable.length, skipped: matched.length - usable.length }
  }

  const practiceId = await myPracticeId()
  // The identity index is expression-based (coalesce on gtin/mfr_sku), which
  // upsert's plain column list cannot target — Postgres rejects it with
  // 42P10. Replace today's sheet for this vendor instead: delete, then
  // insert fresh rows.
  const today = new Date().toISOString().slice(0, 10)
  must(
    await supabase
      .from('contract_prices')
      .delete()
      .eq('practice_id', practiceId)
      .eq('supplier_id', supplierId)
      .eq('effective_from', today),
    'clear the prices already loaded today',
  )
  must(
    await supabase.from('contract_prices').insert(
      usable.map((row) => ({
        practice_id: practiceId,
        supplier_id: supplierId,
        product_id: row.product.id,
        gtin: row.gtin,
        mfr_sku: row.mfrSku,
        vendor_sku: row.vendorSku,
        description: row.description,
        price: cents(row.price),
        pack_size: row.packSize,
        matched_by: row.matchedBy,
        source: 'csv',
        import_id: importId,
      })),
    ),
    'save contract prices',
  )

  await rememberConfidentMatches(supplierId, usable, practiceId)

  if (importId) {
    must(
      await supabase
        .from('price_imports')
        .update({
          status: 'applied',
          supplier_id: supplierId,
          applied_count: usable.length,
          applied_at: new Date().toISOString(),
        })
        .eq('id', importId),
      'close out the imported file',
    )
  }

  emit()
  return { applied: usable.length, skipped: matched.length - usable.length }
}

/** Which vendors have contracted pricing loaded, and how much of it. */
export async function contractPriceSummary() {
  if (isDemo) {
    const counts = new Map()
    for (const key of demoContracts.keys()) {
      const supplierId = key.split(':')[0]
      counts.set(supplierId, (counts.get(supplierId) ?? 0) + 1)
    }
    return [...counts.entries()].map(([supplierId, count]) => ({ supplierId, count }))
  }

  const { data } = await supabase.from('contract_prices').select('supplier_id')
  const counts = new Map()
  for (const row of data ?? []) {
    counts.set(row.supplier_id, (counts.get(row.supplier_id) ?? 0) + 1)
  }
  return [...counts.entries()].map(([supplierId, count]) => ({ supplierId, count }))
}

export async function clearContractPrices(supplierId) {
  if (isDemo) {
    for (const key of [...demoContracts.keys()]) {
      if (key.startsWith(`${supplierId}:`)) demoContracts.delete(key)
    }
    emit()
    return { ok: true }
  }
  const { error } = await supabase.from('contract_prices').delete().eq('supplier_id', supplierId)
  if (error) throw error
  emit()
  return { ok: true }
}

/**
 * Catalog search for the manual matcher — what a person picks from when a row
 * matched nothing.
 */
export async function searchCatalogForMatch(query) {
  // Word by word rather than as one phrase: the row being fixed reads
  // "Patient Bibs 2-Ply Lavender" and the catalog says "Patient Bibs, 3-Ply
  // Blue" — a substring search on the whole line finds nothing. Splitting also
  // strips the commas and parens that would otherwise break PostgREST's
  // comma-delimited or() filter.
  const terms = String(query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
    .slice(0, 4)

  if (isDemo) {
    const hits = PRODUCTS.filter((p) => {
      const hay = `${p.name} ${p.brand} ${p.sku} ${p.gtin}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
    return hits.slice(0, 25).map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      mfrSku: p.sku,
      gtin: p.gtin,
      packSize: p.packSize,
      unit: p.unit,
    }))
  }

  let q = supabase
    .from('products')
    .select('id, name, brand, mfr_sku, gtin, pack_size, unit')
    .order('name')
    .limit(25)
  // Repeated or() groups are ANDed by PostgREST, so every word has to land
  // somewhere on the row.
  for (const term of terms) {
    q = q.or(
      `name.ilike.%${term}%,brand.ilike.%${term}%,mfr_sku.ilike.%${term}%,gtin.ilike.%${term}%`,
    )
  }

  const data = must(await q, 'search the catalog')
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    mfrSku: p.mfr_sku,
    gtin: p.gtin,
    packSize: p.pack_size,
    unit: p.unit,
  }))
}

// --- the inbox --------------------------------------------------------------
function fromRow(row) {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    source: row.source,
    filename: row.filename,
    fromAddress: row.from_address,
    subject: row.subject,
    content: row.content ?? null,
    byteSize: Number(row.byte_size ?? 0),
    rowCount: row.row_count,
    status: row.status,
    appliedCount: row.applied_count,
    note: row.note,
    receivedAt: row.received_at,
    appliedAt: row.applied_at,
  }
}

/** Files waiting to be turned into prices, newest first. */
export async function listPriceImports({ status = 'pending' } = {}) {
  if (isDemo) {
    return inbox()
      .filter((i) => !status || i.status === status)
      .map((i) => ({ ...i }))
      .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
  }

  let q = supabase
    .from('price_imports')
    .select(
      'id, supplier_id, source, filename, from_address, subject, byte_size, row_count, status, applied_count, note, received_at, applied_at',
    )
    .order('received_at', { ascending: false })
    .limit(50)
  if (status) q = q.eq('status', status)

  const data = must(await q, 'read the price-file inbox')
  return (data ?? []).map(fromRow)
}

/** One file, with its contents — what the mapping step reads. */
export async function getPriceImport(id) {
  if (isDemo) {
    const found = inbox().find((i) => i.id === id)
    return found ? { ...found } : null
  }

  const data = must(
    await supabase.from('price_imports').select('*').eq('id', id).maybeSingle(),
    'open this price file',
  )
  return data ? fromRow(data) : null
}

/** Keep a file for later — dropped into the app, or pasted and not yet applied. */
export async function savePriceImport({
  supplierId = null,
  source = 'upload',
  filename = null,
  content,
  rowCount = null,
}) {
  const text = String(content ?? '')
  if (!text.trim()) throw new Error('Nothing to save — that file is empty')
  const rows = rowCount ?? parseCsv(text).rows.length

  if (isDemo) {
    const record = {
      id: `imp-${Math.random().toString(36).slice(2, 10)}`,
      supplierId,
      source,
      filename,
      fromAddress: null,
      subject: null,
      content: text,
      byteSize: text.length,
      rowCount: rows,
      status: 'pending',
      appliedCount: null,
      note: null,
      receivedAt: new Date().toISOString(),
      appliedAt: null,
    }
    inbox().unshift(record)
    emit()
    return { ...record }
  }

  const data = must(
    await supabase
      .from('price_imports')
      .insert({
        practice_id: await myPracticeId(),
        supplier_id: supplierId,
        source,
        filename,
        content: text,
        byte_size: text.length,
        row_count: rows,
        status: 'pending',
      })
      .select()
      .maybeSingle(),
    'save this price file',
  )
  emit()
  return fromRow(data)
}

/** Take a file out of the inbox without applying it. Nothing is deleted. */
export async function dismissPriceImport(id) {
  if (isDemo) {
    const record = inbox().find((i) => i.id === id)
    if (record) record.status = 'ignored'
    emit()
    return { ok: true }
  }

  must(
    await supabase.from('price_imports').update({ status: 'ignored' }).eq('id', id),
    'dismiss this price file',
  )
  emit()
  return { ok: true }
}

function randomToken() {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The practice's private forwarding address.
 *
 * A rep emails the price file to the office; forwarding it here is the whole
 * import. The token is random per practice, so the address cannot be worked
 * out from the practice name.
 */
export async function getImportAddress() {
  if (isDemo) {
    // An example, not a live mailbox: the demo practice has nothing to route
    // to, and an address that silently swallowed mail would be a lie.
    const token = 'a71f30c8e4b592'
    return { address: `prices+${token}@${IMPORT_DOMAIN}`, token, isExample: true }
  }

  const practiceId = await myPracticeId()
  const row = must(
    await supabase.from('practices').select('import_token').eq('id', practiceId).maybeSingle(),
    'read your import address',
  )

  let token = row?.import_token
  if (!token) {
    token = randomToken()
    must(
      await supabase.from('practices').update({ import_token: token }).eq('id', practiceId),
      'create your import address',
    )
  }

  return { address: `prices+${token}@${IMPORT_DOMAIN}`, token, isExample: false }
}
