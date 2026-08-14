/**
 * Demo practice.
 *
 * Dentin runs against Supabase when it is configured. Without it, the app
 * boots this practice so the whole experience — stock health, scanning,
 * price comparison, reordering — is explorable end to end.
 *
 * Product names and suppliers are real; barcodes and prices are illustrative.
 * The supplier spread is generated the same way `supabase/seed.sql` generates
 * it, so demo and live behave identically.
 */

export const SUPPLIERS = [
  {
    id: 'henry-schein',
    name: 'Henry Schein',
    margin: 1.11,
    leadDays: 2,
    freeShipOver: 250,
    shipFee: 12.95,
    website: 'henryschein.com',
    blurb: 'Full-service. Deepest equipment and service bench.',
    strengths: ['Equipment & service', 'Same-week delivery', 'Single rep for everything'],
  },
  {
    id: 'patterson',
    name: 'Patterson Dental',
    margin: 1.14,
    leadDays: 3,
    freeShipOver: 300,
    shipFee: 14.5,
    website: 'pattersondental.com',
    blurb: 'Strong CAD/CAM and technology service network.',
    strengths: ['CAD/CAM support', 'Technology service', 'Financing programs'],
  },
  {
    id: 'benco',
    name: 'Benco Dental',
    margin: 1.05,
    leadDays: 3,
    freeShipOver: 225,
    shipFee: 9.95,
    website: 'benco.com',
    blurb: 'Independent. Competitive on everyday consumables.',
    strengths: ['Consumable pricing', 'Independent ownership', 'Low free-ship bar'],
  },
  {
    id: 'darby',
    name: 'Darby Dental',
    margin: 0.98,
    leadDays: 3,
    freeShipOver: 150,
    shipFee: 7.95,
    website: 'darbydental.com',
    blurb: 'Consumables specialist with a low free-shipping threshold.',
    strengths: ['Consumables depth', '$150 free shipping', 'Fast reorder portal'],
  },
  {
    id: 'net32',
    name: 'Net32',
    margin: 0.88,
    leadDays: 5,
    freeShipOver: 0,
    shipFee: 6.5,
    website: 'net32.com',
    blurb: 'Marketplace of vetted sellers. Usually the floor on price.',
    strengths: ['Lowest unit pricing', 'No account minimums', 'Transparent seller ratings'],
    caveats: ['Longer lead times', 'No dedicated rep', 'Multiple sellers per order'],
  },
  {
    id: 'dental-city',
    name: 'Dental City',
    margin: 0.95,
    leadDays: 4,
    freeShipOver: 199,
    shipFee: 8.95,
    website: 'dentalcity.com',
    blurb: 'Solid mid-market pricing across most categories.',
    strengths: ['Mid-market pricing', 'Broad catalog', 'Simple account setup'],
    caveats: ['Thinner equipment range'],
  },
  {
    id: 'safco',
    name: 'Safco Dental',
    margin: 1.01,
    leadDays: 4,
    freeShipOver: 175,
    shipFee: 8.5,
    website: 'safcodental.com',
    blurb: 'Reliable generics and disposables.',
    strengths: ['Generic alternatives', 'Disposables depth'],
    caveats: ['Fewer brand-name lines'],
  },
]

/**
 * Accounts the practice already holds.
 *
 * The account/no-account split is the distinction that actually governs a
 * buying decision: an unbeatable price at a supplier you cannot order from
 * today is a project, not a saving. Suppliers missing from this list are
 * "new" — Dentin still prices them, but flags what opening the account costs.
 */
export const SUPPLIER_ACCOUNTS = [
  {
    supplierId: 'henry-schein',
    accountNumber: 'HS-4471902',
    repName: 'Marisol Ferrer',
    repPhone: '(800) 555-0112',
    repEmail: 'm.ferrer@henryschein.example',
    terms: 'Net 30',
    isPreferred: true,
    openedAt: '2019-03-14',
  },
  {
    supplierId: 'darby',
    accountNumber: 'DD-880431',
    repName: 'Trevor Lange',
    repPhone: '(800) 555-0177',
    repEmail: 't.lange@darbydental.example',
    terms: 'Net 30',
    isPreferred: true,
    openedAt: '2020-08-02',
  },
  {
    supplierId: 'benco',
    accountNumber: 'BN-22119',
    repName: 'Aisha Whitfield',
    repPhone: '(800) 555-0143',
    repEmail: 'a.whitfield@benco.example',
    terms: 'Net 15',
    isPreferred: false,
    openedAt: '2021-11-09',
  },
  {
    supplierId: 'patterson',
    accountNumber: 'PD-560218',
    repName: 'Dan Okafor',
    repPhone: '(800) 555-0198',
    repEmail: 'd.okafor@pattersondental.example',
    terms: 'Net 30',
    isPreferred: false,
    openedAt: '2018-06-21',
  },
]

