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

**Stay ahead of compliance.** Sterilizers, compressors, chairs and imaging are
tracked with serials, warranty dates and service intervals, because the
service log is the first thing a board inspection asks for.

**Get told, not asked.** A daily Vercel Cron sweep raises alerts for low
stock, expiring lots and equipment service, and delivers one digest push per
device rather than a notification per item.

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
| `/api/cron/low-stock` | GET | Daily sweep: raises alerts, sends digest push (cron-authenticated) |

`price-search` and `barcode-lookup` run as the calling user, so RLS applies.

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
  components/ios/       Screen, TabBar, List, Sheet, Controls, Button
  pages/                Dashboard, Inventory, ItemDetail, Scan, Orders,
                        Reorder, Alerts, Equipment, Settings
  hooks/                useData, useBarcodeScanner
  lib/                  repository (the data seam), supabase, push,
                        format, demoData
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
