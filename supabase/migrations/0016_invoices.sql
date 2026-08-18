-- ===========================================================================
-- Dentin — invoice reconciliation and price creep
--
-- A quoted price and a billed price are not the same number, and the gap is
-- where a practice quietly loses thousands a year. Distributors raise
-- contracted items between orders, substitute a pack size, add a handling
-- fee, or bill a quantity nobody received. None of it is visible unless
-- someone lines the invoice up against the purchase order — which nobody
-- does, because it takes an afternoon.
--
-- So: drop the invoice in, and Dentin does the lining up. Each line is
-- checked against, in order of authority, the purchase order it came from,
-- the practice's contracted price, and what the same item cost last time.
-- ===========================================================================

-- Written to be safe to run twice: these go into the SQL editor by hand, and
-- a half-applied paste must be fixable by pasting the whole thing again.
create table if not exists invoices (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid not null references practices(id) on delete cascade,
  supplier_id    uuid references suppliers(id) on delete set null,
  -- The purchase order this invoice bills for, once matched. Null is normal:
  -- plenty of invoices arrive for orders placed on the vendor's own site.
  order_id       uuid references orders(id) on delete set null,

  invoice_number text,
  invoice_date   date,

  subtotal       numeric(12,2),
  shipping       numeric(12,2),
  tax            numeric(12,2),
  total          numeric(12,2),

  -- 'csv' | 'paste' | 'email' | 'manual'
  source         text not null default 'paste',
  -- 'review'   → differences found, waiting on a human
  -- 'clean'    → every line matched what was expected
  -- 'accepted' → a human looked and accepted it anyway
  -- 'disputed' → sent back to the rep
  status         text not null default 'review',

  -- What the reconciliation concluded, cached so a list screen does not have
  -- to re-run the arithmetic for every row.
  flagged_lines  int  not null default 0,
  overcharge     numeric(12,2) not null default 0,

  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists invoices_practice_idx on invoices (practice_id, invoice_date desc);
create index if not exists invoices_supplier_idx on invoices (practice_id, supplier_id);
create index if not exists invoices_order_idx on invoices (order_id) where order_id is not null;

alter table invoices enable row level security;

drop policy if exists "tenant access" on invoices;
create policy "tenant access" on invoices for all to authenticated
  using (practice_id = public.current_practice_id())
  with check (practice_id = public.current_practice_id());

-- --------------------------------------------------------------------------
-- The lines, with the comparison baked in.
--
-- practice_id is denormalized so RLS is a column check rather than a join on
-- every read — the same shape every other tenant table uses here.
-- --------------------------------------------------------------------------
create table if not exists invoice_lines (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references invoices(id) on delete cascade,
  practice_id    uuid not null references practices(id) on delete cascade,
  product_id     uuid references products(id) on delete set null,

  -- Identity as the invoice prints it, kept so an unmatched line can still be
  -- read by a human and matched later.
  description    text,
  gtin           text,
  mfr_sku        text,
  vendor_sku     text,

  quantity       numeric(10,2) not null default 1,
  pack_size      int not null default 1 check (pack_size > 0),
  unit_price     numeric(12,4),
  price          numeric(10,2),                       -- billed price per pack
  line_total     numeric(12,2),

  -- What Dentin expected this to cost, and where that expectation came from:
  -- 'order' | 'contract' | 'last_invoice'. Null source = nothing to compare
  -- against, which is information too — it means this item is new.
  expected_price  numeric(10,2),
  expected_source text,

  variance      numeric(12,2)
                generated always as (
                  case when expected_price is null then null
                       else round((price - expected_price) * quantity, 2) end
                ) stored,
  variance_pct  numeric(8,4)
                generated always as (
                  case when expected_price is null or expected_price = 0 then null
                       else round(((price - expected_price) / expected_price) * 100, 4) end
                ) stored,

  -- 'ok' | 'price_up' | 'price_down' | 'qty_mismatch' | 'not_on_order' | 'new_item'
  flag          text not null default 'ok',
  note          text
);

create index if not exists invoice_lines_invoice_idx on invoice_lines (invoice_id);
create index if not exists invoice_lines_product_idx on invoice_lines (practice_id, product_id);
create index if not exists invoice_lines_flag_idx on invoice_lines (practice_id, flag) where flag <> 'ok';

alter table invoice_lines enable row level security;

drop policy if exists "tenant access" on invoice_lines;
create policy "tenant access" on invoice_lines for all to authenticated
  using (practice_id = public.current_practice_id())
  with check (practice_id = public.current_practice_id());

-- --------------------------------------------------------------------------
-- Price creep: the same item, billed higher than last time, per vendor.
--
-- Tenant-scoped through the invoices table's own RLS (security_invoker), so
-- this can never show one practice another's invoice.
-- --------------------------------------------------------------------------
create or replace view v_price_creep
with (security_invoker = true) as
select
  l.practice_id,
  l.product_id,
  p.name          as product_name,
  i.supplier_id,
  s.name          as supplier_name,
  count(*)::int   as invoices,
  min(i.invoice_date) as first_seen,
  max(i.invoice_date) as last_seen,
  min(l.price)    as lowest_price,
  max(l.price)    as highest_price,
  (array_agg(l.price order by i.invoice_date desc, l.id desc))[1] as latest_price,
  (array_agg(l.price order by i.invoice_date asc,  l.id asc))[1]  as earliest_price
from invoice_lines l
join invoices i on i.id = l.invoice_id
left join products  p on p.id = l.product_id
left join suppliers s on s.id = i.supplier_id
where l.product_id is not null
  and l.price is not null
group by l.practice_id, l.product_id, p.name, i.supplier_id, s.name
having count(*) > 1;
