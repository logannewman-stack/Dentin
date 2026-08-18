-- ===========================================================================
-- Dentin — getting real prices in with as little friction as possible
--
-- The whole product rests on one thing: the practice's OWN negotiated prices.
-- Until those are loaded, every comparison is against a seeded list price and
-- the answer is a guess. So the import has to accept whatever a rep actually
-- sends — a CSV, a spreadsheet paste, a forwarded email — and it has to
-- remember what it learned so the second import is nearly free.
--
-- Three pieces:
--   1. practices.import_token  — a private inbound address per practice
--   2. price_imports           — the inbox: files that arrived, not yet applied
--   3. vendor_item_map         — matches a human confirmed once, reused forever
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 1. A private address to forward price files to.
--
-- prices+<token>@in.dentininventory.com routes to /api/imports/email, which
-- looks the practice up by this token. Random, revocable, and never guessable
-- from the practice name.
-- --------------------------------------------------------------------------
-- A column default rather than app code: a practice created by onboarding, by
-- a support script, or by hand in the SQL editor all need one, and only the
-- database sees all three.
alter table practices
  add column if not exists import_token text unique default encode(gen_random_bytes(9), 'hex');

-- Backfill the practices that already exist.
update practices
   set import_token = encode(gen_random_bytes(9), 'hex')
 where import_token is null;

-- --------------------------------------------------------------------------
-- 2. The inbox.
--
-- A file that arrived by email (or was dropped in the app and left for later)
-- waits here until someone maps its columns and applies it. Keeping the raw
-- text means a bad mapping is always recoverable — re-open and remap rather
-- than asking the rep for the file again.
-- --------------------------------------------------------------------------
create table if not exists price_imports (
  id            uuid primary key default gen_random_uuid(),
  practice_id   uuid not null references practices(id) on delete cascade,
  supplier_id   uuid references suppliers(id) on delete set null,

  -- Where it came from: 'email' | 'upload' | 'paste'
  source        text not null default 'upload',
  filename      text,
  from_address  text,
  subject       text,

  -- The file itself, as text. Vendor price files are small (a few thousand
  -- rows); anything larger is rejected at the door rather than stored.
  content       text not null,
  byte_size     int  not null default 0,
  row_count     int,

  -- 'pending' → waiting for a human · 'applied' → became contract prices
  -- 'ignored' → dismissed · 'failed' → could not be read
  status        text not null default 'pending',
  applied_count int,
  note          text,

  received_at   timestamptz not null default now(),
  applied_at    timestamptz
);

create index if not exists price_imports_practice_idx
  on price_imports (practice_id, status, received_at desc);

alter table price_imports enable row level security;

-- The practice can see and manage its own inbox. The inbound-email endpoint
-- writes with the service role, which bypasses RLS.
drop policy if exists "tenant access" on price_imports;
create policy "tenant access" on price_imports for all to authenticated
  using (practice_id = public.current_practice_id())
  with check (practice_id = public.current_practice_id());

-- --------------------------------------------------------------------------
-- 3. Learned matches.
--
-- Vendor files identify items by the vendor's own catalog number, which no
-- amount of cleverness can resolve on its own. Once a person says "item
-- 4471902 at Schein is our Micro-Touch mediums", that is true forever — so
-- record it and let every later import match instantly.
-- --------------------------------------------------------------------------
create table if not exists vendor_item_map (
  id           uuid primary key default gen_random_uuid(),
  practice_id  uuid not null references practices(id) on delete cascade,
  supplier_id  uuid not null references suppliers(id) on delete cascade,
  vendor_sku   text not null,
  product_id   uuid not null references products(id) on delete cascade,
  -- 'manual' when a human picked it, 'auto' when the importer was confident
  confirmed_by text not null default 'manual',
  created_at   timestamptz not null default now(),
  unique (practice_id, supplier_id, vendor_sku)
);

create index if not exists vendor_item_map_product_idx on vendor_item_map (product_id);

alter table vendor_item_map enable row level security;

drop policy if exists "tenant access" on vendor_item_map;
create policy "tenant access" on vendor_item_map for all to authenticated
  using (practice_id = public.current_practice_id())
  with check (practice_id = public.current_practice_id());

-- --------------------------------------------------------------------------
-- Contract prices gain a provenance link, so a price can always answer
-- "which file did this come from?".
-- --------------------------------------------------------------------------
alter table contract_prices
  add column if not exists import_id uuid references price_imports(id) on delete set null;
