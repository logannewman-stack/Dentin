# Vendor connectors

Each file here adapts one distributor to a single interface so
`/api/vendor-prices` can fan out across all of them and compare like for like.

## The interface

```js
export default {
  id: 'henry-schein',              // must match suppliers.slug
  label: 'Henry Schein',
  // Which identity keys this vendor can be searched by, best first.
  matchKeys: ['gtin', 'mpn', 'name'],
  configured() { /* → boolean: are credentials present? */ },
  async lookup({ gtin, mpn, brand, name, packSize }) {
    // → null when the vendor does not carry the product, otherwise:
    return {
      price,            // number, the vendor's price for one sellable pack
      packSize,         // units inside that pack, for per-unit normalization
      inStock,          // boolean
      leadDays,         // number
      vendorSku,        // the vendor's own item number
      matchedBy,        // 'gtin' | 'mpn' | 'name' — how it was resolved
      productUrl,       // deep link, when available
    }
  },
}
```

`matchedBy` is not decorative. A GTIN hit is the same physical product; an
`mpn` hit is the same manufacturer part; a `name` hit is a guess. The UI
labels each differently and never presents a `name` match as verified.

## Status of real integrations

**None of the major distributors are wired up here, and none can be without a
commercial agreement.** This is not an oversight — it is how the industry
works:

| Vendor | Route to live pricing | What it needs |
| --- | --- | --- |
| Henry Schein | eCommerce/punchout (cXML) | Supplier agreement, punchout credentials |
| Patterson | Punchout / EDI 832 price catalog | Trading-partner setup |
| Benco | Punchout, catalog feed | Account + integration request |
| Darby | Catalog feed / CSV price file | Account rep can enable |
| Net32 | No public partner API | Per-seller terms; scraping violates ToS |
| Dental City | Catalog feed | Account + request |
| Safco | Catalog feed | Account + request |

Practical order of attack for a real deployment:

1. **Ask your rep for a price file.** Most distributors will provide a
   contracted-price CSV/EDI 832 for your account. That is the real number —
   list pricing is not what an eight-figure practice pays.
2. **Punchout (cXML) for live carts** where offered. It authenticates as your
   account and returns your negotiated pricing.
3. **GS1/GDSN for identity.** Resolve barcodes to canonical products so
   vendor SKUs can be matched to each other at all.

Do not scrape. Beyond the terms-of-service exposure, scraped list pricing is
usually wrong for an account holder, which makes the comparison worse than
having none.

## Adding one

Drop a file in this directory exporting the shape above and add it to
`index.js`. `configured()` returning false makes the fan-out skip it cleanly,
so an unconfigured connector degrades to "not checked" rather than an error.
