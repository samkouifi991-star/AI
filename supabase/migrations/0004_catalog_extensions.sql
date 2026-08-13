-- Extends application_types with fields the package page, admin editor, and
-- QA catalog need: per-application FAQs, CTA copy, an estimated completion
-- time, and pointers to supporting/associated forms (e.g. I-130A supports
-- I-130). All nullable or defaulted so existing rows and existing frontend
-- code never see an undefined/null field they can't handle.

alter table application_types
  add column if not exists faqs jsonb not null default '[]'::jsonb,
  add column if not exists cta_text text,
  add column if not exists estimated_minutes int,
  add column if not exists associated_forms jsonb not null default '[]'::jsonb;

comment on column application_types.faqs is 'Array of {question, answer} shown on the package page.';
comment on column application_types.cta_text is 'Overrides the default "Start Application" button label, e.g. "Start My I-751".';
comment on column application_types.estimated_minutes is 'Approximate minutes to complete the questionnaire, shown to set expectations.';
comment on column application_types.associated_forms is 'Array of {form_code, label, note} for supporting forms filed alongside this one (e.g. I-130A with I-130, G-1145 as a universal add-on).';
