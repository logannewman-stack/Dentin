-- ---------------------------------------------------------------------------
-- 0008 — stock counts are signed corrections.
--
-- record_movement treated every non-consumption type as an absolute add, so
-- a stocktake that counted DOWN (the app sends new-count minus old-count,
-- e.g. -4) RAISED on-hand instead of lowering it. Counts now apply their
-- delta as sent; consumption still draws down; receives still add.
-- ---------------------------------------------------------------------------

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

  -- Consumption and waste draw stock down; a count is a signed correction
  -- (new minus old) and must keep its sign; everything else adds.
  v_signed := case
    when p_type in ('consumed', 'wasted') then -abs(p_quantity)
    when p_type = 'counted' then p_quantity
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
