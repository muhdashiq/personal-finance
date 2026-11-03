-- =============================================================================
-- Supabase Storage: private buckets for receipts, statements and documents.
-- Object names must start with "<family_id>/". Reading an object requires a
-- visible attachments/statement_imports row for it, so receipts of private
-- transactions stay private.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts', 'receipts', false, 10485760,
    array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']),
  ('statements', 'statements', false, 20971520,
    array['application/pdf', 'text/csv', 'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('documents', 'documents', false, 20971520,
    array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create or replace function private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function private.try_uuid(text) to authenticated, service_role;

create policy "family files: read" on storage.objects for select to authenticated
  using (
    bucket_id in ('receipts', 'statements', 'documents')
    and private.is_family_member(private.try_uuid((storage.foldername(name))[1]))
    and (
      exists (select 1 from public.attachments a where a.bucket = bucket_id and a.storage_path = name)
      or (bucket_id = 'statements'
          and exists (select 1 from public.statement_imports i where i.storage_path = name))
    )
  );

create policy "family files: upload" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('receipts', 'statements', 'documents')
    and private.can_write(private.try_uuid((storage.foldername(name))[1]))
  );

create policy "family files: delete" on storage.objects for delete to authenticated
  using (
    bucket_id in ('receipts', 'documents')
    and private.can_write(private.try_uuid((storage.foldername(name))[1]))
    and (
      private.is_family_admin(private.try_uuid((storage.foldername(name))[1]))
      or exists (
        select 1 from public.attachments a
        where a.bucket = bucket_id and a.storage_path = name and a.uploaded_by = (select auth.uid())
      )
      -- an upload whose attachments row was never created (failed save)
      or not exists (select 1 from public.attachments a where a.bucket = bucket_id and a.storage_path = name)
    )
  );
