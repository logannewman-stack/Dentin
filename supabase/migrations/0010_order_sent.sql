-- ---------------------------------------------------------------------------
-- 0010 — an order Dentin issued is not an order the vendor has received.
--
-- Dentin builds and prices the purchase order; the practice still transmits
-- it to the distributor (portal, phone, or their rep). Recording when that
-- happened is the difference between "we think this is coming" and knowing.
-- ---------------------------------------------------------------------------

alter table orders
  add column if not exists sent_at     timestamptz,
  add column if not exists sent_method text;

comment on column orders.sent_at is
  'When the practice actually transmitted this PO to the vendor. Null means Dentin has issued it but nobody has sent it yet.';
comment on column orders.sent_method is
  'How it was sent — portal, phone, email, rep — for the practice''s own record.';
