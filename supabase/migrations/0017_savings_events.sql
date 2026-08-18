-- ===========================================================================
-- Dentin — the value ledger
--
-- Every renewal comes down to one question: "is this worth $200 a month?"
-- Software that cannot answer it gets cancelled by a practice that was in
-- fact saving four times the subscription — they just could not see it.
--
-- Two kinds of entry, and the distinction is the honest part:
--
--   found    — money Dentin put in front of them. A cheaper source, an
--              overcharge on an invoice, a contract price above the market.
--              Real, but hypothetical until someone acts.
--   captured — money that actually moved. An order placed at the cheaper
--              price, an overcharge credited back.
--
-- The screen shows both, separately, and never adds them together. Claiming
-- found money as saved money is how software earns a reputation for lying.
-- ===========================================================================

-- Safe to run twice: this goes into the SQL editor by hand.
create table if not exists savings_events (
  id           uuid primary key default gen_random_uuid(),
  practice_id  uuid not null references practices(id) on delete cascade,

  kind         text not null check (kind in ('found', 'captured')),
  -- 'price_opportunity' | 'order' | 'invoice' | 'benchmark' | 'bulk'
  source       text not null,

  product_id   uuid references products(id) on delete set null,
  supplier_id  uuid references suppliers(id) on delete set null,
  order_id     uuid references orders(id)   on delete set null,

  amount       numeric(12,2) not null check (amount >= 0),
  detail       text,

  -- Natural key for the thing this entry describes: an order id, an invoice
  -- line id, "product:2026-08-18". Recording the same fact twice must not
  -- double the total, and a screen that recomputes on every visit will try.
  ref          text not null,

  occurred_at  timestamptz not null default now(),

  unique (practice_id, kind, source, ref)
);

create index if not exists savings_events_practice_idx
  on savings_events (practice_id, occurred_at desc);
create index if not exists savings_events_kind_idx
  on savings_events (practice_id, kind, occurred_at desc);

alter table savings_events enable row level security;

drop policy if exists "tenant access" on savings_events;
create policy "tenant access" on savings_events for all to authenticated
  using (practice_id = public.current_practice_id())
  with check (practice_id = public.current_practice_id());

-- --------------------------------------------------------------------------
-- Rolled up by month, which is how the screen draws it.
-- --------------------------------------------------------------------------
create or replace view v_savings_monthly
with (security_invoker = true) as
select
  practice_id,
  date_trunc('month', occurred_at)::date as month,
  kind,
  round(sum(amount), 2) as amount,
  count(*)::int as events
from savings_events
group by practice_id, date_trunc('month', occurred_at), kind;
