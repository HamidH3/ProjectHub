-- =============================================================================
-- ProjectHub — migration 7: folders for project files
--
-- Folders belong to one project and can sit inside other folders. A file can
-- be in a folder (folder_id) or at the top level (folder_id is null).
-- The app deletes the files inside a folder before deleting the folder; as a
-- safety net, if a folder disappears any file still in it moves to the top
-- level rather than vanishing (on delete set null).
--
-- Same protection as everything else: only people who can open the project
-- can see or change its folders, the 2FA rule applies, and logged-out
-- visitors get nothing.
-- =============================================================================

create table public.folders (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  parent_id   uuid references public.folders (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index folders_project_parent_idx on public.folders (project_id, parent_id);
-- No two folders with the same name (ignoring capitals) side by side.
create unique index folders_unique_name on public.folders (
  project_id,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);

alter table public.files add column folder_id uuid references public.folders (id) on delete set null;
create index files_project_folder_idx on public.files (project_id, folder_id);

create trigger folders_updated_at   before update on public.folders for each row execute function public.set_updated_at();
create trigger folders_stamp_author before insert on public.folders for each row execute function public.stamp_author();

-- A folder must stay in its project, sit inside a folder of the same project,
-- and can't be moved inside one of its own subfolders.
create function public.check_folder_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_project uuid;
begin
  if tg_op = 'UPDATE' and new.project_id <> old.project_id then
    raise exception 'A folder cannot move to another project' using errcode = 'check_violation';
  end if;

  if new.parent_id is null then
    return new;
  end if;

  select project_id into parent_project from public.folders where id = new.parent_id;
  if parent_project is null then
    raise exception 'Parent folder not found' using errcode = 'foreign_key_violation';
  end if;
  if parent_project <> new.project_id then
    raise exception 'A folder must be in the same project as its parent' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and exists (
    with recursive ancestors as (
      select id, parent_id from public.folders where id = new.parent_id
      union
      select f.id, f.parent_id from public.folders f join ancestors a on f.id = a.parent_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'A folder cannot be moved inside one of its own subfolders' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger folders_check_parent
  before insert or update of parent_id, project_id on public.folders
  for each row execute function public.check_folder_parent();

-- A file can only go in a folder of its own project, and can't change project
-- (its stored file lives under that project's folder in Storage).
create function public.check_file_folder()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  folder_project uuid;
begin
  if tg_op = 'UPDATE' and (new.project_id <> old.project_id or new.storage_path <> old.storage_path) then
    raise exception 'A file cannot move to another project' using errcode = 'check_violation';
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

create trigger files_check_folder
  before insert or update of folder_id, project_id, storage_path on public.files
  for each row execute function public.check_file_folder();

-- Security ---------------------------------------------------------------------
revoke all on public.folders from anon;
grant select, insert, update, delete on public.folders to authenticated;

alter table public.folders enable row level security;

create policy "2fa: code entered if enrolled" on public.folders
  as restrictive for all to authenticated
  using (private.mfa_ok()) with check (private.mfa_ok());

create policy "folders: read"   on public.folders for select to authenticated using (private.can_access_project(project_id));
create policy "folders: create" on public.folders for insert to authenticated with check (private.can_access_project(project_id));
create policy "folders: edit"   on public.folders for update to authenticated using (private.can_access_project(project_id)) with check (private.can_access_project(project_id));
create policy "folders: delete" on public.folders for delete to authenticated using (private.can_access_project(project_id));
