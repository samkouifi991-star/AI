-- Reliability Phase 0, item 6 — supports flipping book_appointment's
-- ordering to "insert the DB row first, create the calendar event
-- second" (lib/ava-dispatcher.ts). calendar_sync_status makes that
-- intermediate state visible and reconcilable instead of silent:
--   not_applicable — no calendar connected for this business, or practice
--                    mode (nothing to sync)
--   pending        — DB row exists, the calendar event hasn't been
--                    created yet (or its creation failed) — reconcilable
--   synced         — the calendar event was created and its id recorded
--   failed         — calendar creation was attempted and failed; the
--                    appointment itself is still real and kept

alter table appointments add column if not exists calendar_sync_status text not null default 'not_applicable'
  check (calendar_sync_status in ('not_applicable', 'pending', 'synced', 'failed'));