export const CATEGORIES = [
  { slug: 'infection-control', name: 'Infection Control', tint: 'green' },
  { slug: 'restorative', name: 'Restorative', tint: 'blue' },
  { slug: 'preventive', name: 'Preventive', tint: 'teal' },
  { slug: 'endodontics', name: 'Endodontics', tint: 'purple' },
  { slug: 'oral-surgery', name: 'Oral Surgery', tint: 'red' },
  { slug: 'implants', name: 'Implants', tint: 'indigo' },
  { slug: 'orthodontics', name: 'Orthodontics', tint: 'pink' },
  { slug: 'impression-lab', name: 'Impression & Lab', tint: 'orange' },
  { slug: 'anesthetics', name: 'Anesthetics', tint: 'red' },
  { slug: 'rotary-burs', name: 'Rotary & Burs', tint: 'gray' },
  { slug: 'imaging', name: 'Imaging', tint: 'blue' },
  { slug: 'whitening', name: 'Whitening', tint: 'yellow' },
  { slug: 'disposables', name: 'Disposables', tint: 'gray' },
  { slug: 'equipment', name: 'Equipment', tint: 'brand' },
]

/**
 * [sku, name, brand, category, gtin, unit, packSize, basePrice, isEquipment]
 */
const CATALOG = [
  ['MT-N-M', 'Micro-Touch Nitrile Exam Gloves, Medium', 'Ansell', 'infection-control', '099999000010', 'box of 200', 200, 28.99, false],
  ['MT-N-L', 'Micro-Touch Nitrile Exam Gloves, Large', 'Ansell', 'infection-control', '099999000027', 'box of 200', 200, 28.99, false],
  ['CTX-L3-EL', 'Level 3 Procedure Masks, Earloop', 'Crosstex', 'infection-control', '099999000034', 'box of 50', 50, 24.5, false],
  ['MTX-CW-160', 'CaviWipes Disinfectant Towelettes', 'Metrex', 'infection-control', '099999000041', 'canister of 160', 160, 21.75, false],
  ['HAL-SP-35', 'Sterilization Pouches, 3.5" x 9"', 'Halyard', 'infection-control', '099999000065', 'box of 200', 200, 18.9, false],
  ['3M-AT-1262', 'Attest Biological Spore Tests', '3M', 'infection-control', '099999000089', 'box of 25', 25, 68.5, false],
  ['3M-FSU-A2B', 'Filtek Supreme Ultra, A2 Body', '3M', 'restorative', '099999000102', 'syringe of 20', 20, 92.0, false],
  ['3M-FSU-A3B', 'Filtek Supreme Ultra, A3 Body', '3M', 'restorative', '099999000119', 'syringe of 20', 20, 92.0, false],
  ['3M-SBU-5', 'Scotchbond Universal Plus Adhesive', '3M', 'restorative', '099999000126', '5 mL bottle', 1, 148.0, false],
  ['ULT-UE-KIT', 'Ultra-Etch 35% Etchant Kit', 'Ultradent', 'restorative', '099999000133', 'kit of 20', 20, 64.0, false],
  ['GC-F9-A2', 'Fuji IX GP Capsules, A2', 'GC America', 'restorative', '099999000164', 'box of 50', 50, 138.0, false],
  ['DEN-PV3-RF', 'Palodent V3 Sectional Matrix Refill', 'Dentsply Sirona', 'restorative', '099999000171', 'box of 100', 100, 176.0, false],
  ['3M-VAN-100', 'Vanish 5% Fluoride Varnish', '3M', 'preventive', '099999000218', 'box of 100', 100, 264.0, false],
  ['DEN-NP-MM', 'Nupro Prophy Paste, Medium Mint', 'Dentsply Sirona', 'preventive', '099999000225', 'box of 200', 200, 46.0, false],
  ['YNG-PA-SC', 'Disposable Prophy Angles, Soft Cup', 'Young Dental', 'preventive', '099999000232', 'box of 100', 100, 32.5, false],
  ['3M-CPS-LC', 'Clinpro Sealant, Light Cure', '3M', 'preventive', '099999000249', 'syringe of 4', 4, 78.0, false],
  ['DEN-PTG-25', 'ProTaper Gold Rotary Files, 25mm', 'Dentsply Sirona', 'endodontics', '099999000263', 'pack of 6', 6, 121.0, false],
  ['COL-GP-F2', 'Gutta Percha Points, F2', 'Coltene', 'endodontics', '099999000270', 'box of 60', 60, 38.0, false],
  ['VST-CX-16', 'Chlor-XTRA Sodium Hypochlorite 6%', 'Vista Apex', 'endodontics', '099999000300', '16 oz bottle', 1, 24.0, false],
  ['ETH-CG-40', 'Chromic Gut Suture 4-0', 'Ethicon', 'oral-surgery', '099999000324', 'box of 12', 12, 78.0, false],
  ['ASP-BP-15', 'Scalpel Blades #15, Sterile', 'Aspen Surgical', 'oral-surgery', '099999000348', 'box of 100', 100, 28.0, false],
  ['STR-BLX-4010', 'BLX Implant, SLActive 4.0 x 10mm', 'Straumann', 'implants', '099999000379', 'each', 1, 412.0, false],
  ['STR-HA-4505', 'Healing Abutment 4.5 x 5mm', 'Straumann', 'implants', '099999000393', 'each', 1, 96.0, false],
  ['DEN-AQ-HB', 'Aquasil Ultra+ Heavy Body VPS', 'Dentsply Sirona', 'impression-lab', '099999000447', 'box of 4', 4, 118.0, false],
  ['DEN-JP-FS', 'Jeltrate Plus Alginate, Fast Set', 'Dentsply Sirona', 'impression-lab', '099999000461', '1 lb pouch', 1, 18.75, false],
  ['SEP-ART-100', 'Septocaine Articaine 4% w/ Epi', 'Septodont', 'anesthetics', '099999000492', 'box of 50', 50, 132.0, false],
  ['SEP-LID-100', 'Lidocaine 2% w/ Epi 1:100,000', 'Cook-Waite', 'anesthetics', '099999000508', 'box of 50', 50, 78.0, false],
  ['CAR-MN-27L', 'Dental Needles 27G Long', 'Cardinal Health', 'anesthetics', '099999000515', 'box of 100', 100, 32.0, false],
  ['MC-ND-856', 'NeoDiamond Coarse Taper, Sterile', 'Microcopy', 'rotary-burs', '099999000539', 'box of 25', 25, 42.0, false],
  ['SSW-245', 'Carbide Bur FG #245', 'SS White', 'rotary-burs', '099999000546', 'pack of 10', 10, 21.0, false],
  ['CTX-SB-2', 'Sensor Barrier Sleeves, Size 2', 'Crosstex', 'imaging', '099999000577', 'box of 500', 500, 46.0, false],
  ['ULT-OP-20M', 'Opalescence PF 20% Take-Home', 'Ultradent', 'whitening', '099999000607', 'patient kit', 1, 24.5, false],
  ['CTX-BIB-BL', 'Patient Bibs, 3-Ply Blue', 'Crosstex', 'disposables', '099999000621', 'case of 500', 500, 42.0, false],
  ['CAR-SE-CL', 'Saliva Ejectors, Clear', 'Cardinal Health', 'disposables', '099999000638', 'bag of 100', 100, 12.4, false],
  ['RIC-CR-2', 'Cotton Rolls #2 Medium', 'Richmond Dental', 'disposables', '099999000645', 'box of 2000', 2000, 38.0, false],
  ['DUK-GZ-22', 'Gauze Sponges 2x2, 8-Ply', 'Dukal', 'disposables', '099999000652', 'box of 5000', 5000, 46.0, false],
  ['ULT-VG-CL', 'VALO Grand Cordless Curing Light', 'Ultradent', 'equipment', '099999000713', 'each', 1, 1180.0, true],
  ['MID-M11', 'M11 UltraClave Sterilizer', 'Midmark', 'equipment', '099999000676', 'each', 1, 6890.0, true],
]

