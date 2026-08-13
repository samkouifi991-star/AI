-- Private storage buckets for uploaded documents and generated packages.
-- Both buckets are private; all access goes through signed URLs issued by
-- server code after an ownership check (see lib/storage.ts). The RLS
-- policies below are defense-in-depth in case a client ever holds a user
-- JWT and calls Storage directly.

insert into storage.buckets (id, name, public)
values ('application-documents', 'application-documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('generated-packages', 'generated-packages', false)
on conflict (id) do nothing;

-- Objects are stored as `{application_id}/{filename}` so ownership can be
-- checked by parsing the first path segment.
create policy "application_documents_owner_rw" on storage.objects
  for all using (
    bucket_id = 'application-documents'
    and exists (
      select 1 from applications a
      where a.id::text = (storage.foldername(name))[1]
        and (a.user_id = auth.uid() or is_staff())
    )
  )
  with check (
    bucket_id = 'application-documents'
    and exists (
      select 1 from applications a
      where a.id::text = (storage.foldername(name))[1]
        and a.user_id = auth.uid()
    )
  );

create policy "generated_packages_owner_read" on storage.objects
  for select using (
    bucket_id = 'generated-packages'
    and exists (
      select 1 from applications a
      where a.id::text = (storage.foldername(name))[1]
        and (a.user_id = auth.uid() or is_staff())
    )
  );
