/**
 * Funnel instrumentation.
 *
 * Everything that happens before a Supabase row exists is otherwise invisible:
 * who landed, who opened the demo, who abandoned signup, who reached the card
 * screen and walked. Those are exactly the moments that decide whether this
 * business works, and none of them touch the database. These events close the
 * gap without adding a backend.
 *
 * Three rules keep this safe to ship:
 *
 *   1. No PII, ever. No email, practice name, address, or free text — only the
 *      small vocabulary of scalars declared at each call site. A funnel needs
 *      counts, not identities.
 *   2. Never throws. An ad blocker, a blocked script, or a browser with
 *      localStorage disabled must not be able to break a signup.
 *   3. Demo traffic is tagged, not dropped, so someone touring the mock
 *      practice never inflates real conversion.
 */
import { track as vercelTrack } from '@vercel/analytics'

const DEMO_MODE_KEY = 'dentin:demo-mode'

/** Matches AuthContext's PREVIEWING check — read live, since entering the
 *  demo reloads the page and this module survives that reload. */
function isDemoMode() {
  try {
    return localStorage.getItem(DEMO_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Record one funnel event.
 *
 * @param {string} event  Snake-case name from the funnel vocabulary below.
 * @param {Record<string, string|number|boolean>} [props] Scalars only, no PII.
 */
export function track(event, props = {}) {
  try {
    vercelTrack(event, isDemoMode() ? { ...props, demo: true } : props)
  } catch {
    // Instrumentation is never worth taking the app down for.
  }
}

/**
 * Record an event at most once per page load.
 *
 * Screen-viewed events live in effects, and <StrictMode> deliberately runs
 * effects twice in development — without this guard every local view would
 * double-count. Entering or leaving the demo reloads the page, which clears
 * this set, so a demo tour and a real visit stay separate.
 */
const fired = new Set()

export function trackOnce(event, props = {}) {
  if (fired.has(event)) return
  fired.add(event)
  track(event, props)
}
