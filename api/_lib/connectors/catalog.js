import { adminClient } from '../supabase.js'

/**
 * Catalog connector.
 *
 * Reads the offers already stored in Supabase — whether those came from the
 * bundled seed or from a supplier catalog feed you imported. This is the
 * baseline every deployment has; live distributor connectors layer on top and
 * override it where they return a price.
 *
 * Matching is attempted strongest-key-first: barcode, then manufacturer part
 * number, then brand plus name. The key that succeeded is reported back so the
 * UI can say how sure it is.
 */
export default {
  id: 'catalog',
  label: 'Stored catalog',
  matchKeys: ['gtin', 'mpn', 'name'],

  configured() {
    return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  },

  async lookup({ gtin, mpn, brand, name, practiceId }) {
    const supabase = adminClient()

    // This runs with the service role (no RLS), so every match must be scoped
    // to the global catalog plus the caller's own practice — never another
    // practice's private products.
    const scoped = (q) =>
      practiceId
        ? q.or(`practice_id.is.null,practice_id.eq.${practiceId}`)
        : q.is('practice_id', null)
    // A GTIN or SKU can exist twice (global row + a practice's private copy).
    // Prefer the global row — that is where catalog offers attach.
    const preferGlobal = (q) =>
      q.order('practice_id', { ascending: true, nullsFirst: true }).limit(1)

    // Resolve the product identity, strongest key first.
    let product = null
    let matchedBy = null

    if (gtin) {
      const { data } = await preferGlobal(
        scoped(supabase.from('products').select('id, pack_size').eq('gtin', gtin)),
      )
      if (data?.length) {
        product = data[0]
        matchedBy = 'gtin'
      }
    }

    if (!product && mpn) {
      const { data } = await preferGlobal(
        scoped(supabase.from('products').select('id, pack_size').eq('mfr_sku', mpn)),
      )
      if (data?.length) {
        product = data[0]
        matchedBy = 'mpn'
      }
    }

    if (!product && name) {
      let q = scoped(supabase.from('products').select('id, pack_size').ilike('name', `%${name}%`))
      if (brand) q = q.ilike('brand', `%${brand}%`)
      const { data } = await preferGlobal(q)
      if (data?.length) {
        product = data[0]
        matchedBy = 'name'
      }
    }

    if (!product) return null

    const { data: offers } = await supabase
      .from('supplier_offers')
      .select('price, pack_size, in_stock, lead_days, supplier_sku, product_url, suppliers(slug, name)')
      .eq('product_id', product.id)

    if (!offers?.length) return null

    return offers.map((o) => ({
      vendorId: o.suppliers?.slug,
      vendorName: o.suppliers?.name,
      price: Number(o.price),
      packSize: o.pack_size,
      inStock: o.in_stock,
      leadDays: o.lead_days,
      vendorSku: o.supplier_sku,
      productUrl: o.product_url,
      matchedBy,
    }))
  },
}