/** Deterministic 32-bit hash — mirrors the jitter in seed.sql. */
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/**
 * Catalog coverage.
 *
 * No distributor carries everything. Full-line houses stock capital equipment
 * and implant systems; consumable specialists and marketplaces do not. Getting
 * this wrong is what makes a price comparison lie — quoting a chair from a
 * vendor who has never sold one.
 *
 * `excludes` are whole categories the vendor does not trade in. `gapRate` is
 * the share of individual SKUs they happen not to stock inside categories they
 * do cover, applied deterministically per SKU so results never flicker.
 */
const VENDOR_COVERAGE = {
  'henry-schein': { excludes: [], gapRate: 0.04 },
  patterson: { excludes: [], gapRate: 0.06 },
  benco: { excludes: [], gapRate: 0.1 },
  darby: { excludes: ['equipment', 'implants'], gapRate: 0.12 },
  net32: { excludes: ['equipment'], gapRate: 0.14 },
  'dental-city': { excludes: ['equipment', 'implants', 'orthodontics'], gapRate: 0.18 },
  safco: { excludes: ['equipment', 'implants', 'imaging'], gapRate: 0.22 },
}

/**
 * How a vendor's listing was matched back to the manufacturer's product.
 *
 * Full-line distributors publish GS1 barcodes, so those match exactly.
 * Marketplaces usually publish only a manufacturer part number, and the long
 * tail is matched on brand plus normalized name and pack size — which is a
 * guess, and is labelled as one in the UI.
 */
const MATCH_STRATEGY = {
  'henry-schein': 'gtin',
  patterson: 'gtin',
  benco: 'gtin',
  darby: 'mpn',
  net32: 'mpn',
  'dental-city': 'mpn',
  safco: 'name',
}

export const MATCH_CONFIDENCE = {
  gtin: {
    label: 'Barcode match',
    detail: 'Vendor lists the same GS1 barcode',
    rank: 0,
    verified: true,
  },
  mpn: {
    label: 'Part number match',
    detail: 'Same manufacturer part number and brand',
    rank: 1,
    verified: true,
  },
  name: {
    label: 'Likely match',
    detail: 'Matched on brand, description and pack size — worth verifying',
    rank: 2,
    verified: false,
  },
}

/** Does this vendor trade in this product at all? */
export function carriesProduct(vendorId, product) {
  const coverage = VENDOR_COVERAGE[vendorId]
  if (!coverage || !product) return false
  if (coverage.excludes.includes(product.category)) return false
  // Deterministic per-SKU gap, stable across renders.
  return (hash(`${vendorId}:${product.sku}`) % 100) / 100 >= coverage.gapRate
}

/** The vendor's own SKU for a product — every distributor renumbers. */
export function vendorSkuFor(vendorId, product) {
  const prefix = vendorId.slice(0, 3).toUpperCase()
  return `${prefix}-${(hash(vendorId + product.sku) % 900000) + 100000}`
}

