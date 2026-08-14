import { json, userClient } from './_lib/supabase.js'

/**
 * GET /api/price-search?q=composite&limit=20
 *
 * Searches the catalog and returns each match with the cheapest in-stock
 * offer plus the spread across every supplier — the data behind "the price
 * beneath the rest".
 *
 * Runs as the caller so RLS keeps a practice's private catalog private.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })

  const q = String(req.query.q ?? '').trim()
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))

  if (q.length < 2) {
    return json(res, 400, { error: 'Query must be at least 2 characters' })
  }

  try {
    const supabase = userClient(req)

    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, brand, manufacturer, gtin, unit, pack_size, image_url, is_equipment')
      .or(`name.ilike.%${q}%,brand.ilike.%${q}%,manufacturer.ilike.%${q}%`)
      .limit(limit)

    if (error) return json(res, 400, { error: error.message })
    if (!products.length) return json(res, 200, { query: q, results: [] })

    const ids = products.map((p) => p.id)

    const [{ data: best }, { data: stats }] = await Promise.all([
      supabase.from('best_offers').select('*').in('product_id', ids),
      supabase.from('offer_stats').select('*').in('product_id', ids),
    ])

    const bestBy = Object.fromEntries((best ?? []).map((b) => [b.product_id, b]))
    const statsBy = Object.fromEntries((stats ?? []).map((s) => [s.product_id, s]))

    const results = products
      .map((p) => {
        const b = bestBy[p.id]
        const s = statsBy[p.id]
        return {
          productId: p.id,
          name: p.name,
          brand: p.brand,
          manufacturer: p.manufacturer,
          gtin: p.gtin,
          unit: p.unit,
          packSize: p.pack_size,
          imageUrl: p.image_url,
          isEquipment: p.is_equipment,
          best: b
            ? {
                supplierId: b.supplier_id,
                supplierName: b.supplier_name,
                price: Number(b.price),
                unitPrice: Number(b.unit_price),
                leadDays: b.lead_days,
                url: b.product_url,
              }
            : null,
          market: s
            ? {
                offerCount: Number(s.offer_count),
                minUnitPrice: Number(s.min_unit_price),
                maxUnitPrice: Number(s.max_unit_price),
                avgUnitPrice: Number(s.avg_unit_price),
                spreadPct:
                  Number(s.max_unit_price) > 0
                    ? Math.round(
                        ((Number(s.max_unit_price) - Number(s.min_unit_price)) /
                          Number(s.max_unit_price)) *
                          100,
                      )
                    : 0,
              }
            : null,
        }
      })
      // Surface the biggest savings opportunities first.
      .sort((a, b) => (b.market?.spreadPct ?? 0) - (a.market?.spreadPct ?? 0))

    return json(res, 200, { query: q, count: results.length, results })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
}
