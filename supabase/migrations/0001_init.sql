-- ===========================================================================
-- Dentin — core schema
-- Multi-tenant by practice. Every practice-owned row carries practice_id and
-- is gated by RLS through public.current_practice_id().
-- ===========================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- --------------------------------------------------------------------------
-- Enums
-- --------------------------------------------------------------------------
create type user_role      as enum ('owner', 'manager', 'clinician', 'assistant', 'viewer');
create type movement_type  as enum ('received', 'consumed', 'adjusted', 'wasted', 'transferred', 'returned', 'counted');
create type order_status   as enum ('draft', 'submitted', 'confirmed', 'partial', 'received', 'cancelled');
create type alert_type     as enum ('low_stock', 'out_of_stock', 'expiring', 'expired', 'service_due', 'price_drop');
create type alert_severity as enum ('info', 'warning', 'critical');
create type asset_status   as enum ('active', 'servicing', 'retired');

-- --------------------------------------------------------------------------
-- Tenancy
-- --------------------------------------------------------------------------
create table practices (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  legal_name   text,
  npi          text,
  tax_id       text,
  phone        text,
  email        text,
  website      text,
  logo_url     text,
  -- Practice mailing address (shipping default for orders)
  address_1    text,
  address_2    text,
  city         text,
  region       text,
  postal_code  text,
  country      text not null default 'US',
  timezone     text not null default 'America/New_York',
  currency     text not null default 'USD',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table locations (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid not null references practices(id) on delete cascade,
  name           text not null,
  nickname       text,
  address_1      text,
  address_2      text,
  city           text,
  region         text,
  postal_code    text,
  country        text not null default 'US',
  phone          text,
  operatories    int  not null default 0,
  is_primary     boolean not null default false,
  created_at     timestamptz not null default now()
);
create index on locations (practice_id);

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  practice_id  uuid references practices(id) on delete set null,
  full_name    text,
  email        text,
  avatar_url   text,
  role         user_role not null default 'owner',
  created_at   timestamptz not null default now()
);
create index on profiles (practice_id);

-- Resolve the caller's practice without tripping RLS recursion on profiles.
create or replace function public.current_practice_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select practice_id from public.profiles where id = auth.uid()
$$;

-- --------------------------------------------------------------------------
-- Shared dental catalog
-- Rows with practice_id IS NULL are the global catalog every practice reads.
-- A practice may also add private items (practice_id = their id).
-- --------------------------------------------------------------------------
create table categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  parent_id   uuid references categories(id) on delete cascade,
  icon        text,
  sort_order  int not null default 0
);

create table suppliers (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  logo_url          text,
  website           text,
  support_phone     text,
  free_ship_over    numeric(10,2),
  flat_ship_fee     numeric(10,2) not null default 0,
  avg_lead_days     int not null default 3,
  notes             text
);

create table products (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid references practices(id) on delete cascade,  -- null = global catalog
  category_id    uuid references categories(id) on delete set null,
  name           text not null,
  brand          text,
  manufacturer   text,
  description    text,
  -- Barcode. GTIN-12/13/14 as scanned off the box.
  gtin           text,
  mfr_sku        text,
  image_url      text,
  -- How the practice counts it: "box of 100", "50 mL bottle", "each"
  unit           text not null default 'each',
  pack_size      int  not null default 1,
  is_equipment   boolean not null default false,
  is_rx          boolean not null default false,
  hazard_class   text,
  shelf_life_days int,
  created_at     timestamptz not null default now()
);
create index on products (category_id);
create index on products (practice_id);
create unique index products_gtin_global_idx on products (gtin) where practice_id is null and gtin is not null;
create index products_name_trgm_idx on products using gin (name gin_trgm_ops);
create index products_brand_trgm_idx on products using gin (brand gin_trgm_ops);

-- The price-comparison table. "The price beneath the top layer" lives here.
create table supplier_offers (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  supplier_id   uuid not null references suppliers(id) on delete cascade,
  supplier_sku  text,
  price         numeric(10,2) not null check (price >= 0),
  pack_size     int not null default 1 check (pack_size > 0),
  -- Normalized comparison price: what one countable unit actually costs.
  unit_price    numeric(12,4) generated always as (price / nullif(pack_size, 0)) stored,
  in_stock      boolean not null default true,
  lead_days     int not null default 3,
  product_url   text,
  last_seen_at  timestamptz not null default now(),
  unique (product_id, supplier_id, supplier_sku)
);
create index on supplier_offers (product_id, unit_price);
create index on supplier_offers (supplier_id);