export const PRODUCTS = CATALOG.map(
  ([sku, name, brand, category, gtin, unit, packSize, basePrice, isEquipment]) => ({
    id: sku,
    sku,
    name,
    brand,
    category,
    gtin,
    unit,
    packSize,
    basePrice,
    isEquipment,
  }),
)

const PRODUCT_BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]))
const PRODUCT_BY_GTIN = new Map(PRODUCTS.map((p) => [p.gtin, p]))

export function productById(id) {
  return PRODUCT_BY_ID.get(id) ?? null
}

export function productByGtin(gtin) {
  return PRODUCT_BY_GTIN.get(String(gtin).trim()) ?? null
}

/**
 * Every vendor's offer on one exact product, cheapest first.
 *
 * Only vendors that actually carry the item appear. Each offer records how it
 * was matched back to the manufacturer's product, so the UI can distinguish a
 * barcode-verified listing from a probable one.
 */
export function offersFor(productId) {
  const product = PRODUCT_BY_ID.get(productId)
  if (!product) return []

  const offers = SUPPLIERS.filter((s) => carriesProduct(s.id, product)).map((s) => {
    const jitter = (hash(product.sku + s.id) % 90) / 1000 - 0.045
    const price = Number((product.basePrice * s.margin * (1 + jitter)).toFixed(2))
    const matchedBy = MATCH_STRATEGY[s.id] ?? 'name'

    return {
      supplierId: s.id,
      supplierName: s.name,
      price,
      packSize: product.packSize,
      unitPrice: price / product.packSize,
      inStock: hash(s.id + product.sku) % 12 !== 0,
      leadDays: Math.max(1, s.leadDays + ((hash(product.sku + s.id) % 3) - 1)),
      shipFee: s.shipFee,
      freeShipOver: s.freeShipOver,
      vendorSku: vendorSkuFor(s.id, product),
      matchedBy,
      matchVerified: MATCH_CONFIDENCE[matchedBy].verified,
    }
  })

  return offers.sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1
    if (a.unitPrice !== b.unitPrice) return a.unitPrice - b.unitPrice
    return a.leadDays - b.leadDays
  })
}

/** Vendors that do not list this product, and why — shown so the scan is honest. */
export function nonCarriersFor(productId) {
  const product = PRODUCT_BY_ID.get(productId)
  if (!product) return []

  return SUPPLIERS.filter((s) => !carriesProduct(s.id, product)).map((s) => {
    const coverage = VENDOR_COVERAGE[s.id]
    const categoryExcluded = coverage?.excludes.includes(product.category)
    return {
      supplierId: s.id,
      supplierName: s.name,
      reason: categoryExcluded
        ? `Does not carry ${CATEGORIES.find((c) => c.slug === product.category)?.name ?? 'this category'}`
        : 'Not listed in their catalog',
    }
  })
}

export const LOCATIONS = [
  { id: 'loc-main', name: 'Ridgeline Dental — Main', operatories: 8, isPrimary: true },
  { id: 'loc-north', name: 'Ridgeline Dental — North', operatories: 4, isPrimary: false },
]

export const PRACTICE = {
  id: 'demo-practice',
  name: 'Ridgeline Dental Studio',
  legalName: 'Ridgeline Dental Studio, PLLC',
  phone: '(512) 555-0148',
  email: 'ops@ridgelinedental.com',
  address1: '4820 Bee Cave Road',
  address2: 'Suite 210',
  city: 'Austin',
  region: 'TX',
  postalCode: '78746',
  country: 'US',
  timezone: 'America/Chicago',
  // Drives the supply-spend benchmark band.
  practiceType: 'general',
  // Collections is the denominator the industry benchmarks against. Set so the
  // demo practice lands where the published average actually sits — a shade
  // over 7% against a 5–7% band, which is the case worth showing.
  collectionsPerMonth: 107500,
  orderCadence: 'biweekly',
  lastOrderedAt: null,
  pmsName: 'Open Dental',
  pmsConnected: false,
}

/**
 * Completed procedures, as a PMS would report them.
 *
 * Shape mirrors what Open Dental's `procedurelogs` endpoint returns for
 * completed work — code, date, surfaces, tooth, provider, units — so the
 * consumption engine reads the same fields whether it is fed by the demo or
 * by a live feed.
 */
const PROCEDURE_MIX = [
  ['D1110', 42, null],
  ['D0120', 38, null],
  ['D4910', 14, null],
  ['D2392', 12, 'MO'],
  ['D2391', 9, 'O'],
  ['D0274', 22, null],
  ['D2393', 7, 'MOD'],
  ['D1206', 16, null],
  ['D2740', 6, null],
  ['D4341', 8, null],
  ['D1351', 11, null],
  ['D3330', 3, null],
  ['D7140', 5, null],
  ['D2950', 4, null],
  ['D3310', 2, null],
  ['D2394', 3, 'MODBL'],
  ['D7210', 2, null],
  ['D6010', 2, null],
  ['D9944', 3, null],
  ['D1120', 9, null],
]

