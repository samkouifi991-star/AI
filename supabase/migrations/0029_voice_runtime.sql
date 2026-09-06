-- Phase 1 groundwork — the per-business runtime abstraction the whole
-- direct-voice-runtime migration hangs off of. Defaults every existing
-- and new business to 'vapi', so this column changes nothing about how
-- any live call is handled today; 'direct' only becomes a real, working
-- option once the always-running voice worker (Twilio Media Streams ->
-- OpenAI Realtime -> the same dispatchTool()) actually exists.

alter table businesses add column if not exists voice_runtime text not null default 'vapi'
  check (voice_runtime in ('vapi', 'direct'));
