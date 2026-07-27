-- AI employee settings: the identity/persona/permission layer for Ava,
-- distinct from assistant_settings (0006), which covers call-audio
-- mechanics (voice speed, silence timeout, voicemail behavior, etc.).
-- This table answers "what is Ava allowed to do and how should she present
-- herself" — the business-facing knobs that feed lib/vapi-tools.ts's
-- buildSystemPrompt() and gate what the webhook dispatcher will actually do.

create table ai_employee_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,

  employee_name text not null default 'Ava',
  employee_title text not null default 'Virtual Receptionist',
  tone text not null default 'friendly' check (tone in ('friendly', 'professional', 'concise')),

  -- Permission gates. The system prompt and dispatcher both honor these —
  -- disabling one here means the corresponding tool is never offered or
  -- never allowed to complete, not just "discouraged" in the prompt.
  can_take_orders boolean not null default true,
  can_quote_prices boolean not null default true,
  can_book_appointments boolean not null default true,
  can_offer_discounts boolean not null default false,
  max_discount_percent numeric(5,2) not null default 0 check (max_discount_percent >= 0 and max_discount_percent <= 100),

  -- Where Ava sends anything she can't confidently handle. Distinct from
  -- call_routing_rules.fallback_transfer_number (0006), which governs
  -- routing at the phone-number level before a call even reaches Ava;
  -- this is the in-call "transfer_call" destination.
  escalation_phone_number text,

  updated_at timestamptz default now()
);

alter table ai_employee_settings enable row level security;
create policy "tenant isolation" on ai_employee_settings for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
