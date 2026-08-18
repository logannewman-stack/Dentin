/**
 * The value ledger.
 *
 * Every renewal comes down to one question: is this worth $200 a month? The
 * ledger answers it with two kinds of number that are never added together:
 *
 *   found    — money Dentin put in front of the practice. A cheaper source, an
 *              overcharge on an invoice, a contract price above the market.
 *              Real, but hypothetical until somebody acts on it.
 *   captured — money that actually moved. An order placed at the cheaper
 *              price, an overcharge credited back.
 *
 * Claiming found money as saved money is how software earns a reputation for
 * lying, so this module keeps the two apart at every level: separate rows,
 * separate totals, separate series, separate words.
 *
 * Writes are conflict-ignoring against the natural key `ref`, because the
 * screen recomputes on every visit and would otherwise inflate the total each
 * time somebody opened it.
 */
import { cents, emit, isDemo, must, myPracticeId, supabase } from '../repoCore'
import { SUPPLIERS, productById } from '../demoData'

const DAY_MS = 86400000
const MONTH_MS = DAY_MS * 30.4375

/** List price per location, straight off the plan Stripe bills. */
const MONTHLY_PER_LOCATION = 200
const ANNUAL_PER_LOCATION = 2160

/**
 * A standing price gap is worth counting once a restock cycle, not once a page
 * view. Without this a practice that opens the screen daily would watch the
 * same $200 opportunity accrue to $6,000 a month, and a number nobody believes
 * is worse than no number at all.
 */
const FOUND_COOLDOWN_DAYS = 30

/**
 * Below this many billed months the ratio says more about the calendar than
 * about the product, so the screen is told to say "too early" instead.
 */
const EARLY_MONTHS = 2

const SOURCES = ['price_opportunity', 'order', 'invoice', 'benchmark', 'bulk']

/**
 * The practice's own calendar day. `toISOString().slice(0, 10)` rolls over at
 * 7pm in Austin, and a snapshot stamped with tomorrow's date is a second entry
 * for the same opportunity — precisely the double count `ref` exists to stop.
 */
