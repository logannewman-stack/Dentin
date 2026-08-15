-- ===========================================================================
-- Dentin — vendor payments
--
-- Lets a practice settle supplier invoices from inside the app. This stores
-- payment *state* (methods on file, what an order owes, when it was paid).
-- Actual money movement rides on the practice's connected processor — that
-- integration lives server-side (see docs/INTEGRATIONS.md) and is outside
-- this schema's trust boundary, which is why no card numbers, bank accounts,
-- or processor secrets are ever stored here: only display labels.
-- ===========================================================================

create table payment_methods (
  id           uuid primary key default gen_random_uuid(),
  practice_id  uuid not null references practices(id) on delete cascade,

  kind         text not null check (kind in ('bank', 'card')),
  -- Display-only descriptors ("Operating account", "···· 4821"). The
  -- processor token that can actually move money lives with the processor.
  label        text not null,
  detail       text,
  processor_token text,      -- opaque reference into the processor's vault
  is_default   boolean not null default false,

  created_at   timestamptz not null default now()
);

alter table payment_methods enable row level security;

create policy "tenant access" on payment_methods for all to authenticated
  using (practice_id = public.current_practice_id())
  with check (practice_id = public.current_practice_id());

-- One default per practice, enforced rather than assumed.
create unique index payment_methods_one_default
  on payment_methods (practice_id) where is_default;

-- Orders learn what they owe and when it was settled.
alter table orders
  add column payment_status  text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'refunded')),
  add column payment_due_at  timestamptz,
  add column paid_at         timestamptz,
  add column payment_method_id uuid references payment_methods(id) on delete set null;

-- Payables at a glance: everything submitted-or-later that is not settled.
create or replace view v_payables as
  select
    o.id,
    o.reference,
    o.supplier_id,
    s.name as supplier_name,
    o.total,
    o.payment_status,
    o.payment_due_at,
    o.payment_due_at < now() as overdue
  from orders o
  join suppliers s on s.id = o.supplier_id
  where o.practice_id = public.current_practice_id()
    and o.status not in ('draft', 'cancelled')
    and o.payment_status = 'unpaid';
