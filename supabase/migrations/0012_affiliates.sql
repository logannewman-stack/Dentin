-- ---------------------------------------------------------------------------
-- 0012 — affiliate codes, attribution, and what we owe.
--
-- A code like `tonyacode2026` does two jobs: it discounts the customer's
-- subscription (the discount itself lives in Stripe, as a promotion code of
-- the same name) and it records who sent them, so the referrer can be paid
-- every month the referral keeps paying us.
--
-- Codes are exclusive by construction: a practice carries exactly one
-- referral_code, and Stripe Checkout accepts exactly one promotion code per
-- subscription, so two codes can never stack.
-- ---------------------------------------------------------------------------

create table if not exists affiliates (
  code          text primary key,
  name          text not null,
  email         text,
  -- What we pay this affiliate per paying referral, per month.
  payout_cents  int  not null default 5000,
  active        boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now()
);

comment on table affiliates is
  'Referral partners. `code` must match a Stripe promotion code exactly (case-insensitive) so the customer discount and the attribution are the same word.';

-- One code per practice — the attribution, set when they subscribe.
alter table practices
  add column if not exists referral_code text references affiliates(code) on delete set null,
  add column if not exists referred_at   timestamptz;

create index if not exists practices_referral_code_idx on practices (referral_code);

-- Affiliate data is ours, not tenant data: no policies, so only the service
-- role reaches it.
alter table affiliates enable row level security;

-- ---------------------------------------------------------------------------
-- What each affiliate has earned.
--
-- Trials do not count: a referral is payable once they are actually paying
-- us, which is `active` or `past_due` (Stripe is still collecting), never
-- `trialing` or `canceled`.
-- ---------------------------------------------------------------------------
create or replace view v_affiliate_payouts
with (security_invoker = true) as
select
  a.code,
  a.name,
  a.email,
  a.active,
  a.payout_cents,
  count(p.id)                                                     as signups_total,
  count(*) filter (where s.status = 'trialing')                   as in_trial,
  count(*) filter (where s.status in ('active', 'past_due'))      as paying,
  count(*) filter (where s.status in ('canceled', 'unpaid'))      as churned,
  round(
    (count(*) filter (where s.status in ('active', 'past_due')) * a.payout_cents)::numeric / 100,
    2
  )                                                               as monthly_payout_usd
from affiliates a
left join practices p     on p.referral_code = a.code
left join subscriptions s on s.practice_id = p.id
group by a.code, a.name, a.email, a.active, a.payout_cents
order by monthly_payout_usd desc, a.code;

comment on view v_affiliate_payouts is
  'Per affiliate: signups, how many are still in trial, how many are paying, and this month''s payout. Read it in the SQL editor on payout day.';
