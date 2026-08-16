-- ===========================================================================
-- Dentin — SaaS subscription state (Stripe)
--
-- One row per practice mirroring what Stripe knows: who the customer is,
-- which subscription, its status and period. Stripe is the source of truth;
-- this table is written ONLY by the webhook handler (service role) so the
-- browser can read billing state instantly without ever holding a Stripe
-- key. No card data lives here — Stripe keeps the vault.
-- ===========================================================================

create table subscriptions (
  practice_id            uuid primary key references practices(id) on delete cascade,
  stripe_customer_id     text not null,
  stripe_subscription_id text,
  -- Stripe's own vocabulary: trialing | active | past_due | canceled |
  -- incomplete | incomplete_expired | unpaid | paused
  status                 text not null default 'incomplete',
  price_id               text,
  quantity               int  not null default 1,          -- locations billed
  current_period_end     timestamptz,
  trial_end              timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table subscriptions enable row level security;

-- The practice can see its own billing state; only the service role (the
-- Stripe webhook) may write it.
create policy "read own subscription" on subscriptions for select to authenticated
  using (practice_id = public.current_practice_id());

create index subscriptions_customer on subscriptions (stripe_customer_id);
