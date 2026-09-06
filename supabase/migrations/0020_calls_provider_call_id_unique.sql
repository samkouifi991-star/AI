-- Reliability Phase 0, item 3 — a call is reported at most once.
--
-- handleEndOfCall (app/api/vapi/webhook/route.ts) and the Twilio-forwarding
-- fallback (app/api/twilio/voice/route.ts) both insert a `calls` row keyed
-- by the provider's own call id when no callRowId is already known.
-- Without this constraint, a redelivered end-of-call-report for a call
-- whose metadata.callRowId didn't round-trip could insert a second row
-- for the same real call. NULL is treated as distinct by Postgres, so
-- this is safe for the (rare) row with no provider_call_id at all.

create unique index if not exists calls_provider_call_id_unique
  on calls (provider_call_id) where provider_call_id is not null;