export function buildProcedureLog() {
  const rows = []
  let n = 0

  for (const [code, count, surf] of PROCEDURE_MIX) {
    for (let i = 0; i < count; i += 1) {
      const s = hash(`${code}:${i}`)
      const provider = TEAM[s % 2 === 0 ? 0 : 3] // the two doctors
      rows.push({
        id: `proc-${n++}`,
        code,
        surfaces: surf,
        toothNumber: surf ? 3 + (s % 28) : null,
        units: 1,
        providerId: provider.id,
        providerName: provider.name,
        completedAt: new Date(Date.now() - (1 + (s % 27)) * 86400000).toISOString(),
      })
    }
  }

  return rows.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
}

/**
 * [sku, onHand, par, reorderPoint, reorderQty, dailyBurn, bin, locationId]
 * Stock states are deliberately mixed so every dashboard state is reachable.
 */
const STOCK = [
  // --- short right now (what the dashboard should lead with) ---
  ['3M-FSU-A2B', 0, 6, 2, 4, 0.14, 'Op 3 — Drawer 2', 'loc-main'],
  ['CTX-SB-2', 0, 4, 1, 3, 0.06, 'Imaging station', 'loc-main'],
  ['MT-N-M', 4, 14, 5, 10, 0.62, 'Sterile A — Shelf 1', 'loc-main'],
  ['CTX-L3-EL', 3, 10, 3, 8, 0.35, 'Sterile A — Shelf 2', 'loc-main'],
  ['SEP-ART-100', 2, 6, 2, 4, 0.18, 'Anesthetic drawer', 'loc-main'],
  ['3M-AT-1262', 1, 3, 1, 2, 0.03, 'Sterile B — Log drawer', 'loc-main'],
  // --- below par but not yet at the reorder point ---
  ['YNG-PA-SC', 7, 10, 4, 8, 0.33, 'Hygiene 1 — Drawer 1', 'loc-main'],
  ['DEN-PTG-25', 3, 5, 2, 3, 0.06, 'Endo tray station', 'loc-main'],
  ['CAR-MN-27L', 5, 8, 3, 5, 0.19, 'Anesthetic drawer', 'loc-main'],
  ['DEN-AQ-HB', 4, 5, 2, 3, 0.07, 'Lab bench', 'loc-main'],
  // --- healthy ---
  ['MT-N-L', 13, 12, 4, 8, 0.41, 'Sterile A — Shelf 1', 'loc-main'],
  ['MTX-CW-160', 11, 10, 4, 6, 0.28, 'Op supply cart', 'loc-main'],
  ['HAL-SP-35', 9, 8, 3, 6, 0.22, 'Sterile B', 'loc-main'],
  ['3M-FSU-A3B', 7, 6, 2, 4, 0.11, 'Op 3 — Drawer 2', 'loc-main'],
  ['3M-SBU-5', 4, 4, 2, 3, 0.06, 'Op 3 — Drawer 2', 'loc-main'],
  ['ULT-UE-KIT', 6, 5, 2, 3, 0.07, 'Op 3 — Drawer 1', 'loc-main'],
  ['GC-F9-A2', 5, 4, 1, 2, 0.04, 'Restorative cabinet', 'loc-main'],
  ['DEN-PV3-RF', 3, 3, 1, 2, 0.05, 'Restorative cabinet', 'loc-main'],
  ['3M-VAN-100', 5, 4, 1, 3, 0.09, 'Hygiene 1 — Drawer 3', 'loc-main'],
  ['DEN-NP-MM', 9, 8, 3, 5, 0.24, 'Hygiene 1 — Drawer 1', 'loc-main'],
  ['3M-CPS-LC', 7, 6, 2, 4, 0.08, 'Hygiene 2', 'loc-main'],
  ['COL-GP-F2', 8, 6, 2, 3, 0.05, 'Endo tray station', 'loc-main'],
  ['VST-CX-16', 7, 6, 2, 4, 0.12, 'Endo tray station', 'loc-main'],
  ['ETH-CG-40', 6, 5, 2, 3, 0.04, 'Surgical cabinet', 'loc-main'],
  ['ASP-BP-15', 5, 4, 2, 2, 0.05, 'Surgical cabinet', 'loc-main'],
  ['STR-BLX-4010', 11, 10, 4, 5, 0.09, 'Implant safe', 'loc-main'],
  ['STR-HA-4505', 14, 12, 5, 6, 0.08, 'Implant safe', 'loc-main'],
  ['DEN-JP-FS', 9, 8, 3, 5, 0.16, 'Lab bench', 'loc-main'],
  ['SEP-LID-100', 7, 6, 2, 4, 0.15, 'Anesthetic drawer', 'loc-main'],
  ['MC-ND-856', 12, 10, 4, 6, 0.27, 'Op supply cart', 'loc-main'],
  ['SSW-245', 9, 8, 3, 5, 0.21, 'Op supply cart', 'loc-main'],
  ['ULT-OP-20M', 16, 15, 6, 10, 0.31, 'Front desk retail', 'loc-main'],
  ['CTX-BIB-BL', 7, 6, 2, 4, 0.13, 'Central supply', 'loc-main'],
  ['CAR-SE-CL', 14, 12, 5, 8, 0.42, 'Central supply', 'loc-main'],
  ['RIC-CR-2', 4, 4, 1, 2, 0.05, 'Central supply', 'loc-main'],
  ['DUK-GZ-22', 6, 5, 2, 3, 0.08, 'Central supply', 'loc-main'],
  ['ULT-VG-CL', 5, 5, 2, 2, 0.0, 'Op equipment', 'loc-main'],
  // --- second location ---
  ['MT-N-M', 4, 10, 4, 8, 0.38, 'Sterile — Shelf 1', 'loc-north'],
  ['DEN-NP-MM', 5, 6, 2, 4, 0.17, 'Hygiene 1', 'loc-north'],
  ['CTX-L3-EL', 9, 8, 3, 6, 0.22, 'Sterile — Shelf 1', 'loc-north'],
  ['SEP-LID-100', 6, 5, 2, 3, 0.11, 'Anesthetic drawer', 'loc-north'],
  ['CAR-SE-CL', 11, 10, 4, 6, 0.29, 'Central supply', 'loc-north'],
]

