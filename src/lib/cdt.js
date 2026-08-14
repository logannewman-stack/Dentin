/**
 * Procedure-driven consumption.
 *
 * When a procedure is marked complete in the practice management system, the
 * materials it consumed are known — so stock should move without anyone
 * counting anything. This is the mechanism Eaglesoft and SupplyTrax implement
 * and that the standalone inventory tools leave out; they scan items in and
 * out, or forecast from the schedule, but do not decrement on completion.
 *
 * ── On the codes ───────────────────────────────────────────────────────────
 * CDT is ADA intellectual property. A practice may use CDT inside software it
 * owns — that right comes with the code manual and with its PMS licence. But
 * distributing CDT inside a commercial product requires a paid ADA commercial
 * licence with annual royalties, and codes may not be redistributed on their
 * own. The short descriptors below are Dentin's own wording, not ADA nomenclature;
 * a licensed deployment should pull official descriptors from the practice's
 * own CDT source. See docs/INTEGRATIONS.md.
 *
 * ── On the map ─────────────────────────────────────────────────────────────
 * There is no standard, published CDT-to-materials mapping, because there
 * cannot be one: it encodes a given dentist's material preferences and a given
 * hygienist's tray setup. What follows is a starting template covering the
 * codes that carry most of a general practice's production. It is meant to be
 * edited per provider and then corrected against real counts — the residual
 * between predicted and counted consumption is the tuning signal.
 */

/** Quantities are in individual units; the engine converts to packs. */
const bom = (...entries) => entries.map(([sku, each, opts = {}]) => ({ sku, each, ...opts }))

/**
 * Yield for bulk-dispensed materials.
 *
 * Most items are counted — a glove, a carpule, a bur — so one unit is one
 * unit and pack size does the conversion. Bottles, jars and pouches are not:
 * a 5 mL bottle of adhesive is one "pack" but covers dozens of restorations.
 * Without this, a BOM line of "1 adhesive" bills a whole bottle per filling
 * and overstates consumption by roughly sixtyfold.
 *
 * Numbers are working estimates; they are exactly the coefficients that
 * empirical tuning against counted stock should correct first.
 */
export const DISPENSED_YIELD = {
  '3M-SBU-5': 60, // 5 mL universal adhesive bottle
  'VST-CX-16': 20, // 16 oz irrigant
  'DEN-JP-FS': 8, // 1 lb alginate pouch
  'MTX-CC-24': 40, // 24 oz surface disinfectant
  'SUL-TP-CH': 80, // 1 oz topical anesthetic jar
}

/** Units of a product that one purchasable pack yields. */
export function unitsPerPack(product) {
  if (!product) return 1
  return DISPENSED_YIELD[product.id ?? product.sku] ?? product.packSize ?? 1
}

/**
 * Materials common to any procedure with a patient in the chair — the setup
 * cost. Kept separate so it is not re-typed into sixty rows, and so a practice
 * can tune its barrier protocol in one place.
 */
export const CHAIR_SETUP = bom(
  ['MT-N-M', 2], // one pair, changed once
  ['CTX-L3-EL', 1],
  ['CTX-BIB-BL', 1],
  ['CAR-SE-CL', 1],
  ['MTX-CW-160', 2], // operatory wipe-down
)

/** Additional barrier and sterilisation load for surgical or aerosol work. */
export const STERILE_SETUP = bom(['HAL-SP-35', 2], ['DUK-GZ-22', 4], ['MT-N-L', 2])

/**
 * The template map.
 *
 * `perSurface` multiplies by the restored surface count, which the PMS
 * supplies (Open Dental returns `Surf`, e.g. "MODL"). `perCanal` does the same
 * for endodontics using tooth type. Everything else is per procedure unit.
 */
