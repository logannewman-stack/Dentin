# Dentin — Launch Playbook

From working demo to paying practices. Phases are ordered; inside a phase,
steps are ordered. Every step is tagged:

- **[You]** — only the owner can do it: accounts, keys, money, signatures,
  reps, pilots.
- **[Build]** — engineering that can be done on request; the codebase is
  already shaped for it.
- **[Built]** — already in the product today.

---

## Phase 0 — Where the product stands

| Real today | Demo today |
|---|---|
| Every workflow: scan (QR/GS1 lot+expiry), inventory, par formulas, orders + receiving, draft orders + duplicate guard, vendor directory, competitive pricing UX, contract-file import, payments UX, compliance wall, team, insights, benchmarks | The practice data itself (seeded) |
| The front door: sign in / create account / preview a mock practice | Vendor prices (7 seeded suppliers) |
| The full Supabase schema (migrations 0001–0006, RLS multi-tenant) | Money movement (tracking only) |
| The design system, desktop + mobile layouts | Product barcodes (demo GTINs) |

The three demo things — **data, prices, money** — are the whole launch plan.

---

## Phase 1 — Turn on the real backend *(a weekend)*

1. **[You] Create the Supabase project.** supabase.com → New project →
   name it `dentin-prod`, region nearest your practices, strong database
   password into a password manager. Free tier is fine today; move to Pro
   ($25/mo, daily backups) before the first real practice's data goes in.
2. **[You] Run the schema.** Dashboard → SQL Editor → run each file from
   `supabase/migrations/` **in this order**:
   `0001_init.sql`, `0002_views_and_rpc.sql`, `0003_supplier_accounts.sql`,
   `0004_contract_prices.sql`, `0005_payments.sql`, `0006_credentials.sql` —
   each should report success — then `supabase/seed.sql` (categories,
   suppliers, starter catalog).
3. **[You] Collect keys.** Project Settings → API: the **Project URL**, the
   **anon public** key, and the **service_role** key (server-only; treat it
   like a bank password).
4. **[You] Generate push keys.** Locally: `npx web-push generate-vapid-keys`.
   And a cron secret: `openssl rand -hex 32`.
5. **[You] Set Vercel environment variables.** Vercel → project → Settings →
   Environment Variables → Production. The exact names (mirrors
   `.env.example`):

   | Variable | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_ANON_KEY` | anon key |
   | `VITE_VAPID_PUBLIC_KEY` | VAPID public key |
   | `SUPABASE_URL` | Project URL (again, server-side) |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | the generated pair |
   | `VAPID_SUBJECT` | `mailto:alerts@dentininventory.com` |
   | `CRON_SECRET` | the random hex string |

   **Do not set `VITE_BYPASS_AUTH` in production** — it skips the front door.
6. **[You] Configure auth.** Supabase → Authentication → URL Configuration:
   Site URL `https://dentininventory.com` (add to redirect allow-list).
   Email provider: leave confirm-email ON. Later, plug custom SMTP (Resend
   free tier) so confirmation emails come from your domain.
7. **[You] Redeploy** (Vercel → Deployments → Redeploy) so the variables take
   effect, then create your own real account and run onboarding.
8. **[Build] Live-mode QA sweep.** The demo paths have thousands of runs; the
   live paths need one deliberate pass: sign-up → onboarding → add inventory →
   scan → ledger → build order → receive → payment tracking → credentials.
   Budget one day of engineering to run it and fix what surfaces.

**Exit criteria:** you sign in with a real email, everything persists, a
second test account cannot see your practice's data.

---

## Phase 2 — Real products, and a two-hour practice setup *(weeks 1–2)*

1. **[Build] Inventory CSV import.** The contract-price importer (delimiter
   sniffing, column guessing, match preview) gets a sibling for inventory:
   name, SKU/GTIN, on-hand, par, location. ~One day of work.
2. **[You] Get each practice's real data.** Every distributor portal exports
   order history as CSV (Schein, Patterson, Benco, Darby all do). The last
   90 days of orders ≈ the practice's true catalog, quantities, and prices.
3. **[Build] Grow the catalog from scans.** When a barcode misses, prefill a
   new-product form with the scanned GTIN so the catalog completes itself at
   the front desk.
4. **[You, later] Licensed catalog data.** When volume justifies it: GS1 US
   Data Hub subscription for verified GTINs, or a dental catalog feed for
   images and specs.

**Exit criteria:** a practice goes from nothing to fully set up — inventory,
pars, barcodes resolving — in under two hours, at their front desk.

---

## Phase 3 — Real prices: the moat *(starts week 2, never stops)*

1. **[You] The rep email — works today, no integration.** Send each rep:

   > "Hi ___, could you send our current contract price file as a CSV —
   > item number, description, pack size, and our contracted price? Our
   > inventory system imports it so orders match the invoice."

   This is routine for distributors (an EDI 832 or portal export).
   **[Built]** the importer already survives messy files — European
   decimals, BOMs, quoted fields.