function dayStamp(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`

/** First day of the window, `months` buckets back and inclusive of this month. */
function windowStartOf(months) {
  const start = new Date()
  start.setMonth(start.getMonth() - (months - 1), 1)
  start.setHours(0, 0, 0, 0)
  return start
}

// --- demo ledger --------------------------------------------------------------

/**
 * A furnished year for the demo practice. Ridgeline joined ten months ago and
 * has acted on about a third of what Dentin put in front of them, which is
 * what a real first year looks like — the gap between the two columns is the
 * point of the screen, so the demo has to have one.
 */
const DEMO_MONTHS = [
  { found: 980, captured: 180 },
  { found: 1120, captured: 240 },
  { found: 1040, captured: 310 },
  { found: 1310, captured: 420 },
  { found: 1180, captured: 380 },
  { found: 1420, captured: 520 },
  { found: 1260, captured: 460 },
  { found: 1390, captured: 540 },
  { found: 1450, captured: 590 },
  { found: 1330, captured: 480 },
]

const DEMO_FOUND_SKUS = [
  'MT-N-M',
  'STR-BLX-4010',
  '3M-FSU-A2B',
  'SEP-ART-100',
  'CTX-L3-EL',
  '3M-VAN-100',
  'MC-ND-856',
  'DEN-PV3-RF',
]
const DEMO_VENDORS = ['net32', 'darby', 'benco', 'dental-city']

let demoEvents = null
let demoJoinedAt = null

function demoLedger() {
  if (demoEvents) return demoEvents

  const rows = []
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() - (DEMO_MONTHS.length - 1), 1)
  demoJoinedAt = new Date(first.getFullYear(), first.getMonth(), 3).toISOString()

  DEMO_MONTHS.forEach((month, i) => {
    const at = new Date(first.getFullYear(), first.getMonth() + i, 1)
    const on = (day) => new Date(at.getFullYear(), at.getMonth(), day, 10, 0, 0)

    // Found splits across three SKUs — a price gap is never one item.
    const shares = [0.45, 0.33, 0.22]
    shares.forEach((share, j) => {
      const sku = DEMO_FOUND_SKUS[(i * 3 + j) % DEMO_FOUND_SKUS.length]
      const vendorId = DEMO_VENDORS[(i + j) % DEMO_VENDORS.length]
      const vendorName = SUPPLIERS.find((s) => s.id === vendorId)?.name ?? vendorId
      rows.push({
        kind: 'found',
        source: 'price_opportunity',
        productId: sku,
        supplierId: vendorId,
        orderId: null,
        amount: cents(month.found * share),
        detail: `${productById(sku)?.name ?? sku} cheaper at ${vendorName}`,
        ref: `product:${sku}:${dayStamp(on(4 + j))}`,
        occurredAt: on(4 + j).toISOString(),
      })
    })

    // Captured: an order placed at the better price, and every third month an
    // invoice overcharge that came back as a credit.
    const credited = i % 3 === 2
    const orderAmount = cents(month.captured * (credited ? 0.7 : 1))
    rows.push({
      kind: 'captured',
      source: 'order',
      productId: null,
      supplierId: DEMO_VENDORS[i % DEMO_VENDORS.length],
      orderId: `demo-ord-${i}`,
      amount: orderAmount,
      detail: 'Order placed below the highest in-stock offer',
      ref: `order:demo-ord-${i}`,
      occurredAt: on(12).toISOString(),
    })
    if (credited) {
      rows.push({
        kind: 'captured',
        source: 'invoice',
        productId: null,
        supplierId: DEMO_VENDORS[(i + 1) % DEMO_VENDORS.length],
        orderId: null,
        amount: cents(month.captured - orderAmount),
        detail: 'Invoice overcharge credited back',
        ref: `invoice-line:demo-inv-${i}`,
        occurredAt: on(19).toISOString(),
      })
    }
  })

  demoEvents = rows
  return demoEvents
}

/** Demo writes obey the same natural key the unique constraint enforces live. */
function demoInsert(rows) {
  const ledger = demoLedger()
  const seen = new Set(ledger.map((e) => `${e.kind}|${e.source}|${e.ref}`))
  let recorded = 0
  for (const row of rows) {
    const key = `${row.kind}|${row.source}|${row.ref}`
    if (seen.has(key)) continue
    seen.add(key)
    ledger.push({ ...row, occurredAt: row.occurredAt ?? new Date().toISOString() })
    recorded += 1
  }
  return recorded
}

// --- writes -------------------------------------------------------------------

/** Shape one entry into a `savings_events` row, or null if it is not worth one. */
function eventRow(entry, kind, practiceId) {
  const amount = cents(entry.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const ref = String(entry.ref ?? '').trim()
  if (!ref) return null
  const source = entry.source ?? (kind === 'captured' ? 'order' : 'price_opportunity')
  if (!SOURCES.includes(source)) {
    throw new Error(`Unknown savings source "${source}" — expected one of ${SOURCES.join(', ')}`)
  }
  return {
    practice_id: practiceId,
    kind,
    source,
    product_id: entry.productId ?? null,
    supplier_id: entry.supplierId ?? null,
    order_id: entry.orderId ?? null,
    amount,
    detail: entry.detail ?? null,
    ref,
    ...(entry.occurredAt ? { occurred_at: entry.occurredAt } : {}),
  }
}

/**
 * Write rows, ignoring anything already recorded.
 *
 * `.select()` after a conflict-ignoring upsert returns only the rows that were
 * genuinely new, which is how callers know whether anything actually moved.
 */
async function insertEvents(rows) {
  if (!rows.length) return 0
  const inserted = must(
    await supabase
      .from('savings_events')
      .upsert(rows, {
        onConflict: 'practice_id,kind,source,ref',
        ignoreDuplicates: true,
      })
      .select('id'),
    'record savings',
  )
  return inserted?.length ?? 0
}

/**
 * Money that actually moved on an order.
 *
 * Called when a draft is placed. Safe to call more than once for the same
 * order — the natural key is the order itself, so a retry, a double submit or
 * a replayed webhook all land on the same row.
 *
 * Returns quietly when there is nothing to record: an order that saved nothing
 * is noise in the ledger, not a record, and this must never be the reason an
 * order fails to go out.
 */
export async function recordCapturedSavings({
  orderId,
  amount,
  detail = 'Order placed below the highest in-stock offer',
  supplierId = null,
  occurredAt = null,
} = {}) {
  const value = cents(amount)
  if (!orderId || !Number.isFinite(value) || value <= 0) return { recorded: 0 }

  const entry = {
    source: 'order',
    amount: value,
    detail,
    supplierId,
    orderId,
    occurredAt,
    ref: `order:${orderId}`,
  }

  if (isDemo) {
    const recorded = demoInsert([{ ...entry, kind: 'captured', productId: null }])
    if (recorded) emit()
    return { recorded }
  }

  const row = eventRow(entry, 'captured', await myPracticeId())
  const recorded = await insertEvents(row ? [row] : [])
  if (recorded) emit()
  return { recorded }
}

/**
 * An overcharge the practice disputed and got back.
 *
 * Reconciliation calls this once a credit is confirmed — not when a
 * discrepancy is spotted, which is found money, not captured. Keyed on the
 * invoice line, so re-reconciling the same invoice cannot double it.
 */
export async function recordRecoveredOvercharge({
  invoiceId = null,
  lineId,
  amount,
  detail = 'Invoice overcharge credited back',
  supplierId = null,
  productId = null,
  occurredAt = null,
} = {}) {
  const value = cents(amount)
  if (!lineId || !Number.isFinite(value) || value <= 0) return { recorded: 0 }

  const entry = {
    source: 'invoice',
    amount: value,
    // The invoice id rides in the detail because the ledger has no column for
    // it; the line id alone is what keeps the entry unique.
    detail: invoiceId ? `${detail} · invoice ${invoiceId}` : detail,
    supplierId,
    productId,
    occurredAt,
    ref: `invoice-line:${lineId}`,
  }

  if (isDemo) {
    const recorded = demoInsert([{ ...entry, kind: 'captured', orderId: null }])
    if (recorded) emit()
    return { recorded }
  }

  const row = eventRow(entry, 'captured', await myPracticeId())
  const recorded = await insertEvents(row ? [row] : [])
  if (recorded) emit()
  return { recorded }
}

/**
 * Record a batch of opportunities as found.
 *
 * Each entry needs `{ amount, ref }` and may carry `{ source, detail,
 * productId, supplierId, orderId, occurredAt }`. Entries without a positive
 * amount or without a ref are dropped rather than written as zeroes.
 *
 * Deliberately quiet: this does not `emit()`. It is an accrual triggered by a
 * screen reading its own data, and waking every subscriber would send that
 * screen straight back around to accrue again.
 */
export async function recordFoundSavings(entries = []) {
  const list = Array.isArray(entries) ? entries : [entries]
  if (!list.length) return { recorded: 0 }

  if (isDemo) {
    const rows = []
    const seen = new Set()
    for (const entry of list) {
      const amount = cents(entry.amount)
      const ref = String(entry.ref ?? '').trim()
      if (!Number.isFinite(amount) || amount <= 0 || !ref || seen.has(ref)) continue
      seen.add(ref)
      rows.push({
        kind: 'found',
        source: entry.source ?? 'price_opportunity',
        productId: entry.productId ?? null,
        supplierId: entry.supplierId ?? null,
        orderId: entry.orderId ?? null,
        amount,
        detail: entry.detail ?? null,
        ref,
        occurredAt: entry.occurredAt ?? null,
      })
    }
    return { recorded: demoInsert(rows) }
  }

  const practiceId = await myPracticeId()
  const rows = []
  const seen = new Set()
  for (const entry of list) {
    const row = eventRow(entry, 'found', practiceId)
    if (!row) continue
    const key = `${row.source}|${row.ref}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(row)
  }
  return { recorded: await insertEvents(rows) }
}

