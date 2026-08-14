-- ===========================================================================
-- Dentin — derived views and RPCs
-- Stock health, burn rate, and the best-price engine.
-- ===========================================================================

-- Cheapest in-stock offer per product. Ties break toward the faster supplier.
create view best_offers
with (security_invoker = true) as
select distinct on (o.product_id)
  o.product_id,
  o.id            as offer_id,
  o.supplier_id,
  s.name          as supplier_name,
  s.slug          as supplier_slug,
  s.logo_url      as supplier_logo,
  o.price,
  o.pack_size,
  o.unit_price,
  o.lead_days,
  o.product_url
from supplier_offers o
join suppliers s on s.id = o.supplier_id
where o.in_stock
order by o.product_id, o.unit_price asc, o.lead_days asc;

-- Spread across the market for a product — powers "you save X".
create view offer_stats
with (security_invoker = true) as
select
  product_id,
  min(unit_price)                 as min_unit_price,
  max(unit_price)                 as max_unit_price,
  round(avg(unit_price), 4)       as avg_unit_price,
  count(*)                        as offer_count
from supplier_offers
where in_stock
group by product_id;

-- Trailing 30-day burn, straight off the movement ledger.
create view consumption_30d
with (security_invoker = true) as
select
  inventory_item_id,
  sum(abs(quantity)) as consumed_30d,
  round(sum(abs(quantity)) / 30.0, 3) as daily_burn
from stock_movements
where type in ('consumed', 'wasted')
  and created_at > now() - interval '30 days'
group by inventory_item_id;

-- The screen-ready inventory row: product, health, cover, and best price.
create view v_inventory_status
with (security_invoker = true) as
select
  ii.id,
  ii.practice_id,
  ii.location_id,
  ii.product_id,
  ii.on_hand,
  ii.par_level,
  ii.reorder_point,
  ii.reorder_qty,
  ii.bin,
  ii.preferred_supplier_id,
  ii.last_counted_at,
  l.name  as location_name,
  p.name  as product_name,
  p.brand,
  p.manufacturer,
  p.image_url,
  p.unit,
  p.gtin,
  p.is_equipment,
  c.name  as category_name,
  c.slug  as category_slug,
  c.icon  as category_icon,
  case
    when ii.on_hand <= 0                    then 'out'
    when ii.on_hand <= ii.reorder_point     then 'low'
    when ii.par_level > 0
     and ii.on_hand  < ii.par_level         then 'below_par'
    else 'ok'
  end as stock_status,
  case
    when ii.par_level > 0
    then least(999, round((ii.on_hand / ii.par_level) * 100))
    else null
  end as pct_of_par,
  coalesce(cd.daily_burn, 0) as daily_burn,
  case
    when coalesce(cd.daily_burn, 0) > 0
    then round(ii.on_hand / cd.daily_burn)
    else null
  end as days_of_cover,
  bo.unit_price     as best_unit_price,
  bo.price          as best_price,
  bo.pack_size      as best_pack_size,
  bo.supplier_id    as best_supplier_id,
  bo.supplier_name  as best_supplier_name,
  bo.lead_days      as best_lead_days,
  os.max_unit_price,
  os.offer_count,
  case
    when os.max_unit_price is not null and bo.unit_price is not null
    then round(os.max_unit_price - bo.unit_price, 4)
    else 0
  end as unit_savings
from inventory_items ii
join products   p  on p.id = ii.product_id
join locations  l  on l.id = ii.location_id
left join categories     c  on c.id = p.category_id
left join best_offers    bo on bo.product_id = ii.product_id
left join offer_stats    os on os.product_id = ii.product_id
left join consumption_30d cd on cd.inventory_item_id = ii.id;

-- --------------------------------------------------------------------------
-- RPCs
-- --------------------------------------------------------------------------