function daysFromNow(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

export function buildInventory() {
  return STOCK.map(([sku, onHand, par, reorderPoint, reorderQty, dailyBurn, bin, locationId], i) => {
    const product = PRODUCT_BY_ID.get(sku)
    const best = offersFor(sku).find((o) => o.inStock) ?? null
    const inStockOffers = offersFor(sku).filter((o) => o.inStock)
    const worst = inStockOffers.length
      ? inStockOffers[inStockOffers.length - 1]
      : null

    const stockStatus =
      onHand <= 0 ? 'out' : onHand <= reorderPoint ? 'low' : onHand < par ? 'below_par' : 'ok'

    return {
      id: `inv-${locationId}-${sku}`,
      productId: sku,
      locationId,
      locationName: LOCATIONS.find((l) => l.id === locationId)?.name ?? '',
      productName: product.name,
      brand: product.brand,
      unit: product.unit,
      gtin: product.gtin,
      categorySlug: product.category,
      categoryName: CATEGORIES.find((c) => c.slug === product.category)?.name ?? '',
      isEquipment: product.isEquipment,
      onHand,
      parLevel: par,
      reorderPoint,
      reorderQty,
      bin,
      dailyBurn,
      stockStatus,
      pctOfPar: par > 0 ? Math.round((onHand / par) * 100) : null,
      daysOfCover: dailyBurn > 0 ? Math.round(onHand / dailyBurn) : null,
      bestUnitPrice: best?.unitPrice ?? null,
      bestPrice: best?.price ?? null,
      bestSupplierId: best?.supplierId ?? null,
      bestSupplierName: best?.supplierName ?? null,
      bestLeadDays: best?.leadDays ?? null,
      maxUnitPrice: worst?.unitPrice ?? null,
      offerCount: inStockOffers.length,
      // Derived from the item's lots once they are built — never generated
      // separately, or the summary and the lot list disagree.
      expiresAt: null,
      lastCountedAt: daysFromNow(-(3 + (i % 21))),
    }
  })
}

/** Who touches stock. Movements are attributed so the ledger names a person. */
export const TEAM = [
  { id: 'user-1', name: 'Dr. Logan Newman', role: 'owner', initials: 'LN' },
  { id: 'user-2', name: 'Priya Raman', role: 'manager', initials: 'PR' },
  { id: 'user-3', name: 'Marcus Webb', role: 'assistant', initials: 'MW' },
  { id: 'user-4', name: 'Dr. Elena Sokolov', role: 'clinician', initials: 'ES' },
  { id: 'user-5', name: 'Tasha Brooks', role: 'assistant', initials: 'TB' },
]

const MOVEMENT_REASONS = {
  consumed: ['Chairside use', 'Op 3 restock', 'Hygiene bay', 'Surgical tray setup', 'Op 5 restock'],
  received: ['Delivery check-in', 'Received on PO', 'Rep drop-off'],
  counted: ['Weekly count', 'Monthly audit', 'Spot check'],
  wasted: ['Damaged in transit', 'Dropped', 'Contaminated field'],
}

/**
 * Backfill a plausible movement history from each item's burn rate.
 *
 * The ledger is the thing that makes on-hand auditable, so an empty one makes
 * the whole feature look decorative. Generated deterministically per item so
 * the history is stable between renders.
 */
export function buildMovements(inventoryRows) {
  const movements = []

  for (const row of inventoryRows) {
    if (row.dailyBurn <= 0) continue
    const seed = hash(row.id)
    // Roughly a fortnight of activity, denser for fast-moving items.
    const events = Math.min(9, Math.max(2, Math.round(row.dailyBurn * 14)))

    for (let i = 0; i < events; i += 1) {
      const s = hash(`${row.id}:${i}`)
      const daysAgo = 1 + ((seed + i * 7) % 26)
      const type =
        i === events - 1 && s % 3 === 0
          ? 'received'
          : s % 17 === 0
            ? 'wasted'
            : s % 11 === 0
              ? 'counted'
              : 'consumed'

      const reasons = MOVEMENT_REASONS[type]
      const member = TEAM[s % TEAM.length]
      const quantity =
        type === 'received'
          ? Math.max(1, row.reorderQty)
          : type === 'counted'
            ? 0
            : Math.max(1, Math.round(row.dailyBurn * (1 + (s % 3))))

      movements.push({
        id: `mv-${row.id}-${i}`,
        inventoryItemId: row.id,
        productName: row.productName,
        type,
        quantity: type === 'consumed' || type === 'wasted' ? -quantity : quantity,
        reason: reasons[s % reasons.length],
        userId: member.id,
        userName: member.name,
        userInitials: member.initials,
        createdAt: new Date(Date.now() - daysAgo * 86400000 - (s % 86400000)).toISOString(),
      })
    }
  }

  return movements.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

/**
 * Lots for items that expire. Anesthetics, composites and irrigants all carry
 * a shelf life, and using an expired lot is a board matter, not just waste.
 */
const LOT_SKUS = {
  'SEP-ART-100': [{ lot: 'A24J118', days: 24 }, { lot: 'A24K207', days: 96 }],
  // An expired anesthetic still on the shelf is the case that matters most,
  // so it sits on an item that actually has stock — a lot on a zero-on-hand
  // item would never render.
  'SEP-LID-100': [{ lot: 'L24H442', days: -11 }, { lot: 'L25A118', days: 213 }],
  '3M-FSU-A2B': [{ lot: 'NC42901', days: 128 }],
  '3M-FSU-A3B': [{ lot: 'NC42744', days: 168 }],
  'VST-CX-16': [{ lot: 'CX2409', days: 38 }],
  'ULT-OP-20M': [{ lot: 'OP24-772', days: 74 }],
  '3M-VAN-100': [{ lot: 'VN24-310', days: 143 }],
  'DEN-AQ-HB': [{ lot: 'AQ24-556', days: 19 }],
  'GC-F9-A2': [{ lot: 'F9-24118', days: 302 }],
  '3M-AT-1262': [{ lot: 'AT24-990', days: 61 }],
}

export function buildLots(inventoryRows) {
  const lots = []

  for (const row of inventoryRows) {
    const spec = LOT_SKUS[row.productId]
    if (!spec) continue

    // Split the on-hand count across lots, oldest first.
    let remaining = row.onHand
    spec.forEach(({ lot, days }, i) => {
      const isLast = i === spec.length - 1
      const quantity = isLast ? remaining : Math.min(remaining, Math.ceil(row.onHand / spec.length))
      remaining -= quantity
      if (quantity <= 0) return

      lots.push({
        id: `lot-${row.id}-${i}`,
        inventoryItemId: row.id,
        productId: row.productId,
        productName: row.productName,
        brand: row.brand,
        unit: row.unit,
        locationName: row.locationName,
        categorySlug: row.categorySlug,
        lotNumber: lot,
        quantity,
        expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
        receivedAt: new Date(Date.now() - (120 - days / 2) * 86400000).toISOString(),
      })
    })
  }

  return lots.sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))
}