/**
 * Record today's live price opportunities as found money.
 *
 * The opportunity rows are passed in rather than computed here. Importing
 * `repository.js` would close an import cycle, and recomputing the comparison
 * locally would fork the definition of the number — two places deciding what a
 * price gap is worth is how two screens end up disagreeing about money. The
 * caller already holds the rows it is about to draw, so it hands them over:
 *
 *   const opportunities = await getPriceOpportunities()
 *   await snapshotFoundSavings(opportunities)
 *
 * Accepts either the whole `getPriceOpportunities()` result or just its `rows`.
 */
export async function snapshotFoundSavings(opportunities) {
  const rows = Array.isArray(opportunities) ? opportunities : (opportunities?.rows ?? [])
  if (!rows.length) return { recorded: 0 }

  const today = dayStamp()
  const entries = rows
    .filter((r) => r.productId && Number(r.savingsPerOrder) > 0)
    .map((r) => ({
      source: 'price_opportunity',
      amount: r.savingsPerOrder,
      detail: `${r.productName} is ${Math.round(r.pctCheaper)}% cheaper at ${r.marketSupplierName}`,
      productId: r.productId,
      supplierId: r.marketSupplierId,
      // Per-day key: opening the screen twice before dinner cannot record the
      // same gap twice.
      ref: `product:${r.productId}:${today}`,
    }))
  if (!entries.length) return { recorded: 0 }

  const cooling = await recentlyFoundProducts()
  const fresh = entries.filter((e) => !cooling.has(e.productId))
  if (!fresh.length) return { recorded: 0 }

  return recordFoundSavings(fresh)
}

