-- Row-level security. The browser client only ever authenticates as the
-- signed-in user (anon key + user JWT) — every table a customer can reach
-- is scoped to auth.uid(). Pre-account "Start Free" applications are read
-- and written exclusively through server Route Handlers using the service
-- role key, keyed off an httpOnly session cookie, so anonymous browser
-- access to `applications` is intentionally not granted here.

alter table profiles enable row level security;
alter table application_types enable row level security;
alter table form_versions enable row level security;
alter table sections enable row level security;
alter table questions enable row level security;
alter table validation_rules enable row level security;
alter table document_requirements enable row level security;
alter table pricing enable row level security;
alter table government_fees enable row level security;
alter table translation_pricing enable row level security;
alter table applications enable row level security;
alter table answers enable row level security;
alter table application_documents enable row level security;
alter table translations enable row level security;
alter table payments enable row level security;
alter table generated_packages enable row level security;
alter table audit_logs enable row level security;
alter table support_requests enable row level security;

create function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'support')
  );
$$;

create function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- profiles ---------------------------------------------------------------
create policy "profiles_select_own" on profiles for select using (id = auth.uid() or is_staff());
create policy "profiles_update_own" on profiles for update using (id = auth.uid());

-- catalog tables: public read, admin write ---------------------------------
create policy "application_types_read" on application_types for select using (is_active or is_staff());
create policy "application_types_write" on application_types for all using (is_admin()) with check (is_admin());

create policy "form_versions_read" on form_versions for select using (true);
create policy "form_versions_write" on form_versions for all using (is_admin()) with check (is_admin());

create policy "sections_read" on sections for select using (true);
create policy "sections_write" on sections for all using (is_admin()) with check (is_admin());

create policy "questions_read" on questions for select using (true);
create policy "questions_write" on questions for all using (is_admin()) with check (is_admin());

create policy "validation_rules_read" on validation_rules for select using (true);
create policy "validation_rules_write" on validation_rules for all using (is_admin()) with check (is_admin());

create policy "document_requirements_read" on document_requirements for select using (true);
create policy "document_requirements_write" on document_requirements for all using (is_admin()) with check (is_admin());

create policy "pricing_read" on pricing for select using (true);
create policy "pricing_write" on pricing for all using (is_admin()) with check (is_admin());

create policy "government_fees_read" on government_fees for select using (true);
create policy "government_fees_write" on government_fees for all using (is_admin()) with check (is_admin());

create policy "translation_pricing_read" on translation_pricing for select using (true);
create policy "translation_pricing_write" on translation_pricing for all using (is_admin()) with check (is_admin());

-- applications & children: owner-only, plus staff read/write ---------------
create policy "applications_owner_select" on applications
  for select using (user_id = auth.uid() or is_staff());
create policy "applications_owner_update" on applications
  for update using (user_id = auth.uid() or is_staff());
create policy "applications_owner_insert" on applications
  for insert with check (user_id = auth.uid());

create policy "answers_owner" on answers for all using (
  exists (select 1 from applications a where a.id = answers.application_id and (a.user_id = auth.uid() or is_staff()))
) with check (
  exists (select 1 from applications a where a.id = answers.application_id and a.user_id = auth.uid())
);

create policy "app_documents_owner" on application_documents for all using (
  exists (select 1 from applications a where a.id = application_documents.application_id and (a.user_id = auth.uid() or is_staff()))
) with check (
  exists (select 1 from applications a where a.id = application_documents.application_id and a.user_id = auth.uid())
);

create policy "translations_owner_select" on translations for select using (
  exists (
    select 1 from application_documents d join applications a on a.id = d.application_id
    where d.id = translations.application_document_id and (a.user_id = auth.uid() or is_staff())
  )
);
create policy "translations_staff_write" on translations for all using (is_staff()) with check (is_staff());

create policy "payments_owner_select" on payments for select using (
  exists (select 1 from applications a where a.id = payments.application_id and (a.user_id = auth.uid() or is_staff()))
);

create policy "generated_packages_owner_select" on generated_packages for select using (
  exists (select 1 from applications a where a.id = generated_packages.application_id and (a.user_id = auth.uid() or is_staff()))
);

-- audit logs: staff read only, writes are service-role only (no policy
-- grants insert to anon/authenticated, so only the service role — which
-- bypasses RLS — can write) ------------------------------------------------
create policy "audit_logs_staff_select" on audit_logs for select using (is_staff());

-- support requests ----------------------------------------------------------
create policy "support_requests_owner_select" on support_requests
  for select using (user_id = auth.uid() or is_staff());
create policy "support_requests_insert" on support_requests
  for insert with check (true);
create policy "support_requests_staff_update" on support_requests
  for update using (is_staff());
