-- ===========================================================================
-- Dentin — compliance & training records
--
-- Tracks when the practice and its people were last certified (HIPAA
-- training, OSHA bloodborne pathogens, BLS, DEA registration, state license)
-- and when each must renew. This is record-keeping the practice controls:
-- Dentin never asserts what the law requires — cadences are whatever the
-- practice enters, and the UI tells them to confirm with their authority.
-- ===========================================================================

create table credentials (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid not null references practices(id) on delete cascade,

  name           text not null,          -- "HIPAA privacy & security training"
  holder         text not null,          -- "All staff" or a person's name
  authority      text,                   -- "OSHA 29 CFR 1910.1030"
  cadence_months integer not null check (cadence_months between 1 and 120),
  completed_at   timestamptz not null,
  expires_at     timestamptz not null,
  renew_url      text,                   -- where to go to renew
  notes          text,

  created_at     timestamptz not null default now()
);

alter table credentials enable row level security;

create policy "tenant access" on credentials for all to authenticated
  using (practice_id = public.current_practice_id())
  with check (practice_id = public.current_practice_id());

create index credentials_expiry on credentials (practice_id, expires_at);
