import { adminClient } from '../supabase.js'

/**
 * Contract price connector.
 *
 * An eight-figure practice does not pay list. Every distributor it holds an
 * account with has agreed pricing, delivered as a contracted-price file
 * (CSV, or EDI 832) that a rep can turn on for the asking.
 *
 * Those rows live in `contract_prices` and win over anything scraped from a
 * public catalog, because they are the number that will actually appear on
 * the invoice. Rows carry an effective window so expired pricing is never
 * quoted as current.
 */
export default {
  id: 'contract-prices',
  label: 'Your contract pricing',
  matchKeys: ['gtin', 'mpn'],

  configured() {
    return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  },

  async lookup({ gtin, mpn, practiceId }) {
    if (!practiceId) return null
    if (!gtin && !mpn) return null

    const supabase = adminClient()
    const today = new Date().toISOString().slice(0, 10)

    let query = supabase
      .from('contract_prices')
      .select(
        'price, pack_size, vendor_sku, matched_by, effective_from, effective_to, suppliers(slug, name)',
      )
      .eq('practice_id', practiceId)
      .lte('effective_from', today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)

    query = gtin ? query.eq('gtin', gtin) : query.eq('mfr_sku', mpn)

    const { data, error } = await query
    if (error || !data?.length) return null

    return data.map((row) => ({
      vendorId: row.suppliers?.slug,
      vendorName: row.suppliers?.name,
      price: Number(row.price),
      packSize: row.pack_size,
      inStock: true, // contract pricing says nothing about stock
      leadDays: null,
      vendorSku: row.vendor_sku,
      matchedBy: row.matched_by ?? (gtin ? 'gtin' : 'mpn'),
      isContractPrice: true,
    }))
  },
}
