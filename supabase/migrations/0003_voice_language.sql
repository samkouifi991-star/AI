-- Voice & Language module
-- Per-business voice/language configuration, plus call-level language
-- tracking so every detection/translation/switch is auditable.

alter table businesses add column if not exists vapi_assistant_id text;

create table business_voice_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,

  -- Which TTS/voice vendor this business's selected voice comes from.
  -- Must match one of the provider keys registered in lib/voice/index.ts
  -- (e.g. 'elevenlabs', 'openai'). Adding a vendor never requires a
  -- migration — this column just stores whichever key is active.
  voice_provider text not null default 'openai',
  voice_id text not null default 'alloy',
  voice_name text,             -- cached display name, refreshed on save

  default_language text not null default 'en',      -- ISO 639-1
  additional_languages text[] not null default '{}', -- ISO 639-1 codes
  auto_detect_language boolean not null default false,
  confirm_before_switch boolean not null default true,

  updated_at timestamptz not null default now()
);

alter table business_voice_settings enable row level security;
create policy "tenant isolation" on business_voice_settings for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- Extend calls with language tracking. active_language is the language
-- currently being spoken in (starts at the business default, changes if
-- the caller switches). detected_language is what the language-detection
-- function last identified from the caller's speech, which may briefly
-- differ from active_language while a confirmation is pending.
alter table calls add column if not exists active_language text default 'en';
alter table calls add column if not exists detected_language text;
alter table calls add column if not exists translated_transcript text;

-- One row per detection/switch decision during a call — this is the audit
-- trail the spec asks for ("log detected language, transcript,
-- translation, and summary"), at the granularity of individual language
-- events rather than only the call-level summary.
create table language_detection_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  call_id uuid references calls(id) on delete cascade,
  utterance text,                    -- what the caller said, that triggered detection
  detected_language text not null,   -- ISO 639-1
  confidence numeric(4,3),
  action text not null,              -- 'detected_only' | 'asked_to_confirm' | 'switched' | 'declined'
  translated_response text,          -- the AI's reply after translation, if any
  created_at timestamptz not null default now()
);

alter table language_detection_events enable row level security;
create policy "tenant isolation" on language_detection_events for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