2. **[Build] Net32 coverage.** Marketplace prices are public; evaluate their
   API/affiliate route first (terms-clean), else a scheduled price-file
   refresh.
3. **[You + Build] Distributor connectors, in pilot order.** Ask each rep
   for "punchout/cXML or an EDI 832 price feed" — the exact technical ask
   is written for them in `api/_lib/connectors/README.md`. Each vendor is
   one rep conversation plus roughly a week of connector work. Build them in
   the order your pilot practices actually buy.
4. **Principles already enforced in the product:** never show a price that
   can't be sourced; best-orderable-today and cheapest-on-market stay
   separate claims; no scraping (brittle, and against vendor terms).

**Exit criteria:** for a pilot practice's top 50 SKUs, at least two live
price sources each, and their own contract price on every one.

---

## Phase 4 — Money *(weeks 3–4 — carefully)*

1. **[Built] Payment tracking runs today.** Terms per vendor, due dates, the
   awaiting-payment queue, mark-paid with method and confirmation. Zero
   liability. **Pilots run on this.**
2. **[You, with counsel, later] Actual money movement is a different
   business.** Moving practice→vendor funds approaches money-transmission
   territory. When pilots prove demand: evaluate a bill-pay/ACH API partner
   and have a lawyer scope the structure **before** any wire moves. This is
   deliberately last.
3. **Rule already in code and schema:** card and bank numbers never touch
   Dentin — display labels only; the processor keeps the vault
   (`0005_payments.sql` documents the boundary).

---

## Phase 5 — The business wrapper *(parallel with everything)*

1. **[You]** Entity, business bank account, insurance (cyber + E&O).
2. **[You]** Terms of Service + Privacy Policy — counsel or a reputable
   service, reviewed. Say plainly: Dentin stores **inventory data, not
   patient data**.
3. **HIPAA posture — read this twice.** Today Dentin holds supplies and spend,
   not PHI, which keeps it outside HIPAA's heavy machinery. The Open Dental
   integration (procedure logs) would change that. Before that feature ships
   to production: BAA strategy + legal review. Don't stumble into it.
4. **[Build]** Error monitoring (Sentry free tier — about an hour).
5. **[Build]** Analytics (Vercel Analytics or Plausible — privacy-friendly).
6. **[You]** `support@dentininventory.com` with a stated response time.
7. **[You + Build] Publish the price.** The researched band: published
   competitors sit at $49–249/location/month and most vendors hide pricing
   entirely — a printed price is itself a differentiator. The credible slot
   for Dentin's feature set: **$99–149/location/month, month-to-month, no
   setup fee, free 90-day pilot.**

---

## Phase 6 — Pilot playbook *(weeks 2–8)*

1. **[You] Recruit 2–3 practices.** Your own dentist, practices you know.
   The offer: *"Free for 90 days. I set it up at your front desk in under
   two hours. You keep the savings."*
2. **The two-hour setup visit, in order:** create their account → import
   90-day order history → accept par suggestions (one tap per item) → train
   whoever receives boxes on Scan (ten minutes) → send the rep email for
   contract files → fill in the compliance wall (HIPAA/OSHA/BLS dates — the
   office manager will love it) → turn on low-stock alerts.
3. **[You] Weekly 20-minute check-in.** One running doc of asks; the top ask
   gets built each week.
4. **Metrics that decide everything:** share of orders placed through
   Dentin; verified savings against their old invoices (screenshot the
   invoice); minutes per week the ordering person gets back; unmatched-scan
   rate trending to zero.
5. **[You] Convert.** Day 60: show the practice its own numbers. Day 90:
   published price.

---

## Phase 7 — After pilots prove it

- **Open Dental integration** — auto-decrement stock by CDT code; the
  differentiator. Requires the ADA CDT license for commercial distribution
  and the Phase 5 HIPAA step first (`docs/INTEGRATIONS.md`).
- **Push notifications live** — the Phase 1 keys power the existing cron;
  verify end-to-end on real phones.
- **Multi-location / DSO** views when a group asks.
- **Real payment rails** (Phase 4.2).
- **App-store wrapper** (Capacitor) only if practices ask — the PWA installs
  from the browser today.

---

## Running costs until revenue

| Item | Cost |
|---|---|
| Supabase | $0 → $25/mo at first real practice |
| Vercel | $0 → $20/mo Pro when limits hit |
| Domain | ~$15/yr |
| Sentry, Resend, analytics | $0 tiers |
| GS1 Data Hub (later) | ~$250/yr |
| Legal (one-time) | ~$1–3k |

Under $50/month until there are customers.

## Division of labor

| Only you | On request (engineering) |
|---|---|
| Supabase/Vercel accounts and keys | Live-mode QA sweep |
| Legal entity, ToS/privacy, insurance | Inventory CSV import |
| Rep conversations, price files | Unmatched-scan → add-product loop |
| Pilot recruiting and visits | Vendor connectors (per vendor) |
| Pricing decision, conversion asks | Sentry, analytics, pricing page |
| Payment-rails partner + counsel | Everything in Phase 7 |