export const PROCEDURE_TEMPLATES = [
  // ── Diagnostic and preventive ───────────────────────────────────────────
  {
    code: 'D0120',
    name: 'Periodic oral evaluation',
    category: 'preventive',
    setup: 'chair',
    materials: bom(['CTX-SB-2', 2]),
  },
  {
    code: 'D0150',
    name: 'Comprehensive oral evaluation',
    category: 'preventive',
    setup: 'chair',
    materials: bom(['CTX-SB-2', 4]),
  },
  {
    code: 'D0274',
    name: 'Bitewings, four films',
    category: 'imaging',
    setup: 'chair',
    materials: bom(['CTX-SB-2', 4]),
  },
  {
    code: 'D1110',
    name: 'Prophylaxis, adult',
    category: 'preventive',
    setup: 'chair',
    materials: bom(['YNG-PA-SC', 1], ['DEN-NP-MM', 1], ['RIC-CR-2', 2]),
  },
  {
    code: 'D1120',
    name: 'Prophylaxis, child',
    category: 'preventive',
    setup: 'chair',
    materials: bom(['YNG-PA-SC', 1], ['DEN-NP-MM', 1]),
  },
  {
    code: 'D1206',
    name: 'Topical fluoride varnish',
    category: 'preventive',
    setup: 'chair',
    materials: bom(['3M-VAN-100', 1]),
  },
  {
    code: 'D1351',
    name: 'Sealant, per tooth',
    category: 'preventive',
    setup: 'chair',
    materials: bom(['3M-CPS-LC', 1], ['ULT-UE-KIT', 1], ['RIC-CR-2', 2]),
  },

  // ── Restorative ─────────────────────────────────────────────────────────
  {
    code: 'D2391',
    name: 'Composite, one surface, posterior',
    category: 'restorative',
    setup: 'chair',
    anesthetic: 1,
    materials: bom(
      ['3M-FSU-A2B', 1, { perSurface: true }],
      ['3M-SBU-5', 1],
      ['ULT-UE-KIT', 1],
      ['DEN-PV3-RF', 1],
      ['MC-ND-856', 1],
      ['RIC-CR-2', 2],
    ),
  },
  {
    code: 'D2392',
    name: 'Composite, two surfaces, posterior',
    category: 'restorative',
    setup: 'chair',
    anesthetic: 1,
    materials: bom(
      ['3M-FSU-A2B', 1, { perSurface: true }],
      ['3M-SBU-5', 1],
      ['ULT-UE-KIT', 1],
      ['DEN-PV3-RF', 1],
      ['MC-ND-856', 1],
      ['RIC-CR-2', 2],
    ),
  },
  {
    code: 'D2393',
    name: 'Composite, three surfaces, posterior',
    category: 'restorative',
    setup: 'chair',
    anesthetic: 2,
    materials: bom(
      ['3M-FSU-A2B', 1, { perSurface: true }],
      ['3M-SBU-5', 1],
      ['ULT-UE-KIT', 1],
      ['DEN-PV3-RF', 2],
      ['MC-ND-856', 1],
      ['SSW-245', 1],
      ['RIC-CR-2', 2],
    ),
  },
  {
    code: 'D2394',
    name: 'Composite, four or more surfaces',
    category: 'restorative',
    setup: 'chair',
    anesthetic: 2,
    materials: bom(
      ['3M-FSU-A2B', 1, { perSurface: true }],
      ['3M-SBU-5', 1],
      ['ULT-UE-KIT', 1],
      ['DEN-PV3-RF', 2],
      ['MC-ND-856', 1],
      ['SSW-245', 1],
      ['RIC-CR-2', 3],
    ),
  },
  {
    code: 'D2740',
    name: 'Crown, porcelain or ceramic',
    category: 'restorative',
    setup: 'chair',
    anesthetic: 2,
    materials: bom(['DEN-AQ-HB', 1], ['MC-ND-856', 2], ['SSW-245', 1], ['RIC-CR-2', 4]),
  },
  {
    code: 'D2950',
    name: 'Core buildup, including pins',
    category: 'restorative',
    setup: 'chair',
    anesthetic: 1,
    materials: bom(['3M-FSU-A2B', 2], ['3M-SBU-5', 1], ['ULT-UE-KIT', 1], ['DEN-PV3-RF', 1]),
  },

  // ── Endodontics ─────────────────────────────────────────────────────────
  {
    code: 'D3310',
    name: 'Endodontic therapy, anterior',
    category: 'endodontics',
    setup: 'chair',
    anesthetic: 2,
    canals: 1,
    materials: bom(
      ['DEN-PTG-25', 1, { perCanal: true }],
      ['COL-GP-F2', 2, { perCanal: true }],
      ['VST-CX-16', 1],
      ['MC-ND-856', 1],
      ['RIC-CR-2', 4],
    ),
  },
  {
    code: 'D3320',
    name: 'Endodontic therapy, premolar',
    category: 'endodontics',
    setup: 'chair',
    anesthetic: 3,
    canals: 2,
    materials: bom(
      ['DEN-PTG-25', 1, { perCanal: true }],
      ['COL-GP-F2', 2, { perCanal: true }],
      ['VST-CX-16', 1],
      ['MC-ND-856', 1],
      ['RIC-CR-2', 4],
    ),
  },
  {
    code: 'D3330',
    name: 'Endodontic therapy, molar',
    category: 'endodontics',
    setup: 'chair',
    anesthetic: 4,
    canals: 3,
    materials: bom(
      ['DEN-PTG-25', 1, { perCanal: true }],
      ['COL-GP-F2', 2, { perCanal: true }],
      ['VST-CX-16', 2],
      ['MC-ND-856', 2],
      ['SSW-245', 1],
      ['RIC-CR-2', 6],
    ),
  },

  // ── Periodontics ────────────────────────────────────────────────────────
  {
    code: 'D4341',
    name: 'Scaling and root planing, per quadrant',
    category: 'preventive',
    setup: 'chair',
    anesthetic: 2,
    materials: bom(['DEN-NP-MM', 1], ['RIC-CR-2', 4], ['DUK-GZ-22', 2]),
  },
  {
    code: 'D4910',
    name: 'Periodontal maintenance',
    category: 'preventive',
    setup: 'chair',
    materials: bom(['YNG-PA-SC', 1], ['DEN-NP-MM', 1], ['RIC-CR-2', 2]),
  },

  // ── Oral surgery and implants ───────────────────────────────────────────
  {
    code: 'D7140',
    name: 'Extraction, erupted tooth',
    category: 'oral-surgery',
    setup: 'sterile',
    anesthetic: 2,
    materials: bom(['ETH-CG-40', 1], ['ASP-BP-15', 1], ['DUK-GZ-22', 6]),
  },
  {
    code: 'D7210',
    name: 'Surgical extraction, erupted tooth',
    category: 'oral-surgery',
    setup: 'sterile',
    anesthetic: 3,
    materials: bom(['ETH-CG-40', 1], ['ASP-BP-15', 2], ['MC-ND-856', 1], ['DUK-GZ-22', 8]),
  },
  {
    code: 'D6010',
    name: 'Surgical placement of implant body',
    category: 'implants',
    setup: 'sterile',
    anesthetic: 3,
    materials: bom(
      ['STR-BLX-4010', 1],
      ['STR-HA-4505', 1],
      ['ETH-CG-40', 1],
      ['ASP-BP-15', 1],
      ['DUK-GZ-22', 8],
    ),
  },

  // ── Other ───────────────────────────────────────────────────────────────
  {
    code: 'D9944',
    name: 'Occlusal guard, hard appliance',
    category: 'impression-lab',
    setup: 'chair',
    materials: bom(['DEN-AQ-HB', 1], ['DEN-JP-FS', 1]),
  },
  {
    code: 'D9975',
    name: 'External bleaching, take-home',
    category: 'whitening',
    setup: 'chair',
    materials: bom(['ULT-OP-20M', 1], ['DEN-JP-FS', 1]),
  },
]