export const ASSETS = [
  {
    id: 'asset-1',
    name: 'M11 UltraClave Sterilizer',
    manufacturer: 'Midmark',
    model: 'M11-022',
    serialNumber: 'V1811-0942',
    locationId: 'loc-main',
    status: 'active',
    purchasedAt: '2021-04-12',
    purchasePrice: 6890,
    warrantyExpiresAt: '2026-04-12',
    nextServiceAt: daysFromNow(11),
    lastServicedAt: '2026-02-14',
  },
  {
    id: 'asset-2',
    name: 'A-dec 500 Chair — Op 3',
    manufacturer: 'A-dec',
    model: '511',
    serialNumber: 'AD500-33718',
    locationId: 'loc-main',
    status: 'active',
    purchasedAt: '2020-08-02',
    purchasePrice: 28500,
    warrantyExpiresAt: '2025-08-02',
    nextServiceAt: daysFromNow(-4),
    lastServicedAt: '2025-08-19',
  },
  {
    id: 'asset-3',
    name: 'Elite Air Compressor, 5 User',
    manufacturer: 'DentalEZ',
    model: 'AC-5U',
    serialNumber: 'DEZ-55210',
    locationId: 'loc-main',
    status: 'active',
    purchasedAt: '2019-11-20',
    purchasePrice: 5980,
    warrantyExpiresAt: '2024-11-20',
    nextServiceAt: daysFromNow(46),
    lastServicedAt: '2026-05-30',
  },
  {
    id: 'asset-4',
    name: 'STATIM 5000 G4',
    manufacturer: 'SciCan',
    model: '5000G4',
    serialNumber: 'SC5G4-11902',
    locationId: 'loc-north',
    status: 'servicing',
    purchasedAt: '2022-06-15',
    purchasePrice: 9450,
    warrantyExpiresAt: '2027-06-15',
    nextServiceAt: daysFromNow(3),
    lastServicedAt: '2026-01-22',
  },
]

export const ORDERS = [
  {
    id: 'ord-1042',
    reference: 'PO-1042',
    supplierId: 'net32',
    supplierName: 'Net32',
    locationId: 'loc-main',
    status: 'confirmed',
    subtotal: 486.22,
    shipping: 6.5,
    tax: 40.11,
    total: 532.83,
    savings: 91.4,
    placedAt: daysFromNow(-3),
    expectedAt: daysFromNow(2),
    itemCount: 7,
  },
  {
    id: 'ord-1041',
    reference: 'PO-1041',
    supplierId: 'darby',
    supplierName: 'Darby Dental',
    locationId: 'loc-main',
    status: 'received',
    subtotal: 1204.5,
    shipping: 0,
    tax: 99.37,
    total: 1303.87,
    savings: 212.75,
    placedAt: daysFromNow(-12),
    expectedAt: daysFromNow(-8),
    receivedAt: daysFromNow(-8),
    itemCount: 14,
  },
  {
    id: 'ord-1040',
    reference: 'PO-1040',
    supplierId: 'benco',
    supplierName: 'Benco Dental',
    locationId: 'loc-north',
    status: 'received',
    subtotal: 642.18,
    shipping: 9.95,
    tax: 53.78,
    total: 705.91,
    savings: 64.2,
    placedAt: daysFromNow(-26),
    expectedAt: daysFromNow(-22),
    receivedAt: daysFromNow(-21),
    itemCount: 9,
  },
]

