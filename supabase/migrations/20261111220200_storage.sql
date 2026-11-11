-- =============================================================================
-- ProjectHub — migration 3 of 3: file storage
-- A private bucket for project files. Each file is stored at
--   {project_id}/{file_id}
-- and only people who can access that project can upload, see or delete it.
-- Downloads use short-lived signed links created by the server.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,                       -- private: no public URLs, ever
  52428800,                    -- 50 MB per file
  array[
    'application/pdf',                                                           -- PDF
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   -- DOCX
    'application/msword',                                                        -- DOC
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         -- XLSX
    'text/csv', 'application/vnd.ms-excel',                                      -- CSV (Windows often labels CSV as Excel)
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', -- PPTX
    'text/plain',                                                                -- TXT
    'image/png',                                                                 -- PNG
    'image/jpeg',                                                                -- JPG / JPEG
    'application/zip', 'application/x-zip-compressed'                            -- ZIP
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Reads the project id from the first part of a storage path.
-- Returns null (and so denies access) for anything that isn't a valid id.
create function public.project_id_from_path(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke execute on function public.project_id_from_path(text) from public, anon;
grant  execute on function public.project_id_from_path(text) to authenticated;

-- Policies on Supabase's storage table, limited to our bucket.
create policy "project-files: read if project access"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-files'
    and public.can_access_project(public.project_id_from_path(name))
  );

create policy "project-files: upload if project access"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and public.can_access_project(public.project_id_from_path(name))
  );

create policy "project-files: replace if project access"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'project-files'
    and public.can_access_project(public.project_id_from_path(name))
  )
  with check (
    bucket_id = 'project-files'
    and public.can_access_project(public.project_id_from_path(name))
  );

create policy "project-files: delete if project access"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-files'
    and public.can_access_project(public.project_id_from_path(name))
  );

-- Same 2FA gate as the tables, for this bucket only.
create policy "project-files: 2fa code entered if enrolled"
  on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'project-files' or public.mfa_ok())
  with check (bucket_id <> 'project-files' or public.mfa_ok());
