# Dentin

**The price beneath the rest.**

Inventory, par-level intelligence and best-price procurement for modern dental
practices. Built as an installable iOS-native PWA on React + Vite, backed by
Supabase, deployed on Vercel.

---

## What it does

**Know what you have.** Every consumable and capital asset tracked per
location and per bin, with par levels, reorder points and a movement ledger
that makes `on_hand` an auditable number rather than a guess.

**Know when you'll run out.** Dentin computes a trailing 30-day burn rate off
the movement ledger and turns it into *days of cover* — the number a practice
owner actually reasons about. Reorder points are checked against supplier lead
time, so the app warns you when a threshold is set too low to survive shipping.

**Scan the box.** Barcode scanning runs on the platform `BarcodeDetector`
where available and falls back to ZXing, so it works on current iOS and
Android. Scan to receive a delivery or to draw stock down chairside; manual
entry covers scuffed labels.

**Buy at the floor.** Every product carries offers from each supplier the
practice buys from. Prices are normalised to a true per-unit figure, so a box
of 200 and a box of 50 compare honestly. The reorder screen prices the whole
basket two ways — cheapest split across suppliers, or consolidated with the
one supplier who can fill it for the least all-in including freight — and
states the trade-off in dollars.

**Know who you can actually buy from.** Vendors are split into accounts the
practice already holds — with account number, rep, terms and a preferred flag
— and vendors it does not. That distinction drives the pricing everywhere
else: the "best price" on an item is the best price you can *place today*,
and a cheaper quote behind an account application is reported separately as
an opportunity rather than folded in as a saving. Order baskets are built
only from vendors you can order from.

**Price one exact product across every vendor.** Price check resolves a
product by its GS1 barcode and manufacturer part number, finds every vendor
that actually lists *that* item, and normalizes each to a per-unit price. It
reports two things most comparisons hide: the vendors that do **not** carry it
(so "nobody is cheaper" is never confused with "nobody else sells it"), and
how each listing was matched — barcode, part number, or a name-and-pack guess
that says so on its face.

**See what the accounts you don't have are costing you.** Competitive pricing
sweeps every tracked item, compares the best account price against the best
price on the market, and totals the gap — grouped by which vendor would need
opening, so one decision captures most of it.

**Load the prices you actually negotiated.** Contract price import takes the
CSV or EDI file your rep sends, guesses the column mapping, matches each row
to the catalog by barcode then part number then description, and shows you
what matched before anything is applied. Imported prices then override list
everywhere in the app.

**Answer "where did it go".** Every change to on-hand is a ledger entry with
who, when, why and the balance it left behind — reconstructed against the
item, so the running total always agrees with the count. Nothing edits stock
directly.

**Catch expiry before an inspector does.** Lots are captured at receipt, when
the carton is in hand, and tracked to their expiry date. Expired lots are
separated from merely-soon ones, because an expired anesthetic carpule in a
drawer is a finding, not a housekeeping note.

**Stay ahead of compliance.** Sterilizers, compressors, chairs and imaging are
tracked with serials, warranty dates and service intervals, because the
service log is the first thing a board inspection asks for.

**Get told, not asked.** A daily Vercel Cron sweep raises alerts for low
stock, expiring lots and equipment service, and delivers one digest push per
device rather than a notification per item.

**See where the money went.** An Insights screen charts spend against list
price month over month, breaks it down by category, supplier and SKU, and
flags every item whose remaining cover is shorter than its supplier's lead
time — the ones where reordering today still means a gap.

**Set up in five steps.** A guided onboarding captures the practice, its
shipping address, its locations, the suppliers it buys from and what it wants
tracked, so a new practice is productive without a data-import project.

---

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 18, Vite 6, Tailwind, Framer Motion |
| Data | Supabase (Postgres + RLS + Auth) |
| API | Vercel serverless functions (`/api`) |
| Scheduled work | Vercel Cron → `/api/cron/low-stock` |
| Push | Web Push (VAPID) via service worker |
| Scanning | `BarcodeDetector` with `@zxing/browser` fallback |
| Charts | Hand-rolled SVG/HTML — no charting dependency |

### On the charts

The charts are built directly rather than pulled from a library, for two
reasons. The mark specs the design calls for — a 2px surface gap between
stacked segments, a 4px rounded data-end that stays square on the baseline,
bars capped at 24px — are awkward to force through a general-purpose charting
API, and a charting library was the single largest thing in the bundle.
Removing it cut ~386 KB.

The two-colour chart palette is **validated, not chosen by eye**: it clears
the lightness band, chroma floor, colour-vision-deficiency separation,
normal-vision floor and contrast against the surface it actually renders on,
in both light and dark. Dark is re-stepped for the dark surface rather than
flipped. If you change `--viz-1` / `--viz-2` in `src/index.css`, re-run the
validation against both surfaces before shipping — the CVD check in
particular is not something you can eyeball.

---

## Running locally

```bash
npm install
cp .env.example .env.local     # optional — see below
npm run dev
```

Dentin boots against a **bundled demo practice** when Supabase is not
configured, so the full experience — stock health, scanning, price comparison,
reordering — is explorable immediately with no backend. Settings shows a
`Demo` badge whenever this is the case.

---

## Connecting Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations, in order, in the SQL editor:
   - `supabase/migrations/0001_init.sql` — tables, enums, triggers, RLS
   - `supabase/migrations/0002_views_and_rpc.sql` — stock health views, price RPCs
   - `supabase/migrations/0003_supplier_accounts.sql` — vendor accounts, the
     vendor roster view, and the competitive-pricing view
   - `supabase/migrations/0004_contract_prices.sql` — your negotiated pricing
     and the effective-price view that prefers it over list
