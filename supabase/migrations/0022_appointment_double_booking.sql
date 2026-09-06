-- Reliability Phase 0, item 5 — two callers must not both succeed in
-- booking the same business's same start time. Scoped to the statuses
-- that actually hold the slot, so a cancelled appointment never blocks a
-- new booking into the same time.

create unique index if not exists appointments_no_double_book
  on appointments (business_id, scheduled_at) where status in ('scheduled', 'confirmed');