/** Line items per order: [orderId, sku, quantity, unitPrice, receivedQty] */
export const ORDER_ITEMS = [
  ['ord-1042', 'MT-N-M', 10, 25.21, 0],
  ['ord-1042', 'CTX-L3-EL', 8, 22.23, 0],
  ['ord-1042', '3M-FSU-A2B', 4, 89.41, 0],
  ['ord-1042', 'SEP-ART-100', 4, 117.34, 0],
  ['ord-1042', 'CAR-MN-27L', 5, 29.17, 0],
  ['ord-1042', '3M-AT-1262', 2, 59.32, 0],
  ['ord-1042', 'CTX-SB-2', 3, 41.06, 0],

  ['ord-1041', 'DEN-NP-MM', 5, 39.63, 5],
  ['ord-1041', 'YNG-PA-SC', 8, 28.86, 8],
  ['ord-1041', 'MC-ND-856', 6, 37.42, 6],
  ['ord-1041', 'SSW-245', 5, 18.94, 5],
  ['ord-1041', 'CAR-SE-CL', 8, 10.55, 8],
  ['ord-1041', 'RIC-CR-2', 2, 34.18, 2],
  ['ord-1041', 'DUK-GZ-22', 3, 41.22, 3],
  ['ord-1041', '3M-VAN-100', 3, 236.18, 3],

  ['ord-1040', 'MT-N-M', 8, 26.44, 8],
  ['ord-1040', 'DEN-NP-MM', 4, 41.55, 4],
  ['ord-1040', 'CTX-L3-EL', 6, 23.31, 6],
  ['ord-1040', 'SEP-LID-100', 3, 74.12, 3],
  ['ord-1040', 'CAR-SE-CL', 6, 11.06, 6],
]

/**
 * Rolling 12-month spend. `spend` is what the practice paid; `saved` is the
 * gap to what the same basket would have cost at the priciest supplier —
 * together they make list price, which is why they stack.
 */
export const SPEND_HISTORY = [
  { month: 'Sep', spend: 7480, saved: 812 },
  { month: 'Oct', spend: 8210, saved: 903 },
  { month: 'Nov', spend: 9040, saved: 1015 },
  { month: 'Dec', spend: 6890, saved: 744 },
  { month: 'Jan', spend: 9620, saved: 1188 },
  { month: 'Feb', spend: 8340, saved: 1067 },
  { month: 'Mar', spend: 8420, saved: 940 },
  { month: 'Apr', spend: 7960, saved: 1120 },
  { month: 'May', spend: 9310, saved: 1004 },
  { month: 'Jun', spend: 8115, saved: 1288 },
  { month: 'Jul', spend: 8890, saved: 1402 },
  { month: 'Aug', spend: 6240, saved: 1176 },
]

/**
 * Trailing-12-month spend per category. Reflects how a general practice
 * actually spends: infection control and restorative dominate, implants are
 * lumpy and high-ticket.
 */
export const CATEGORY_SPEND = [
  { slug: 'infection-control', spend: 21840 },
  { slug: 'restorative', spend: 18420 },
  { slug: 'implants', spend: 14260 },
  { slug: 'preventive', spend: 11380 },
  { slug: 'disposables', spend: 9240 },
  { slug: 'anesthetics', spend: 7960 },
  { slug: 'rotary-burs', spend: 6410 },
  { slug: 'endodontics', spend: 5820 },
  { slug: 'impression-lab', spend: 4180 },
  { slug: 'imaging', spend: 3120 },
  { slug: 'oral-surgery', spend: 2740 },
  { slug: 'whitening', spend: 1890 },
]

/** Where purchase orders actually landed over the trailing 12 months. */
export const SUPPLIER_SPEND = [
  { id: 'net32', spend: 32180, orders: 41 },
  { id: 'darby', spend: 24460, orders: 28 },
  { id: 'benco', spend: 18920, orders: 19 },
  { id: 'dental-city', spend: 14380, orders: 16 },
  { id: 'henry-schein', spend: 11240, orders: 9 },
  { id: 'safco', spend: 6820, orders: 7 },
  { id: 'patterson', spend: 5260, orders: 4 },
]

/** Highest-spend SKUs over the trailing 12 months. */
export const TOP_ITEMS = [
  { sku: 'MT-N-M', spend: 8940 },
  { sku: 'STR-BLX-4010', spend: 8240 },
  { sku: '3M-FSU-A2B', spend: 5120 },
  { sku: 'SEP-ART-100', spend: 4680 },
  { sku: 'CTX-L3-EL', spend: 4210 },
  { sku: '3M-VAN-100', spend: 3960 },
  { sku: 'MC-ND-856', spend: 3140 },
  { sku: 'DEN-PV3-RF', spend: 2870 },
]
