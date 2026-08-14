-- ===========================================================================
-- Dentin — supplier accounts
--
-- Which suppliers a practice can actually order from today, and on what
-- terms. Everything in `suppliers` that a practice has no row for here is a
-- "new" vendor: still priced, but ordering needs an account first.
-- ===========================================================================

create table supplier_accounts (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid not null references practices(id) on delete cascade,
  supplier_id    uuid not null references suppliers(id) on delete cascade,
  account_number text,
  rep_name       text,
  rep_phone      text,
  rep_email      text,
  terms          text,                                   -- 'Net 30', 'Credit card'
  is_preferred   boolean not null default false,
  notes          text,
  opened_at      date,
  created_at     timestamptz not null default now(),
  unique (practice_id, supplier_id)
);
create index on supplier_accounts (practice_id);

alter table supplier_accounts enable row level security;

create policy "tenant access" on supplier_accounts for all to authenticated
  using (practice_id = public.current_practice_id())
  with check (practice_id = public.current_practice_id());

-- --------------------------------------------------------------------------
-- Vendor roster: every supplier, annotated with whether this practice can buy
-- from it today and what it has spent there.
-- --------------------------------------------------------------------------
create view v_vendors
with (security_invoker = true) as
select
  s.id            as supplier_id,
  s.slug,
  s.name,
  s.logo_url,
  s.website,
  s.free_ship_over,
  s.flat_ship_fee,
  s.avg_lead_days,
  s.notes,
  a.id is not null as has_account,
  a.account_number,
  a.rep_name,
  a.rep_phone,
  a.rep_email,
  a.terms,
  coalesce(a.is_preferred, false) as is_preferred,
  a.opened_at,
  coalesce(o.order_count, 0)  as order_count,
  coalesce(o.total_spend, 0)  as total_spend,
  o.last_ordered_at
from suppliers s
left join supplier_accounts a
       on a.supplier_id = s.id
      and a.practice_id = public.current_practice_id()
left join (
  select
    supplier_id,
    count(*)          as order_count,
    sum(total)        as total_spend,
    max(placed_at)    as last_ordered_at
  from orders
  where practice_id = public.current_practice_id()
    and status <> 'cancelled'
  group by supplier_id
) o on o.supplier_id = s.id;

-- --------------------------------------------------------------------------
-- Competitive pricing: per tracked item, the best price available from a
-- supplier the practice HAS an account with, versus the best available
-- anywhere. A positive `unlockable_savings` is money that needs a new
-- account opened before it can be captured.
-- --------------------------------------------------------------------------
create view v_price_opportunities
with (security_invoker = true) as
with account_best as (
  select distinct on (o.product_id)
    o.product_id, o.supplier_id, o.unit_price, o.price, o.lead_days
  from supplier_offers o
  join supplier_accounts a
    on a.supplier_id = o.supplier_id
   and a.practice_id = public.current_practice_id()
  where o.in_stock
  order by o.product_id, o.unit_price asc, o.lead_days asc
),
market_best as (
  select distinct on (o.product_id)
    o.product_id, o.supplier_id, o.unit_price, o.price, o.lead_days
  from supplier_offers o
  where o.in_stock
  order by o.product_id, o.unit_price asc, o.lead_days asc
)
select
  ii.id            as inventory_item_id,
  ii.practice_id,
  ii.product_id,
  p.name           as product_name,
  p.brand,
  p.unit,
  ii.on_hand,
  ii.par_level,
  greatest(ii.reorder_qty, ii.par_level - ii.on_hand) as suggested_qty,
  ab.supplier_id   as account_supplier_id,
  sa.name          as account_supplier_name,
  ab.unit_price    as account_unit_price,
  ab.price         as account_price,
  mb.supplier_id   as market_supplier_id,
  sm.name          as market_supplier_name,
  mb.unit_price    as market_unit_price,
  mb.price         as market_price,
  mb.lead_days     as market_lead_days,
  (mb.supplier_id <> ab.supplier_id) as needs_new_account,
  round(
    greatest(0, coalesce(ab.unit_price, 0) - mb.unit_price)
      * greatest(ii.reorder_qty, ii.par_level - ii.on_hand)
      * coalesce(nullif(p.pack_size, 0), 1),
    2
  ) as unlockable_savings
from inventory_items ii
join products p        on p.id = ii.product_id
left join account_best ab on ab.product_id = ii.product_id
left join market_best  mb on mb.product_id = ii.product_id
left join suppliers    sa on sa.id = ab.supplier_id
left join suppliers    sm on sm.id = mb.supplier_id
where ii.practice_id = public.current_practice_id();