-- Barcode → product. Checks the practice's private catalog first, then global.
create or replace function public.resolve_gtin(p_gtin text)
returns table (
  product_id   uuid,
  name         text,
  brand        text,
  image_url    text,
  unit         text,
  category_name text,
  in_inventory boolean,
  inventory_item_id uuid,
  on_hand      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.brand,
    p.image_url,
    p.unit,
    c.name,
    ii.id is not null,
    ii.id,
    ii.on_hand
  from products p
  left join categories c on c.id = p.category_id
  left join inventory_items ii
         on ii.product_id = p.id
        and ii.practice_id = public.current_practice_id()
  where p.gtin = p_gtin
    and (p.practice_id is null or p.practice_id = public.current_practice_id())
  order by p.practice_id nulls last
  limit 1;
$$;

-- Compare every supplier for one product, cheapest first.
create or replace function public.compare_offers(p_product_id uuid)
returns table (
  offer_id      uuid,
  supplier_id   uuid,
  supplier_name text,
  supplier_logo text,
  price         numeric,
  pack_size     int,
  unit_price    numeric,
  lead_days     int,
  in_stock      boolean,
  product_url   text,
  is_best       boolean,
  savings_vs_worst numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with ranked as (
    select
      o.id, o.supplier_id, s.name, s.logo_url, o.price, o.pack_size,
      o.unit_price, o.lead_days, o.in_stock, o.product_url,
      min(o.unit_price) filter (where o.in_stock) over ()  as best_up,
      max(o.unit_price) filter (where o.in_stock) over ()  as worst_up
    from supplier_offers o
    join suppliers s on s.id = o.supplier_id
    where o.product_id = p_product_id
  )
  select
    id, supplier_id, name, logo_url, price, pack_size, unit_price, lead_days,
    in_stock, product_url,
    (unit_price = best_up and in_stock),
    round(coalesce(worst_up, unit_price) - unit_price, 4)
  from ranked
  order by in_stock desc, unit_price asc, lead_days asc;
$$;

-- Record a stock movement and let the ledger trigger update on_hand.
create or replace function public.record_movement(
  p_inventory_item_id uuid,
  p_type              movement_type,
  p_quantity          numeric,
  p_reason            text default null,
  p_lot_number        text default null,
  p_expires_at        date default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_practice uuid;
  v_lot      uuid;
  v_signed   numeric;
  v_id       uuid;
begin
  select practice_id into v_practice
    from inventory_items where id = p_inventory_item_id;

  if v_practice is null or v_practice <> public.current_practice_id() then
    raise exception 'inventory item not found';
  end if;

  -- Consumption and waste draw stock down; everything else adds.
  v_signed := case
    when p_type in ('consumed', 'wasted') then -abs(p_quantity)
    else abs(p_quantity)
  end;

  if p_type = 'received' and (p_lot_number is not null or p_expires_at is not null) then
    insert into lots (practice_id, inventory_item_id, lot_number, quantity, expires_at)
    values (v_practice, p_inventory_item_id, p_lot_number, abs(p_quantity), p_expires_at)
    returning id into v_lot;
  end if;

  insert into stock_movements
    (practice_id, inventory_item_id, type, quantity, lot_id, reason, created_by)
  values
    (v_practice, p_inventory_item_id, p_type, v_signed, v_lot, p_reason, auth.uid())
  returning id into v_id;

  return v_id;
end $$;

-- Everything a buyer should reorder right now, with the cheapest source.
create or replace function public.reorder_suggestions(p_location_id uuid default null)
returns table (
  inventory_item_id uuid,
  product_id     uuid,
  product_name   text,
  brand          text,
  image_url      text,
  on_hand        numeric,
  par_level      numeric,
  suggested_qty  numeric,
  stock_status   text,
  days_of_cover  numeric,
  best_supplier_id uuid,
  best_supplier_name text,
  best_unit_price numeric,
  line_cost      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    v.id,
    v.product_id,
    v.product_name,
    v.brand,
    v.image_url,
    v.on_hand,
    v.par_level,
    greatest(v.reorder_qty, v.par_level - v.on_hand) as suggested_qty,
    v.stock_status,
    v.days_of_cover,
    v.best_supplier_id,
    v.best_supplier_name,
    v.best_unit_price,
    round(greatest(v.reorder_qty, v.par_level - v.on_hand) * coalesce(v.best_unit_price, 0), 2)
  from v_inventory_status v
  where v.practice_id = public.current_practice_id()
    and (p_location_id is null or v.location_id = p_location_id)
    and v.stock_status in ('out', 'low', 'below_par')
  order by
    case v.stock_status when 'out' then 0 when 'low' then 1 else 2 end,
    v.days_of_cover nulls last;
$$;
