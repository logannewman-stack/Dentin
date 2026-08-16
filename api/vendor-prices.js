import { allConnectors, lookupEverywhere } from './_lib/connectors/index.js'
import { json, userClient } from './_lib/supabase.js'

/**
 * GET /api/vendor-prices?productId=…
 *     /api/vendor-prices?gtin=…&mpn=…&brand=…&name=…
 *
 * Price discovery for one exact product: resolves its identity keys, fans out
 * across every configured vendor connector, and returns each vendor's offer
 * normalized to a comparable per-unit price.
 *
 * Two things this deliberately reports rather than hides:
 *   - vendors that do not carry the product at all, because "nobody is
 *     cheaper" and "nobody else sells it" are different answers;
 *   - how each listing was matched (barcode / part number / name), because a
 *     name match is a guess and should not be priced against as if it were not.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })

  const { productId } = req.query
  let { gtin, mpn, brand, name, packSize } = req.query

  if (!productId && !gtin && !mpn && !name) {
    return json(res, 400, {
      error: 'Provide productId, or at least one of gtin / mpn / name',
    })
  }

  try {
    const supabase = userClient(req)

    // Scope contract pricing to the caller's practice — their own profile
    // row, not a teammate's (RLS exposes the whole practice's profiles, so an
    // unscoped .single() errors the moment a practice has two users).
    const { data: auth } = await supabase.auth.getUser()
    const { data: profile } = auth?.user
      ? await supabase
          .from('profiles')
          .select('practice_id')
          .eq('id', auth.user.id)
          .maybeSingle()
      : { data: null }
    const practiceId = profile?.practice_id ?? null

    // Fill in identity keys from the catalog when given a product id.
    if (productId) {
      const { data: product, error } = await supabase
        .from('products')
        .select('name, brand, gtin, mfr_sku, pack_size')
        .eq('id', productId)
        .single()
      if (error) return json(res, 404, { error: 'Product not found' })

      gtin ??= product.gtin
      mpn ??= product.mfr_sku
      brand ??= product.brand
      name ??= product.name
      packSize ??= product.pack_size
    }

    const identity = {
      gtin: gtin || null,
      mpn: mpn || null,
      brand: brand || null,
      name: name || null,
      packSize: packSize ? Number(packSize) : null,
      practiceId,
    }

    const runs = await lookupEverywhere(identity)

    // Flatten to one row per vendor, contract pricing winning over catalog.
    const byVendor = new Map()
    for (const run of runs) {
      for (const offer of run.results) {
        if (!offer?.vendorId) continue
        const existing = byVendor.get(offer.vendorId)
        // A contract price always beats a catalog price for the same vendor.
        if (existing && existing.isContractPrice && !offer.isContractPrice) continue
        byVendor.set(offer.vendorId, { ...offer, source: run.connector })
      }
    }

    const offers = [...byVendor.values()]
      .map((o) => ({
        ...o,
        unitPrice: o.packSize > 0 ? Number((o.price / o.packSize).toFixed(4)) : o.price,
      }))
      .sort((a, b) => {
        if (a.inStock !== b.inStock) return a.inStock ? -1 : 1
        return a.unitPrice - b.unitPrice
      })

    // Which vendors were checked but returned nothing.
    const { data: suppliers } = await supabase.from('suppliers').select('slug, name')
    const found = new Set(offers.map((o) => o.vendorId))
    const nonCarriers = (suppliers ?? [])
      .filter((s) => !found.has(s.slug))
      .map((s) => ({ vendorId: s.slug, vendorName: s.name, reason: 'Not listed' }))

    return json(res, 200, {
      identity: { gtin: identity.gtin, mpn: identity.mpn, brand: identity.brand, name: identity.name },
      offers,
      nonCarriers,
      best: offers.find((o) => o.inStock) ?? null,
      connectors: {
        // Surfaced so the client can say "3 of 5 sources checked" honestly.
        registered: allConnectors().map((c) => c.id),
        ran: runs.map((r) => ({
          id: r.connector,
          label: r.label,
          ms: r.ms,
          errored: Boolean(r.errored),
          error: r.error ?? null,
        })),
      },
      scannedAt: new Date().toISOString(),
    })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
}
