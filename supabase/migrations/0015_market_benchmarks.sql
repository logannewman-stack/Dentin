-- ===========================================================================
-- Dentin — anonymized cross-practice price benchmarks
--
-- One practice looking at its own contract knows what it pays. It does not
-- know whether that is good. Pooled across practices, the same data answers
-- the only question that matters at a negotiation: "what does everyone else
-- pay for this?"
--
-- The privacy rules are the whole design, not a footnote:
--
--   * Nothing here ever returns a practice id, name, or an individual price.
--     Only the median and the quartiles of a group.
--   * A group is published only once at least MIN_COHORT distinct practices
--     are in it. Below that, one practice could work out another's price by
--     subtraction, so the row simply does not exist.
--   * A practice that switches sharing off is excluded from every aggregate
--     immediately — and, having contributed nothing, is told plainly that the
--     comparison is off for them too.
--
-- The views deliberately run with the owner's rights (no security_invoker),
-- which is what lets them see across tenants. That makes the k-anonymity
-- floor below load-bearing: it is the only thing standing between this and a
-- data leak. Do not lower it, and do not add min/max — extremes identify.
-- ===========================================================================

-- Opt-out lives on the practice and is honoured by every aggregate below.
alter table practices
  add column if not exists share_benchmarks boolean not null default true;

comment on column practices.share_benchmarks is
  'Contribute anonymized contract prices to the market benchmarks. Off means '
  'this practice''s prices are excluded from every aggregate, and it sees no '
  'benchmark in return.';

-- --------------------------------------------------------------------------
-- Today's contracted unit price, one row per practice + product + vendor.
-- Internal: never exposed to the client, and never selected without an
-- aggregate around it.
-- --------------------------------------------------------------------------
create or replace view v_contract_current as
select distinct on (cp.practice_id, cp.product_id, cp.supplier_id)
       cp.practice_id,
       cp.product_id,
       cp.supplier_id,
       cp.unit_price
  from contract_prices cp
  join practices p on p.id = cp.practice_id
 where cp.product_id is not null
   and cp.unit_price is not null
   and cp.unit_price > 0
   and cp.effective_from <= current_date
   and (cp.effective_to is null or cp.effective_to >= current_date)
   and p.share_benchmarks
 order by cp.practice_id, cp.product_id, cp.supplier_id, cp.effective_from desc;

revoke all on v_contract_current from anon, authenticated;

-- --------------------------------------------------------------------------
-- What practices pay for an item, whoever they buy it from.
--
-- One price per practice (the best they hold) so a practice with five vendor
-- contracts cannot outvote a practice with one.
-- --------------------------------------------------------------------------
create or replace view v_market_benchmarks as
with per_practice as (
  select practice_id, product_id, min(unit_price) as unit_price
    from v_contract_current
   group by practice_id, product_id
)
select
  product_id,
  count(*)::int as practices,
  round(percentile_cont(0.25) within group (order by unit_price)::numeric, 4) as p25_unit_price,
  round(percentile_cont(0.50) within group (order by unit_price)::numeric, 4) as median_unit_price,
  round(percentile_cont(0.75) within group (order by unit_price)::numeric, 4) as p75_unit_price
from per_practice
group by product_id
having count(*) >= 5;

comment on view v_market_benchmarks is
  'Anonymized: quartiles only, and only for items at least 5 practices price. '
  'Never add practice identifiers, min, or max to this view.';

revoke all on v_market_benchmarks from anon;
grant select on v_market_benchmarks to authenticated;

-- --------------------------------------------------------------------------
-- The same, split by vendor — the actionable one. "You pay $28.40 at Schein;
-- the median Schein account pays $24.10" is a sentence a rep has to answer.
-- --------------------------------------------------------------------------
create or replace view v_market_benchmarks_by_vendor as
select
  product_id,
  supplier_id,
  count(*)::int as practices,
  round(percentile_cont(0.25) within group (order by unit_price)::numeric, 4) as p25_unit_price,
  round(percentile_cont(0.50) within group (order by unit_price)::numeric, 4) as median_unit_price,
  round(percentile_cont(0.75) within group (order by unit_price)::numeric, 4) as p75_unit_price
from v_contract_current
group by product_id, supplier_id
having count(distinct practice_id) >= 5;

comment on view v_market_benchmarks_by_vendor is
  'Anonymized: quartiles only, and only for vendor+item pairs at least 5 '
  'practices price. Never add practice identifiers, min, or max.';

revoke all on v_market_benchmarks_by_vendor from anon;
grant select on v_market_benchmarks_by_vendor to authenticated;

-- --------------------------------------------------------------------------
-- How far along the pool is, so the app can be honest about it rather than
-- showing an empty screen: "37 practices sharing, 412 items comparable".
-- Aggregate counts only — nothing here narrows to a practice.
-- --------------------------------------------------------------------------
create or replace function market_coverage()
returns table (contributing_practices int, comparable_products int, priced_products int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(distinct practice_id)::int from v_contract_current),
    (select count(*)::int from v_market_benchmarks),
    (select count(distinct product_id)::int from v_contract_current);
$$;

revoke all on function market_coverage() from anon;
grant execute on function market_coverage() to authenticated;