-- --------------------------------------------------------------------------
-- Inventory
-- --------------------------------------------------------------------------
create table inventory_items (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid not null references practices(id) on delete cascade,
  location_id     uuid not null references locations(id) on delete cascade,
  product_id      uuid not null references products(id) on delete cascade,
  on_hand         numeric(10,2) not null default 0,
  par_level       numeric(10,2) not null default 0,   -- target stock
  reorder_point   numeric(10,2) not null default 0,   -- trigger for alerts
  reorder_qty     numeric(10,2) not null default 1,
  bin             text,                                -- "Op 3 drawer 2", "Sterile B"
  preferred_supplier_id uuid references suppliers(id) on delete set null,
  last_counted_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (location_id, product_id)
);
create index on inventory_items (practice_id);
create index on inventory_items (product_id);

-- Lot / expiry tracking — composites, anesthetics and sterilants all expire.
create table lots (
  id                 uuid primary key default gen_random_uuid(),
  practice_id        uuid not null references practices(id) on delete cascade,
  inventory_item_id  uuid not null references inventory_items(id) on delete cascade,
  lot_number         text,
  quantity           numeric(10,2) not null default 0,
  expires_at         date,
  received_at        timestamptz not null default now()
);
create index on lots (inventory_item_id);
create index on lots (expires_at);

