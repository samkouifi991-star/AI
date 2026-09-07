-- Fixes a real bug found while dry-run testing worker/src/call-lifecycle.ts
-- (Phase 1, step 9): migration 0020's unique index on calls was a PARTIAL
-- index (`where provider_call_id is not null`), and PostgREST's upsert
-- (what every .upsert(..., { onConflict: 'provider_call_id' }) call in
-- this codebase compiles down to) generates a plain
-- `ON CONFLICT (provider_call_id) DO UPDATE/NOTHING ...` with no
-- awareness of that predicate. Plain PostgreSQL genuinely cannot infer a
-- partial unique index from a conflict target that doesn't repeat the
-- same predicate — confirmed directly against local Postgres:
--
--   insert into calls (...) values (...)
--     on conflict (provider_call_id) do update set status = excluded.status
--     returning id;
--   -- ERROR: there is no unique or exclusion constraint matching the
--   --        ON CONFLICT specification
--
-- while the same statement with `where provider_call_id is not null`
-- repeated in the ON CONFLICT clause itself succeeds — but that's not
-- what PostgREST emits, so in practice every one of this codebase's three
-- existing calls.provider_call_id upserts (both in
-- app/api/twilio/voice/route.ts, and app/api/vapi/webhook/route.ts's
-- end-of-call path) would fail at runtime the first time a duplicate
-- delivery actually exercised the ON CONFLICT path — exactly the
-- scenario item 3 of Phase 0 built this constraint to handle safely.
--
-- The partial predicate was also unnecessary in the first place: a plain
-- (non-partial) unique constraint already treats NULL as distinct from
-- every other NULL in Postgres, which is the only reason 0020 used
-- `where provider_call_id is not null` at all. Dropping the partial index
-- and replacing it with a full unique constraint keeps the exact same
-- "multiple NULLs allowed" behavior while making it something PostgREST's
-- upsert can actually target.

drop index if exists calls_provider_call_id_unique;

alter table calls add constraint calls_provider_call_id_unique unique (provider_call_id);
