-- =============================================================================
-- ProjectHub — migration 8: readable file names in Supabase
--
-- 1. Files are now stored as  {project id}/{file id}/{file name}  (the app
--    does this), so you can recognise them when browsing Storage. Renaming a
--    file in ProjectHub renames it in Storage too, so its storage path may now
--    change, but only within its own  {project id}/{file id}/  folder.
--
-- 2. A read-only table view, "file_overview", lists every file with its
--    project name, folder path, real name, size and who uploaded it. Open it
--    in the Table Editor. It follows the same security rules as the files
--    themselves (security_invoker), so the app's users only ever see files
--    from their own projects.
-- =============================================================================

create or replace function public.check_file_folder()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  folder_project uuid;
begin
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id then
      raise exception 'A file cannot move to another project' using errcode = 'check_violation';
    end if;
    -- Renaming moves the stored file, but it must stay in its own folder.
    if new.storage_path <> old.storage_path
       and new.storage_path not like new.project_id::text || '/' || new.id::text || '/_%' then
      raise exception 'A file''s storage path must stay under its project and file id' using errcode = 'check_violation';
    end if;
  end if;

  if new.folder_id is null then
    return new;
  end if;

  select project_id into folder_project from public.folders where id = new.folder_id;
  if folder_project is null or folder_project <> new.project_id then
    raise exception 'That folder is not in this project' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create view public.file_overview
with (security_invoker = true)
as
with recursive folder_paths as (
  select id, name::text as path
  from public.folders
  where parent_id is null
  union all
  select f.id, p.path || ' / ' || f.name
  from public.folders f
  join folder_paths p on f.parent_id = p.id
)
select
  pr.name                                   as project,
  coalesce(fp.path, '(top level)')          as folder,
  fi.name                                   as file_name,
  pg_size_pretty(fi.size_bytes)             as size,
  coalesce(pf.full_name, pf.username)       as uploaded_by,
  fi.created_at                             as uploaded_at,
  fi.mime_type,
  fi.size_bytes,
  fi.storage_path,
  fi.id                                     as file_id,
  fi.project_id,
  fi.folder_id
from public.files fi
join public.projects pr on pr.id = fi.project_id
left join folder_paths fp on fp.id = fi.folder_id
left join public.profiles pf on pf.id = fi.uploaded_by;

comment on view public.file_overview is 'Every file with its project, folder path and real name. Read-only.';

revoke all on public.file_overview from anon, public;
grant select on public.file_overview to authenticated;
