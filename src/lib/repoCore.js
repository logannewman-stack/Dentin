/**
 * The seam's foundations.
 *
 * `repository.js` is the module every screen talks to, and it grew large
 * enough that a second pair of hands could not touch it without colliding.
 * The pieces that everything else needs — which world we are in, who the
 * caller is, how a write announces itself — live here so a domain module
 * (`repo/invoices.js`, `repo/benchmarks.js`, …) can be written without
 * importing the whole seam and creating a cycle.
 *
 * Nothing in here knows about a screen, and nothing in here holds data.
 */
import { isSupabaseConfigured, supabase } from './supabase'

export { supabase, isSupabaseConfigured }

/**
 * Demo mode is either implicit (no Supabase project configured) or chosen —
 * a visitor tapping "See a demo practice" on the live site. The flag is read
 * once at module load, and entering or leaving the preview reloads the page,
 * so every screen agrees about which world it is in.
 */
export const DEMO_MODE_KEY = 'dentin:demo-mode'
export const isDemo =
  !isSupabaseConfigured ||
  (typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_MODE_KEY) === 'true')

const listeners = new Set()
const invalidators = new Set()

/**
 * Caches that a write can invalidate. Registered rather than hard-coded so a
 * module can keep its own cache without this file having to know about it.
 */
export function registerInvalidator(fn) {
  invalidators.add(fn)
  return () => invalidators.delete(fn)
}

/** Announce a local mutation: drop stale caches, then wake the screens. */
export function emit() {
  invalidators.forEach((fn) => fn())
  listeners.forEach((fn) => fn())
}

/** Subscribe to local mutations so screens re-read after a write. */
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * The signed-in user's practice. Throws rather than returning null: every
 * caller here is a write or a tenant-scoped read, and a silent null would
 * write a row belonging to nobody.
 */
export async function myPracticeId() {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) throw new Error('Sign in first')
  const { data, error } = await supabase
    .from('profiles')
    .select('practice_id')
    .eq('id', uid)
    .maybeSingle()
  if (error) throw error
  if (!data?.practice_id) throw new Error('Finish practice setup first')
  return data.practice_id
}

/**
 * supabase-js reports failures in `error` instead of throwing, so an
 * unchecked read quietly becomes "no rows" — which reads as good news on a
 * screen about money. Every query in a domain module goes through this.
 */
export function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

/** Round to cents without float dust ($10.005 → 10.01, not 10.004999…). */
export function cents(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}