export const TEMPLATE_BY_CODE = new Map(PROCEDURE_TEMPLATES.map((t) => [t.code, t]))

/** Surfaces come back as a string like "MODL"; count the letters. */
export function surfaceCount(surf) {
  if (!surf) return 1
  const letters = String(surf).toUpperCase().replace(/[^MODBLIF]/g, '')
  return Math.max(1, letters.length)
}

/**
 * Expand one completed procedure into the units it consumed.
 *
 * Returns entries in individual units — the caller converts to packs using
 * each product's pack size, because that is where inventory is counted.
 */
export function expandProcedure({ code, surfaces, units = 1, anestheticSku = 'SEP-ART-100' }) {
  const template = TEMPLATE_BY_CODE.get(code)
  if (!template) return null

  const surfaceMultiplier = surfaceCount(surfaces)
  const canals = template.canals ?? 1
  const totals = new Map()

  const add = (sku, each) => {
    totals.set(sku, (totals.get(sku) ?? 0) + each)
  }

  const setup = template.setup === 'sterile' ? [...CHAIR_SETUP, ...STERILE_SETUP] : CHAIR_SETUP
  for (const entry of setup) add(entry.sku, entry.each * units)

  for (const entry of template.materials) {
    const multiplier = entry.perSurface
      ? surfaceMultiplier
      : entry.perCanal
        ? canals
        : 1
    add(entry.sku, entry.each * multiplier * units)
  }

  // Anesthetic implies a needle — one per procedure regardless of carpules,
  // since the needle is changed per patient, not per cartridge.
  if (template.anesthetic) {
    add(anestheticSku, template.anesthetic * units)
    add('CAR-MN-27L', units)
  }

  return {
    code,
    name: template.name,
    surfaces: surfaceMultiplier,
    canals,
    entries: [...totals.entries()].map(([sku, each]) => ({ sku, each })),
  }
}
