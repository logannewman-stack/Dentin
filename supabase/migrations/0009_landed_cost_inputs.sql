-- ---------------------------------------------------------------------------
-- 0009 — the inputs landed-cost math needs, in the database.
--
-- The engine was reading vendor shipping economics and the practice's tax
-- rule from bundled demo constants, so the landed-cost comparison could not
-- render for a live practice. These columns give every deployment the same
-- facts: what a vendor charges to ship, what they require per order, and how
-- the practice is taxed.
-- ---------------------------------------------------------------------------

alter table suppliers
  add column if not exists order_minimum numeric(10,2) not null default 0,
  add column if not exists surcharge     numeric(10,2) not null default 0;

comment on column suppliers.order_minimum is
  'Smallest order this vendor accepts, in dollars. 0 = no minimum.';
comment on column suppliers.surcharge is
  'Flat per-order handling/fuel surcharge added on top of freight.';

alter table practices
  add column if not exists tax_rate     numeric(6,4) not null default 0,
  add column if not exists tax_shipping boolean      not null default false,
  add column if not exists tax_exempt   boolean      not null default false;

comment on column practices.tax_rate is
  'Ship-to sales tax rate as a fraction, e.g. 0.0825 for 8.25%.';
comment on column practices.tax_shipping is
  'True where the ship-to state taxes freight as part of the sale.';
comment on column practices.tax_exempt is
  'True for practices holding a valid exemption certificate.';

-- The distributors Dentin prices today, with their published terms.
update suppliers set order_minimum = 50 where slug = 'henry-schein';
update suppliers set order_minimum = 75 where slug = 'patterson';
update suppliers set order_minimum = 25, surcharge = 2.50 where slug = 'dental-city';
