import { json, userClient } from './_lib/supabase.js'

/**
 * GET /api/barcode-lookup?gtin=099999000010
 *
 * Resolves a scanned barcode to a catalog product and, when the practice
 * already tracks it, the matching inventory row. Logs the scan either way so
 * unmatched barcodes can be turned into catalog entries later.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })

  const gtin = String(req.query.gtin ?? '').trim()
  if (!/^\d{6,14}$/.test(gtin)) {
    return json(res, 400, { error: 'gtin must be 6-14 digits' })
  }

  try {
    const supabase = userClient(req)

    const { data, error } = await supabase.rpc('resolve_gtin', { p_gtin: gtin })
    if (error) return json(res, 400, { error: error.message })

    const row = data?.[0] ?? null

    // Best-effort telemetry; a failure here must not fail the lookup.
    const { data: profile } = await supabase.from('profiles').select('practice_id').single()
    if (profile?.practice_id) {
      await supabase.from('scan_events').insert({
        practice_id: profile.practice_id,
        gtin,
        product_id: row?.product_id ?? null,
        matched: Boolean(row),
      })
    }

    if (!row) return json(res, 404, { matched: false, gtin })

    return json(res, 200, {
      matched: true,
      gtin,
      product: {
        id: row.product_id,
        name: row.name,
        brand: row.brand,
        imageUrl: row.image_url,
        unit: row.unit,
        category: row.category_name,
      },
      inventory: row.in_inventory
        ? { id: row.inventory_item_id, onHand: Number(row.on_hand) }
        : null,
    })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
}
