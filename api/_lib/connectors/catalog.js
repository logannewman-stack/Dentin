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

  async lookup({ gtin, mpn, brand, name }) {
    const supabase = adminClient()

    // Resolve the product identity, strongest key first.
    let product = null
    let matchedBy = null

    if (gtin) {
      const { data } = await supabase
        .from('products')
        .select('id, pack_size')
        .eq('gtin', gtin)
        .maybeSingle()
      if (data) {
        product = data
        matchedBy = 'gtin'
      }
    }

    if (!product && mpn) {
      const { data } = await supabase
        .from('products')
        .select('id, pack_size')
        .eq('mfr_sku', mpn)
        .maybeSingle()
      if (data) {
        product = data
        matchedBy = 'mpn'
      }
    }

    if (!product && name) {
      let q = supabase.from('products').select('id, pack_size').ilike('name', `%${name}%`)
      if (brand) q = q.ilike('brand', `%${brand}%`)
      const { data } = await q.limit(1)
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
