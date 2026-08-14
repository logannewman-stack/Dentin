import { differenceInDays, format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const usdPrecise = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

export function money(value) {
  const n = Number(value)
  return Number.isFinite(n) ? usd.format(n) : '—'
}

/**
 * Unit prices routinely land in fractions of a cent (a glove out of a box of
 * 200). Show the extra precision only when it actually carries information.
 */
export function unitMoney(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n < 1 ? usdPrecise.format(n) : usd.format(n)
}

export function qty(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

export function percent(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `${Math.round(n)}%` : '—'
}

function toDate(value) {
  if (!value) return null
  const d = typeof value === 'string' ? parseISO(value) : new Date(value)
  return isValid(d) ? d : null
}

export function shortDate(value) {
  const d = toDate(value)
  return d ? format(d, 'MMM d') : '—'
}

export function fullDate(value) {
  const d = toDate(value)
  return d ? format(d, 'MMM d, yyyy') : '—'
}

export function relativeTime(value) {
  const d = toDate(value)
  if (!d) return '—'
  return `${formatDistanceToNowStrict(d)} ago`
}

export function daysUntil(value) {
  const d = toDate(value)
  return d ? differenceInDays(d, new Date()) : null
}

/**
 * Cover is the number people actually reason about: "how long until we run
 * out at the rate we're using it".
 */
export function coverLabel(days) {
  if (days == null) return 'No burn data'
  if (days <= 0) return 'Out now'
  if (days === 1) return '1 day left'
  if (days < 14) return `${Math.round(days)} days left`
  if (days < 60) return `${Math.round(days / 7)} weeks left`
  return `${Math.round(days / 30)} months left`
}

/** Compact cover, for trailing slots where the product name needs the room. */
export function coverShort(days) {
  if (days == null) return '—'
  if (days <= 0) return 'Out'
  if (days < 14) return `${Math.round(days)}d`
  if (days < 60) return `${Math.round(days / 7)}w`
  return `${Math.round(days / 30)}mo`
}

export const STOCK_STATUS = {
  out: { label: 'Out of stock', tone: 'critical' },
  low: { label: 'Reorder now', tone: 'warning' },
  below_par: { label: 'Below par', tone: 'caution' },
  ok: { label: 'In stock', tone: 'good' },
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
