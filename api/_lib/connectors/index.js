import catalogConnector from './catalog.js'
import priceFileConnector from './priceFile.js'

/**
 * Registered vendor connectors.
 *
 * See ./README.md for the interface and for why no major distributor ships
 * wired up here — live pricing needs a commercial agreement per vendor.
 *
 * Order matters only for display; the fan-out runs them concurrently.
 */
const CONNECTORS = [
  // Your own negotiated price files, when present. Highest trust: these are
  // the prices the practice actually pays, not list.
  priceFileConnector,
  // Fallback: the offers stored in Supabase (seeded catalog or imported feed).
  catalogConnector,
]

export function activeConnectors() {
  return CONNECTORS.filter((c) => {
    try {
      return c.configured()
    } catch {
      return false
    }
  })
}

export function allConnectors() {
  return CONNECTORS
}

/**
 * Fan out across every configured connector for one product identity.
 *
 * A connector that throws or times out is reported as `errored` rather than
 * failing the whole scan — a buyer is better served by five of six prices
 * plus a note than by an error page.
 */
export async function lookupEverywhere(identity, { timeoutMs = 6000 } = {}) {
  const connectors = activeConnectors()

  const settled = await Promise.all(
    connectors.map(async (connector) => {
      const started = Date.now()
      try {
        const result = await Promise.race([
          connector.lookup(identity),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeoutMs),
          ),
        ])
        return {
          connector: connector.id,
          label: connector.label,
          ms: Date.now() - started,
          results: result ? (Array.isArray(result) ? result : [result]) : [],
          carried: Boolean(result),
        }
      } catch (e) {
        return {
          connector: connector.id,
          label: connector.label,
          ms: Date.now() - started,
          results: [],
          carried: false,
          errored: true,
          error: e.message,
        }
      }
    }),
  )

  return settled
}
