-- Redesigns certified translation pricing from per-document to a flat fee
-- per application: one application_translation_packages row covers every
-- required document on that application that needs translation. Individual
-- translations keep their own operational record (one job per document)
-- but only the package itself is ever charged.

-- ---------------------------------------------------------------------------
-- translation_pricing: add the flat-fee product. Per-page/rush columns are
-- left in place (unused by the new flow) rather than dropped, so nothing
-- that already reads them breaks.
-- ---------------------------------------------------------------------------
alter table translation_pricing
  add column if not exists flat_fee_cents int not null default 7500;

comment on column translation_pricing.flat_fee_cents is 'Certified Document Translation Package price — flat fee per application, not per document.';

-- ---------------------------------------------------------------------------
-- application_translation_packages — one per application, ever. The unique
-- constraint on application_id is what makes "$75 x N applications, never
-- x N documents" structurally impossible rather than just a UI convention.
-- ---------------------------------------------------------------------------
create table application_translation_packages (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null unique references applications (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  price_cents int not null,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  purchased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_translation_packages_updated_at before update on application_translation_packages
  for each row execute procedure set_updated_at();

-- ---------------------------------------------------------------------------
-- translations: extend the existing per-document job table so it can hang
-- off a package (or, for a customer-supplied translation, off nothing —
-- self-provided translations are free and never require a package).
-- ---------------------------------------------------------------------------
alter table translations
  add column if not exists translation_package_id uuid references application_translation_packages (id) on delete set null,
  add column if not exists application_id uuid references applications (id) on delete cascade,
  add column if not exists document_label text,
  add column if not exists self_provided boolean not null default false;

-- Backfill application_id for any pre-existing rows from the old
-- per-document flow (join through application_documents); safe no-op if
-- the table is empty.
update translations t
set application_id = d.application_id
from application_documents d
where t.application_document_id = d.id
  and t.application_id is null;

alter table translations alter column application_id set not null;

-- Replace the old 5-state enum-backed status with the operational states
-- this workflow actually needs. Converting the column to text + a check
-- constraint (rather than a new enum) keeps this a single reversible
-- migration.
alter table translations alter column status drop default;
alter table translations alter column status type text using status::text;
alter table translations add constraint translations_status_check check (
  status in ('required', 'awaiting_upload', 'submitted', 'in_progress', 'completed', 'needs_attention')
);
alter table translations alter column status set default 'required';

-- price_cents no longer applies per-document; the package carries the
-- price. Keep the column (nullable) so historical rows aren't destroyed.
alter table translations alter column price_cents drop not null;

create index if not exists idx_translations_package on translations (translation_package_id);
create index if not exists idx_translations_application on translations (application_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table application_translation_packages enable row level security;

create policy "translation_packages_owner_all" on application_translation_packages
  for all using (
    user_id = auth.uid() or is_staff()
  ) with check (
    user_id = auth.uid() or is_staff()
  );

-- The original translations policy only ever granted staff write access,
-- which meant a real signed-in customer could never insert their own job
-- row (e.g. a self-provided translation upload) — fixed here now that the
-- table carries application_id directly, which makes an owner-scoped
-- policy straightforward.
drop policy if exists "translations_staff_write" on translations;
drop policy if exists "translations_owner_select" on translations;

create policy "translations_owner_all" on translations
  for all using (
    exists (select 1 from applications a where a.id = translations.application_id and (a.user_id = auth.uid() or is_staff()))
  ) with check (
    exists (select 1 from applications a where a.id = translations.application_id and (a.user_id = auth.uid() or is_staff()))
  );
