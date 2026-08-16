-- ===========================================================================
-- Dentin — contracted pricing
--
-- The prices a practice has actually negotiated, per vendor. Distributors
-- supply these as a contracted-price file (CSV or EDI 832) on request; they
-- are what lands on the invoice, and they beat any public list price.
--
-- Kept separate from `supplier_offers` because these are practice-specific
-- and confidential, where offers are a shared catalog.
-- ===========================================================================

create table contract_prices (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid not null references practices(id) on delete cascade,
  supplier_id    uuid not null references suppliers(id) on delete cascade,
  product_id     uuid references products(id) on delete set null,

  -- Identity keys as they appear in the vendor's file. Kept even when
  -- product_id resolves, so a re-import can rematch without guessing.
  gtin           text,
  mfr_sku        text,
  vendor_sku     text,
  description    text,

  price          numeric(10,2) not null check (price >= 0),
  pack_size      int not null default 1 check (pack_size > 0),
  unit_price     numeric(12,4) generated always as (price / nullif(pack_size, 0)) stored,

  -- How this row was tied to a catalog product: 'gtin' | 'mpn' | 'name'.
  matched_by     text,

  effective_from date not null default current_date,
  effective_to   date,
  source         text,                                  -- 'csv', 'edi-832', 'manual'
  imported_at    timestamptz not null default now()
);

-- One row per practice + vendor + item identity + effective date. Postgres
-- forbids expressions inside a UNIQUE constraint, so this is a unique index.
create unique index contract_prices_identity
  on contract_prices (practice_id, supplier_id, coalesce(gtin, ''), coalesce(mfr_sku, ''), effective_from);

create index on contract_prices (practice_id, supplier_id);
create index on contract_prices (product_id);
create index on contract_prices (gtin) where gtin is not null;
create index on contract_prices (mfr_sku) where mfr_sku is not null;

alter table contract_prices enable row level security;

create policy "tenant access" on contract_prices for all to authenticated
  using (practice_id = public.current_practice_id())
  with check (practice_id = public.current_practice_id());

-- --------------------------------------------------------------------------
-- Effective price per product per vendor: contracted where the practice has
-- it, catalog price otherwise. This is what comparison should read.
-- --------------------------------------------------------------------------
create view v_effective_prices
with (security_invoker = true) as
with contracted as (
  select distinct on (cp.product_id, cp.supplier_id)
    cp.product_id,
    cp.supplier_id,
    cp.price,
    cp.pack_size,
    cp.unit_price,
    cp.vendor_sku,
    cp.matched_by,
    true as is_contract_price
  from contract_prices cp
  where cp.practice_id = public.current_practice_id()
    and cp.product_id is not null
    and cp.effective_from <= current_date
    and (cp.effective_to is null or cp.effective_to >= current_date)
  order by cp.product_id, cp.supplier_id, cp.effective_from desc
)
select
  o.product_id,
  o.supplier_id,
  s.name              as supplier_name,
  s.slug              as supplier_slug,
  coalesce(c.price, o.price)           as price,
  coalesce(c.pack_size, o.pack_size)   as pack_size,
  coalesce(c.unit_price, o.unit_price) as unit_price,
  coalesce(c.vendor_sku, o.supplier_sku) as vendor_sku,
  coalesce(c.matched_by, 'gtin')       as matched_by,
  coalesce(c.is_contract_price, false) as is_contract_price,
  o.in_stock,
  o.lead_days,
  o.product_url,
  (a.id is not null)                   as has_account
from supplier_offers o
join suppliers s on s.id = o.supplier_id
left join contracted c
       on c.product_id = o.product_id
      and c.supplier_id = o.supplier_id
left join supplier_accounts a
       on a.supplier_id = o.supplier_id
      and a.practice_id = public.current_practice_id();
