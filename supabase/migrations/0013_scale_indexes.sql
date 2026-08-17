-- ---------------------------------------------------------------------------
-- 0013 — indexes the app needs once there is real traffic.
--
-- Each of these backs a query that runs on a hot path and had no index to
-- stand on. Harmless on a small database; the difference between instant and
-- a sequential scan once thousands of practices share these tables.
-- ---------------------------------------------------------------------------

-- The duplicate-order guard asks "is this product already inbound?" by
-- product_id across every practice's order lines. Only order_id was indexed.
create index if not exists order_items_product_idx on order_items (product_id);

-- Team invites and re-attachment look a person up by email.
create index if not exists profiles_email_idx on profiles (lower(email));

-- The billing gate reads a practice's subscription on every app load, and
-- the payout view filters by status.
create index if not exists subscriptions_status_idx on subscriptions (status);

-- The daily sweep pages through practices in a stable order.
create index if not exists practices_created_idx on practices (created_at);

-- Vendor accounts are read on nearly every pricing call.
create index if not exists supplier_accounts_practice_idx
  on supplier_accounts (practice_id, supplier_id);

-- Lot expiry alerts scan by practice and date together.
create index if not exists lots_practice_expiry_idx
  on lots (practice_id, expires_at) where expires_at is not null;
