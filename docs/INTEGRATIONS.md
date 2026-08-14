# Practice management integration

Dentin can decrement stock when a procedure is completed, rather than waiting
for someone to notice a shelf is empty. This document covers what that needs.

## Why this matters

The standalone dental inventory tools — Sowingo, Method, ZenSupplies — track
stock by scanning items in and out, or forecast usage from the appointment
schedule. None of them decrement on procedure completion. The products that do
are the PMS-native ones: Patterson Eaglesoft and Henry Schein SupplyTrax, both
of which bind you to their supply catalog.

That leaves an opening: procedure-driven consumption without the vendor
lock-in. It is the single feature that separates an inventory list from an
inventory *system*, because it removes the step that always gets skipped.

## Open Dental

Open Dental publishes a REST API at `https://api.opendental.com/api/v1` with
everything the consumption engine needs.

**The endpoint.** `GET /procedurelogs?ProcStatus=C&DateTStamp=<yyyy-MM-dd HH:mm:ss>`
returns procedures completed since a timestamp. Each row carries:

| Field | Used for |
| --- | --- |
| `procCode` | The CDT code — selects the bill of materials |
| `UnitQty` | Multiplier for the whole BOM |
| `Surf` | Surface string like `"MODL"` — drives per-surface material scaling |
| `ToothNum` | Distinguishes molar from anterior endo (canal count) |
| `ProvNum` | Attribution, and per-provider BOM tuning |
| `ClinicNum` | Which location's stock to draw down |
| `ProcDate` | The consumption date |

**Access modes.** Local API and API Service run on an office workstation and
keep working through an internet outage, with a 1,000-item page limit. The
Remote API goes through Open Dental HQ with a 100-item limit. Local is the
right choice for a polling loop.

**Throttling.** With `ApiReadAll` the limit is one request per five seconds;
any narrower permission relaxes it to one per second. A five-minute poll is
far inside either.

**Constraints worth knowing before you plan around it:**

- Direct SQL against the Open Dental database is explicitly forbidden and
  actively blocked. The API is the only supported path.
- API access carries a developer licence fee. Tiers are not published.
- A Business Associate Agreement is required between the API developer and
  each practice, since procedure data is PHI.
- Custom-compiled builds of Open Dental cannot use the API.

**The loop.**

```
every 5 minutes:
  rows = GET /procedurelogs?ProcStatus=C&DateTStamp=<last_sync>
  consumption = projectConsumption(rows)      # src/lib/repository.js
  for each product: record_movement(type='consumed', qty=packs)
  any item at or below its reorder point joins the next draft order
```

`projectConsumption` is already written and already what the Procedures screen
runs on — the live feed replaces the demo procedure log and nothing downstream
changes.

## Other systems

**Eaglesoft** and **Dentrix** expose procedure data, but through database or
partner integrations rather than a documented public REST API; both are
practical with a partner agreement. **Charm** triggers on adding a procedure
code to an invoice. If a practice is on one of those, the same BOM map applies
— only the feed changes.

## The bill of materials is the real work

The API is the easy half. There is **no standard, published CDT-to-materials
mapping**, and there cannot be one: it encodes a particular dentist's material
preferences and a particular hygienist's tray setup. Every implementation
builds its own.

`src/lib/cdt.js` ships a starting template covering the codes that carry most
of a general practice's production. Expect to:

1. **Sit with each provider for an hour or two** and correct the map for their
   top codes. Sixty codes covers the overwhelming majority of production.
2. **Keep the parametric fields.** A four-surface restoration genuinely uses
   more composite than a one-surface, and a molar endo more files than an
   anterior. The API returns `Surf` and `ToothNum`, so this costs nothing.
3. **Tune against real counts.** Run it for 60–90 days, compare predicted
   consumption to counted stock, and correct the coefficients from the
   residual. The bulk-dispensed yields in `DISPENSED_YIELD` are the first
   thing to correct — how many restorations a bottle of adhesive actually
   covers is practice-specific, and getting it wrong skews everything
   downstream of it.

## CDT licensing

CDT is ADA intellectual property, and this constrains distribution rather than
use:

- **A practice using CDT in software it owns needs no separate licence.** The
  right comes with the code manual and with the PMS licence.
- **Distributing CDT inside a commercial product does.** Practice management
  vendors, payers and publishers hold commercial user licences and pay annual
  royalties, with usage audited.
- **Codes cannot be redistributed alone** — they must be bundled with other
  product assets.
- Applications go to `CDT-SNODENT@ada.org`; turnaround runs two to eight weeks.
  Royalty terms are not published.

Practically: Dentin running inside one practice is fine as-is. Dentin sold to
other practices needs a licence before it ships, and the application should
start early because the turnaround is measured in weeks.

The short procedure descriptors in `src/lib/cdt.js` are Dentin's own wording,
not ADA nomenclature. A licensed deployment should pull official descriptors
from the practice's own CDT source rather than relying on them.

## Sources and how much to trust them

The benchmarks in `src/lib/benchmarks.js` come from ADA-published guidance,
accounting-firm surveys and procurement consultancies. Two caveats are encoded
in that file's comments and worth repeating:

- **No published survey reports how often practices actually order.** Biweekly
  is the consensus *recommendation*, not observed behaviour. Dentin labels it
  as guidance rather than as a norm.
- **The savings figures attached to automated inventory in the trade press are
  vendor case studies**, not peer-reviewed results. Dentin does not quote them
  as promises anywhere in the product, and neither should a pitch built on it.