/**
 * Products already credited as found inside the cooldown. The per-day ref stops
 * a gap being counted twice in one afternoon; this stops the same gap being
 * counted thirty times in a month just because nobody acted on it.
 */
async function recentlyFoundProducts() {
  const since = new Date(Date.now() - FOUND_COOLDOWN_DAYS * DAY_MS).toISOString()

  if (isDemo) {
    return new Set(
      demoLedger()
        .filter(
          (e) =>
            e.kind === 'found' &&
            e.source === 'price_opportunity' &&
            e.productId &&
            e.occurredAt >= since,
        )
        .map((e) => e.productId),
    )
  }

  const rows = must(
    await supabase
      .from('savings_events')
      .select('product_id')
      .eq('kind', 'found')
      .eq('source', 'price_opportunity')
      .gte('occurred_at', since)
      .not('product_id', 'is', null),
    'read recent found savings',
  )
  return new Set((rows ?? []).map((r) => r.product_id))
}

// --- the summary --------------------------------------------------------------

/**
 * Which plan the practice is on, and what it costs a month.
 *
 * Stripe price ids are project-specific, so the browser has nothing to match
 * `price_id` against. The mirrored renewal date still gives the interval away
 * in the direction that matters: a monthly period never runs longer than a
 * month, so a renewal more than 45 days out can only be the annual plan.
 * Anything closer is priced at the monthly rate — the dearer of the two, so a
 * wrong call overstates what Dentin costs and understates the multiple. This
 * screen would rather be doubted than caught flattering itself.
 */
function planFor(sub) {
  if (!sub) return null
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null
  if (!end || Number.isNaN(end.getTime())) return null

  const interval = (end.getTime() - Date.now()) / DAY_MS > 45 ? 'year' : 'month'
  const quantity = Math.max(1, Math.round(Number(sub.quantity ?? 1)) || 1)
  const perLocationMonthly = interval === 'year' ? ANNUAL_PER_LOCATION / 12 : MONTHLY_PER_LOCATION

  // Billing starts when the trial ends; before that the practice has paid
  // nothing, however long they have been using the app.
  const trialEnd = sub.trialEnd ? new Date(sub.trialEnd) : null
  const created = sub.createdAt ? new Date(sub.createdAt) : null
  const billingStartedAt = trialEnd ?? created ?? null

  return {
    status: sub.status ?? null,
    interval,
    quantity,
    perLocationMonthly: cents(perLocationMonthly),
    monthlyCost: cents(perLocationMonthly * quantity),
    billingStartedAt:
      billingStartedAt && !Number.isNaN(billingStartedAt.getTime())
        ? billingStartedAt.toISOString()
        : null,
  }
}

function multipleWords(multiple) {
  return multiple >= 10
    ? `${Math.round(multiple)} times`
    : `${(Math.round(multiple * 10) / 10).toFixed(1)} times`
}

/**
 * Captured money against what Dentin cost over the same stretch.
 *
 * Cost is accrued at the plan rate rather than read off invoices — Stripe's
 * invoice history is not mirrored locally — so it is a run rate, not a receipt,
 * and the screen says so. Returns null when the plan cannot be established: a
 * comparison against a guessed price is worth less than no comparison.
 */