3. Run `supabase/seed.sql` to load the dental catalog and supplier market.
4. Put the project URL and anon key in `.env.local`:

```bash
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Restart the dev server. The `Demo` badge in Settings becomes `Live`.

### Tenancy and security

Every practice-owned table is gated by RLS on `practice_id`, resolved through
`public.current_practice_id()` — a `security definer` function that reads the
caller's profile without tripping recursion on the `profiles` policy. The
shared catalog (`products` with `practice_id IS NULL`, plus `suppliers` and
`supplier_offers`) is readable by any signed-in user; a practice can also add
private products that only it can see.

The service-role key bypasses RLS and is used **only** inside `/api`. It must
never be exposed to the browser — note that it is deliberately not prefixed
with `VITE_`.

### About the seed data

Product names, brands and suppliers in `seed.sql` are real. **Barcodes and
prices are illustrative** — GTINs use a reserved `099999…` range and are not
licensed GS1 codes. Replace the catalog with a GS1/GDSN feed or your
suppliers' catalog exports before scanning live packaging; `resolve_gtin()`
will then match real boxes with no code changes.

---

## Deploying to Vercel

```bash
vercel link
vercel deploy --prod
```

Set these in **Project → Settings → Environment Variables**:

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Client | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Client | Anon key (RLS-protected) |
| `VITE_VAPID_PUBLIC_KEY` | Client | Push subscription key |
| `SUPABASE_URL` | Server | Same URL, for `/api` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Bypasses RLS — server only |
| `VAPID_PUBLIC_KEY` | Server | Web push |
| `VAPID_PRIVATE_KEY` | Server | Web push |
| `VAPID_SUBJECT` | Server | `mailto:` contact for push |
| `CRON_SECRET` | Server | Bearer token Vercel Cron sends |

Generate the push keypair once:

```bash
npx web-push generate-vapid-keys
```

`vercel.json` registers the daily cron at 13:00 UTC. The handler rejects any
request whose `Authorization` header is not `Bearer $CRON_SECRET`.

---

## API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/price-search?q=` | GET | Catalog search with best offer and market spread, ranked by savings opportunity |
| `/api/barcode-lookup?gtin=` | GET | Resolve a barcode to a product and the practice's inventory row |
| `/api/vendor-prices?productId=` | GET | Fan out across vendor connectors for one exact product; returns every carrier, every non-carrier, and how each was matched |
| `/api/cron/low-stock` | GET | Daily sweep: raises alerts, sends digest push (cron-authenticated) |

These run as the calling user, so RLS applies.

---

## Getting real vendor pricing

`/api/vendor-prices` fans out across pluggable connectors in
`api/_lib/connectors/`. Two ship working — your imported contract prices, and
the stored catalog — and the interface is documented in that directory's
README.

**No major distributor is wired up, and none can be without a commercial
agreement.** That is how the industry works, not an omission. The realistic
path, in order of value:

1. **Ask each rep for your contracted-price file.** Most distributors will
   provide a CSV or EDI 832 for your account. Load it into `contract_prices`
   (migration `0004`) and it wins over every list price automatically — an
   eight-figure practice does not pay list, so comparing list prices compares
   the wrong numbers.
2. **Punchout (cXML)** where offered, for live carts at your negotiated rates.
3. **GS1/GDSN** for product identity, so vendor SKUs can be matched to each
   other at all.

Do not scrape. Beyond the terms-of-service exposure, scraped list pricing is
usually wrong for an account holder — which makes the comparison worse than
not having one.

### Why matching is the hard part

The same glove is `HEN-321114` at Henry Schein, `DAR-282971` at Darby and a
seller listing on Net32. Dentin matches on manufacturer identity instead:
barcode first, then manufacturer part number, then brand plus normalized name
and pack size. The key that resolved is carried through to the UI, because a
name match is a guess and pricing against it as though it were not is how you
end up buying the wrong pack size.

---

## Push notifications on iOS

Safari does not expose the Push API to a browser tab. Notifications require
the practice to add Dentin to the Home Screen first — Settings detects this
and explains it rather than failing silently. Once installed, the app runs
full-screen and receives alerts like any native app.

---

## Project layout

```
api/                    Vercel serverless functions
  _lib/supabase.js      Admin + user-scoped clients
  price-search.js       Best-price search
  barcode-lookup.js     GTIN resolution
  cron/low-stock.js     Daily sweep and push digest
src/
  components/ios/       Screen, TabBar, List, Sheet, Controls, Button,
                        SwipeRow, Toast
  components/charts/    StackedColumns, BarList, HealthMeter, Sparkline
  pages/                Welcome, Onboarding, Dashboard, Inventory, ItemDetail,
                        Scan, Catalog, Search, Orders, OrderDetail, Reorder,
                        Vendors, MarketScan, PriceCheck, ContractImport,
                        Insights, Alerts, Expiry, Equipment, Team, Settings
  hooks/                useData, useBarcodeScanner
  lib/                  repository (the data seam), supabase, AuthContext,
                        push, format, csv, demoData
supabase/
  migrations/           Schema, RLS, views, RPCs
  seed.sql              Dental catalog and supplier market
```

`src/lib/repository.js` is the single data seam. Screens never import Supabase
directly, which is what lets the same UI run on live data or the demo
practice.

---

## Scripts

```bash
npm run dev       # Vite dev server
npm run build     # Production build
npm run preview   # Serve the build locally
npm run lint      # ESLint
```
