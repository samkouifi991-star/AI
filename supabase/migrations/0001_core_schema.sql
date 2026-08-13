-- Smart USA Visa — core schema
-- Run against a Supabase Postgres project (SQL Editor, or `supabase db push`).

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create type user_role as enum ('customer', 'admin', 'support', 'translator');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role user_role not null default 'customer',
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------------------------------------------------------------------------
-- application_types — the catalog of immigration applications (N-400, I-130, ...)
-- This is the "add a new form without redesigning the site" table.
-- ---------------------------------------------------------------------------
create table application_types (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  form_code text not null,
  name text not null,
  short_name text not null,
  goal_categories text[] not null default '{}',
  summary text not null,
  who_its_for text not null default '',
  eligibility_overview text not null default '',
  workflow_overview text not null default '',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_application_types_active on application_types (is_active, sort_order);

-- ---------------------------------------------------------------------------
-- form_versions — one official USCIS edition of a form. Field mappings live
-- here so a new edition never requires rewriting the questionnaire.
-- ---------------------------------------------------------------------------
create table form_versions (
  id uuid primary key default uuid_generate_v4(),
  application_type_id uuid not null references application_types (id) on delete cascade,
  edition_date date not null,
  is_current boolean not null default false,
  pdf_storage_path text,
  field_map jsonb not null default '{}'::jsonb, -- { "question_key": "PDF.Field.Name" }
  created_at timestamptz not null default now()
);

create unique index idx_one_current_version
  on form_versions (application_type_id)
  where is_current;

-- ---------------------------------------------------------------------------
-- sections — logical groupings of questions ("About You", "Travel History"...)
-- ---------------------------------------------------------------------------
create table sections (
  id uuid primary key default uuid_generate_v4(),
  application_type_id uuid not null references application_types (id) on delete cascade,
  key text not null,
  title text not null,
  description text,
  icon text,
  sort_order int not null default 0,
  unique (application_type_id, key)
);

-- ---------------------------------------------------------------------------
-- questions — the atomic unit the conversational wizard renders.
-- ---------------------------------------------------------------------------
create type question_type as enum (
  'text', 'textarea', 'date', 'select', 'radio_cards', 'yes_no',
  'name', 'address', 'number', 'email', 'phone', 'file'
);

create table questions (
  id uuid primary key default uuid_generate_v4(),
  section_id uuid not null references sections (id) on delete cascade,
  key text not null, -- stable key used by answers, pdf field_map, validation_rules
  prompt text not null,
  help_text text,
  type question_type not null,
  options jsonb, -- [{ value, label, help_text? }]
  required boolean not null default false,
  sort_order int not null default 0,
  placeholder text,
  -- Questions sharing the same (section_id, repeat_group) render as one
  -- repeatable "Add another" card (e.g. three name fields repeated once
  -- per prior alias). repeater_index on `answers` ties one instance
  -- together. Null = not part of a repeating group.
  repeat_group text,
  repeat_item_label text,
  validation jsonb, -- { minDate, maxDate, minLength, pattern, ... }
  show_if jsonb, -- [{ question_key, operator, value }] — AND'd together
  is_eligibility_question boolean not null default false,
  unique (section_id, key)
);

create index idx_questions_section on questions (section_id, sort_order);

-- ---------------------------------------------------------------------------
-- validation_rules — declarative rules the readiness engine evaluates
-- beyond simple per-question "required". Cross-field / cross-section checks.
-- ---------------------------------------------------------------------------
create table validation_rules (
  id uuid primary key default uuid_generate_v4(),
  application_type_id uuid not null references application_types (id) on delete cascade,
  key text not null,
  section_key text not null,
  description text not null,
  rule_type text not null, -- 'date_sequence' | 'coverage_gap' | 'conflicting_answers' | 'required_group'
  config jsonb not null default '{}'::jsonb,
  severity_on_fail text not null default 'needs_attention', -- 'needs_attention' | 'potential_issue'
  unique (application_type_id, key)
);

-- ---------------------------------------------------------------------------
-- document_requirements — the catalog a personalized checklist is built from
-- ---------------------------------------------------------------------------
create type document_category as enum ('identity', 'immigration', 'relationship', 'financial', 'other');

create table document_requirements (
  id uuid primary key default uuid_generate_v4(),
  application_type_id uuid not null references application_types (id) on delete cascade,
  key text not null,
  label text not null,
  category document_category not null,
  description text,
  required boolean not null default true,
  show_if jsonb, -- same shape as questions.show_if, evaluated against answers
  sort_order int not null default 0,
  unique (application_type_id, key)
);

-- ---------------------------------------------------------------------------
-- pricing & government_fees — centralized, admin-editable, never hardcoded
-- in components.
-- ---------------------------------------------------------------------------
create table pricing (
  id uuid primary key default uuid_generate_v4(),
  application_type_id uuid unique not null references application_types (id) on delete cascade,
  service_fee_cents int not null,
  promo_fee_cents int,
  promo_active boolean not null default false,
  print_mail_fee_cents int not null default 1995,
  updated_at timestamptz not null default now()
);

create table government_fees (
  id uuid primary key default uuid_generate_v4(),
  application_type_id uuid not null references application_types (id) on delete cascade,
  label text not null,
  amount_cents int not null,
  fee_waiver_available boolean not null default false,
  effective_date date not null default current_date,
  source_note text,
  updated_at timestamptz not null default now()
);

create table translation_pricing (
  id uuid primary key default uuid_generate_v4(),
  per_page_cents int not null default 2495,
  rush_surcharge_cents int not null default 1500,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- applications — one customer's in-progress or completed application
-- ---------------------------------------------------------------------------
create type application_status as enum (
  'eligibility', 'in_progress', 'ready_for_review', 'paid', 'package_ready', 'archived'
);

create table applications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users (id) on delete cascade,
  session_token uuid, -- set before account creation; claimed into user_id at signup
  application_type_id uuid not null references application_types (id),
  form_version_id uuid references form_versions (id),
  status application_status not null default 'eligibility',
  eligibility_flag text, -- 'clear' | 'needs_review'
  progress_percent int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_applications_user on applications (user_id);
create index idx_applications_session on applications (session_token);

-- ---------------------------------------------------------------------------
-- answers — one row per question (per repeater index for repeatable groups)
-- ---------------------------------------------------------------------------
create table answers (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications (id) on delete cascade,
  question_key text not null,
  repeater_index int not null default 0,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  unique (application_id, question_key, repeater_index)
);

create index idx_answers_application on answers (application_id);

-- ---------------------------------------------------------------------------
-- application_documents — the personalized, stateful checklist
-- ---------------------------------------------------------------------------
create type application_document_status as enum ('missing', 'uploaded', 'accepted', 'rejected');

create table application_documents (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications (id) on delete cascade,
  document_requirement_id uuid references document_requirements (id),
  custom_label text,
  status application_document_status not null default 'missing',
  storage_path text,
  original_filename text,
  needs_translation boolean,
  translation_id uuid,
  uploaded_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_app_documents_application on application_documents (application_id);

-- ---------------------------------------------------------------------------
-- translations — the certified-translation order workflow
-- ---------------------------------------------------------------------------
create type translation_status as enum (
  'requested', 'awaiting_payment', 'in_progress', 'completed', 'delivered'
);

create table translations (
  id uuid primary key default uuid_generate_v4(),
  application_document_id uuid not null references application_documents (id) on delete cascade,
  source_language text not null,
  page_count int not null default 1,
  price_cents int not null,
  status translation_status not null default 'requested',
  provider_name text,
  assigned_translator_id uuid references profiles (id),
  translated_storage_path text,
  certification_storage_path text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table application_documents
  add constraint fk_translation foreign key (translation_id) references translations (id) on delete set null;

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create type payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');

create table payments (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications (id) on delete cascade,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  amount_cents int not null,
  status payment_status not null default 'pending',
  line_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payments_application on payments (application_id);

-- ---------------------------------------------------------------------------
-- generated_packages — the final filing package
-- ---------------------------------------------------------------------------
create table generated_packages (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid unique not null references applications (id) on delete cascade,
  forms_storage_path text,
  instructions_storage_path text,
  checklist_storage_path text,
  cover_sheet_storage_path text,
  bundle_storage_path text,
  generated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- audit_logs — append-only, service-role writes only
-- ---------------------------------------------------------------------------
create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references auth.users (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_entity on audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- support_requests
-- ---------------------------------------------------------------------------
create table support_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users (id) on delete set null,
  application_id uuid references applications (id) on delete set null,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'open', -- 'open' | 'in_progress' | 'resolved'
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance trigger, reused across tables
-- ---------------------------------------------------------------------------
create function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_applications_updated_at before update on applications
  for each row execute procedure set_updated_at();
create trigger trg_payments_updated_at before update on payments
  for each row execute procedure set_updated_at();
create trigger trg_translations_updated_at before update on translations
  for each row execute procedure set_updated_at();
create trigger trg_application_types_updated_at before update on application_types
  for each row execute procedure set_updated_at();