function compareToCost(plan, capturedInWindow, windowStart) {
  if (!plan) return null

  const start = plan.billingStartedAt ? new Date(plan.billingStartedAt) : null
  if (!start || Number.isNaN(start.getTime())) return null

  const from = start > windowStart ? start : windowStart
  const monthsBilled = Math.max(0, (Date.now() - from.getTime()) / MONTH_MS)
  const cost = cents(plan.monthlyCost * monthsBilled)
  const captured = cents(capturedInWindow)

  // A practice in its first weeks — or still inside the trial — has no ratio
  // worth quoting. Unless they are already ahead, in which case say so.
  if (cost <= 0 || (monthsBilled < EARLY_MONTHS && captured <= cost)) {
    return {
      cost,
      captured,
      monthsBilled,
      multiple: null,
      verdict: 'too-early',
      words:
        cost <= 0
          ? 'Nothing billed yet — the trial is still running.'
          : 'Too early to tell. Give it a full ordering cycle before judging the number.',
    }
  }

  const multiple = captured / cost
  return {
    cost,
    captured,
    monthsBilled,
    multiple,
    verdict: multiple >= 1 ? 'ahead' : 'behind',
    words:
      multiple < 1
        ? `Captured ${Math.round(multiple * 100)}% of what Dentin cost over the same period.`
        : // "1.0 times" is a strange thing to say out loud, and a hair over
          // breaking even is what it is.
          multiple < 1.1
          ? 'Captured about what Dentin cost over the same period.'
          : `Captured ${multipleWords(multiple)} what Dentin cost over the same period.`,
  }
}

/** Rank contributors by money, biggest first, with a share caption. */
function rank(map, limit = 6) {
  const rows = [...map.entries()]
    .map(([label, value]) => ({ label, value: cents(value) }))
    .sort((a, b) => b.value - a.value)
  const total = rows.reduce((s, r) => s + r.value, 0)
  return rows.slice(0, limit).map((r) => ({
    ...r,
    caption: total > 0 ? `${Math.round((r.value / total) * 100)}%` : '0%',
  }))
}

/**
 * Everything the value screen draws.
 *
 * `opportunities` is optional — pass the `getPriceOpportunities()` result and
 * the summary reports what is still on the table alongside what has been
 * banked. Without it `open` comes back null rather than guessed at.
 */