create table stock_movements (
  id                uuid primary key default gen_random_uuid(),
  practice_id       uuid not null references practices(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  type              movement_type not null,
  quantity          numeric(10,2) not null,      -- signed: +received, -consumed
  lot_id            uuid references lots(id) on delete set null,
  reason            text,
  reference         text,                        -- order id, patient chart, etc.
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index on stock_movements (inventory_item_id, created_at desc);
create index on stock_movements (practice_id, created_at desc);

-- --------------------------------------------------------------------------
-- Capital equipment — chairs, autoclaves, compressors, imaging
-- --------------------------------------------------------------------------
create table assets (
  id                 uuid primary key default gen_random_uuid(),
  practice_id        uuid not null references practices(id) on delete cascade,
  location_id        uuid references locations(id) on delete set null,
  product_id         uuid references products(id) on delete set null,
  name               text not null,
  manufacturer       text,
  model              text,
  serial_number      text,
  status             asset_status not null default 'active',
  purchased_at       date,
  purchase_price     numeric(12,2),
  warranty_expires_at date,
  service_interval_days int,
  last_serviced_at   date,
  next_service_at    date,
  image_url          text,
  notes              text,
  created_at         timestamptz not null default now()
);
create index on assets (practice_id);
create index on assets (next_service_at);

create table asset_service_logs (
  id           uuid primary key default gen_random_uuid(),
  practice_id  uuid not null references practices(id) on delete cascade,
  asset_id     uuid not null references assets(id) on delete cascade,
  serviced_at  date not null default current_date,
  performed_by text,
  cost         numeric(10,2),
  summary      text,
  created_at   timestamptz not null default now()
);
create index on asset_service_logs (asset_id, serviced_at desc);

-- --------------------------------------------------------------------------
-- Purchasing
-- --------------------------------------------------------------------------
create table orders (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid not null references practices(id) on delete cascade,
  location_id    uuid references locations(id) on delete set null,
  supplier_id    uuid references suppliers(id) on delete set null,
  status         order_status not null default 'draft',
  reference      text,
  subtotal       numeric(12,2) not null default 0,
  shipping       numeric(12,2) not null default 0,
  tax            numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  -- What Dentin saved versus the most expensive offer at time of order.
  savings        numeric(12,2) not null default 0,
  placed_at      timestamptz,
  expected_at    date,
  received_at    timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index on orders (practice_id, created_at desc);

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  product_id    uuid not null references products(id) on delete restrict,
  supplier_id   uuid references suppliers(id) on delete set null,
  quantity      numeric(10,2) not null default 1,
  unit_price    numeric(12,4) not null default 0,
  pack_size     int not null default 1,
  line_total    numeric(12,2) not null default 0,
  -- Highest comparable offer when the line was priced, for savings math.
  benchmark_unit_price numeric(12,4),
  received_qty  numeric(10,2) not null default 0
);
create index on order_items (order_id);

-- --------------------------------------------------------------------------
-- Alerts & push
-- --------------------------------------------------------------------------
create table alerts (
  id                uuid primary key default gen_random_uuid(),
  practice_id       uuid not null references practices(id) on delete cascade,
  type              alert_type not null,
  severity          alert_severity not null default 'warning',
  title             text not null,
  body              text,
  inventory_item_id uuid references inventory_items(id) on delete cascade,
  asset_id          uuid references assets(id) on delete cascade,
  product_id        uuid references products(id) on delete cascade,
  is_read           boolean not null default false,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index on alerts (practice_id, created_at desc);
create index on alerts (practice_id, is_read) where resolved_at is null;

create table push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  practice_id  uuid not null references practices(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index on push_subscriptions (practice_id);

create table notification_prefs (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  practice_id       uuid not null references practices(id) on delete cascade,
  low_stock         boolean not null default true,
  expiring_lots     boolean not null default true,
  service_due       boolean not null default true,
  price_drops       boolean not null default true,
  order_updates     boolean not null default true,
  quiet_hours_start int not null default 19,   -- local hour, 0-23
  quiet_hours_end   int not null default 7
);

create table scan_events (
  id           uuid primary key default gen_random_uuid(),
  practice_id  uuid not null references practices(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  gtin         text not null,
  product_id   uuid references products(id) on delete set null,
  matched      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on scan_events (practice_id, created_at desc);

-- --------------------------------------------------------------------------
-- Triggers
-- --------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger practices_touch before update on practices
  for each row execute function public.touch_updated_at();
create trigger inventory_items_touch before update on inventory_items
  for each row execute function public.touch_updated_at();

-- Keep inventory_items.on_hand authoritative from the movement ledger.
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    update inventory_items
       set on_hand = greatest(0, on_hand + new.quantity),
           last_counted_at = case when new.type = 'counted' then now() else last_counted_at end
     where id = new.inventory_item_id;
  elsif (tg_op = 'DELETE') then
    update inventory_items
       set on_hand = greatest(0, on_hand - old.quantity)
     where id = old.inventory_item_id;
  end if;
  return null;
end $$;

create trigger stock_movements_apply
  after insert or delete on stock_movements
  for each row execute function public.apply_stock_movement();

-- New auth user → profile row.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------------
alter table practices          enable row level security;
alter table locations          enable row level security;
alter table profiles           enable row level security;
alter table categories         enable row level security;
alter table suppliers          enable row level security;
alter table products           enable row level security;
alter table supplier_offers    enable row level security;
alter table inventory_items    enable row level security;
alter table lots               enable row level security;
alter table stock_movements    enable row level security;
alter table assets             enable row level security;
alter table asset_service_logs enable row level security;
alter table orders             enable row level security;
alter table order_items        enable row level security;
alter table alerts             enable row level security;
alter table push_subscriptions enable row level security;
alter table notification_prefs enable row level security;
alter table scan_events        enable row level security;

-- Reference data: readable by any signed-in user.
create policy "read categories" on categories for select to authenticated using (true);
create policy "read suppliers"  on suppliers  for select to authenticated using (true);
create policy "read offers"     on supplier_offers for select to authenticated using (true);

-- Catalog: global rows plus the practice's own private items.
create policy "read products" on products for select to authenticated
  using (practice_id is null or practice_id = public.current_practice_id());
create policy "write own products" on products for all to authenticated
  using (practice_id = public.current_practice_id())
  with check (practice_id = public.current_practice_id());

-- Own profile.
create policy "read own profile" on profiles for select to authenticated
  using (id = auth.uid() or practice_id = public.current_practice_id());
create policy "update own profile" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "insert own profile" on profiles for insert to authenticated
  with check (id = auth.uid());

-- The practice the caller belongs to.
create policy "read own practice" on practices for select to authenticated
  using (id = public.current_practice_id());
create policy "update own practice" on practices for update to authenticated
  using (id = public.current_practice_id()) with check (id = public.current_practice_id());
create policy "create practice" on practices for insert to authenticated with check (true);

-- Everything else: straight practice_id match.
do $$
declare t text;
begin
  foreach t in array array[
    'locations', 'inventory_items', 'lots', 'stock_movements', 'assets',
    'asset_service_logs', 'orders', 'alerts', 'push_subscriptions',
    'notification_prefs', 'scan_events'
  ] loop
    execute format(
      'create policy "tenant access" on %I for all to authenticated
         using (practice_id = public.current_practice_id())
         with check (practice_id = public.current_practice_id())', t);
  end loop;
end $$;

-- order_items inherits its tenancy from the parent order.
create policy "tenant access" on order_items for all to authenticated
  using (exists (
    select 1 from orders o
     where o.id = order_items.order_id
       and o.practice_id = public.current_practice_id()))
  with check (exists (
    select 1 from orders o
     where o.id = order_items.order_id
       and o.practice_id = public.current_practice_id()));