export async function getValueSummary({ months = 12, opportunities = null } = {}) {
  const windowStart = windowStartOf(months)

  let monthly
  let contributors
  let sinceDate
  let plan

  if (isDemo) {
    const ledger = demoLedger()
    monthly = ledger.map((e) => {
      const at = new Date(e.occurredAt)
      return { year: at.getFullYear(), month: at.getMonth(), kind: e.kind, amount: e.amount }
    })
    contributors = ledger
      .filter((e) => new Date(e.occurredAt) >= windowStart)
      .map((e) => ({
        kind: e.kind,
        amount: e.amount,
        label:
          e.kind === 'found'
            ? (productById(e.productId)?.name ?? e.detail ?? 'Price gap')
            : (SUPPLIERS.find((s) => s.id === e.supplierId)?.name ?? e.detail ?? 'Order'),
      }))
    sinceDate = demoJoinedAt
    // The demo practice is furnished as a paying customer on the annual plan.
    // Leaving it mid-trial would hide the comparison this screen exists for,
    // which is the one thing a visitor came to see.
    plan = {
      status: 'active',
      interval: 'year',
      quantity: 1,
      perLocationMonthly: cents(ANNUAL_PER_LOCATION / 12),
      monthlyCost: cents(ANNUAL_PER_LOCATION / 12),
      billingStartedAt: sinceDate,
    }
  } else {
    // The rollup view carries the whole history in a couple of rows a month, so
    // one read serves both the window and the lifetime totals.
    const rollup = must(
      await supabase.from('v_savings_monthly').select('month, kind, amount, events'),
      'read the value ledger',
    )
    monthly = (rollup ?? []).map((r) => {
      // 'YYYY-MM-DD' through `new Date()` parses as UTC midnight, which is the
      // previous month west of Greenwich. Split it instead.
      const [y, m] = String(r.month).split('-').map(Number)
      return { year: y, month: m - 1, kind: r.kind, amount: Number(r.amount ?? 0) }
    })

    const events = must(
      await supabase
        .from('savings_events')
        .select('kind, amount, detail, products(name), suppliers(name)')
        .gte('occurred_at', windowStart.toISOString())
        .order('amount', { ascending: false })
        .limit(500),
      'read savings contributors',
    )
    contributors = (events ?? []).map((e) => ({
      kind: e.kind,
      amount: Number(e.amount ?? 0),
      label:
        e.kind === 'found'
          ? (e.products?.name ?? e.detail ?? 'Price gap')
          : (e.suppliers?.name ?? e.detail ?? 'Order'),
    }))

    // maybeSingle: a user who has not finished setup gets null here, not a
    // thrown PGRST116.
    const practice = must(
      await supabase.from('practices').select('created_at').limit(1).maybeSingle(),
      'read the practice',
    )
    sinceDate = practice?.created_at ?? null

    const sub = must(
      await supabase
        .from('subscriptions')
        .select('status, quantity, current_period_end, trial_end, created_at')
        .maybeSingle(),
      'read the subscription',
    )
    plan = planFor(
      sub && {
        status: sub.status,
        quantity: sub.quantity,
        currentPeriodEnd: sub.current_period_end,
        trialEnd: sub.trial_end,
        createdAt: sub.created_at,
      },
    )
  }

  // Monthly series, oldest first, with every bucket present so the chart draws
  // an honest zero rather than skipping a quiet month.
  const buckets = new Map()
  for (let i = 0; i < months; i++) {
    const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1)
    const key = monthKey(d.getFullYear(), d.getMonth())
    buckets.set(key, {
      key,
      label: d.toLocaleString('en-US', { month: 'short' }),
      found: 0,
      captured: 0,
    })
  }

  const lifetime = { found: 0, captured: 0 }
  for (const row of monthly) {
    const amount = Number(row.amount ?? 0)
    if (row.kind === 'found') lifetime.found += amount
    else if (row.kind === 'captured') lifetime.captured += amount

    const bucket = buckets.get(monthKey(row.year, row.month))
    if (!bucket) continue
    if (row.kind === 'found') bucket.found += amount
    else if (row.kind === 'captured') bucket.captured += amount
  }

  const series = [...buckets.values()].map((b) => ({
    ...b,
    found: cents(b.found),
    captured: cents(b.captured),
  }))
  const foundWindow = cents(series.reduce((s, m) => s + m.found, 0))
  const capturedWindow = cents(series.reduce((s, m) => s + m.captured, 0))

  const foundBy = new Map()
  const capturedBy = new Map()
  for (const c of contributors) {
    const target = c.kind === 'found' ? foundBy : capturedBy
    target.set(c.label, (target.get(c.label) ?? 0) + c.amount)
  }

  const supplied = Array.isArray(opportunities) ? opportunities : (opportunities?.rows ?? null)
  // A row worth nothing is not an opportunity, whatever the caller counted.
  const openRows = supplied?.filter((r) => Number(r.savingsPerOrder ?? 0) > 0) ?? null

  return {
    months,
    sinceDate,
    windowStart: windowStart.toISOString(),
    found: { window: foundWindow, lifetime: cents(lifetime.found) },
    captured: { window: capturedWindow, lifetime: cents(lifetime.captured) },
    // Share of found money actually acted on. Null rather than zero when
    // nothing has been found — a rate needs a denominator.
    captureRate: foundWindow > 0 ? capturedWindow / foundWindow : null,
    series,
    topFound: rank(foundBy),
    topCaptured: rank(capturedBy),
    open: openRows
      ? {
          count: openRows.length,
          value: cents(openRows.reduce((s, r) => s + Number(r.savingsPerOrder ?? 0), 0)),
          rows: [...openRows].sort(
            (a, b) => Number(b.savingsPerOrder ?? 0) - Number(a.savingsPerOrder ?? 0),
          ),
        }
      : null,
    subscription: plan,
    comparison: compareToCost(plan, capturedWindow, windowStart),
  }
}
