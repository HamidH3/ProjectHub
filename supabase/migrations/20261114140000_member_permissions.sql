-- =============================================================================
-- ProjectHub — migration 17: per-person permissions
--
-- Admins can switch two extra powers on or off for each member (People page):
--   * can_create_projects  — make new projects. Whoever makes a project is
--     added to it as a member automatically, and can edit its details and
--     archive/restore it while they're on it. Switching the permission off
--     later only stops NEW projects: they stay on the projects they made until
--     an admin takes them off (People → Choose projects, or the project's
--     Members tab). Deleting projects stays admin-only.
--   * can_use_meeting_bot  — send the meeting recorder bot (checked by the
--     server, which is the only thing that can create recordings).
-- Admins can always do both. Only an admin can change these switches.
-- =============================================================================

alter table public.profiles
  add column can_create_projects boolean not null default false,
  add column can_use_meeting_bot boolean not null default false;

-- Only admins can change the switches (members can still edit their own name,
-- time zone, etc. as before). The server's secret key isn't a person, so it
-- passes.
create function private.protect_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not private.is_admin()
     and (new.can_create_projects is distinct from old.can_create_projects
          or new.can_use_meeting_bot is distinct from old.can_use_meeting_bot) then
    raise exception 'Only an admin can change what someone is allowed to do.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_permissions
  before update of can_create_projects, can_use_meeting_bot on public.profiles
  for each row execute function private.protect_permissions();

-- Can the signed-in person make a project right now?
create function private.can_create_projects()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
      or exists (select 1 from public.profiles where id = (select auth.uid()) and can_create_projects);
$$;

-- Whoever makes a project (if they aren't an admin, who sees everything
-- anyway) becomes a member of it, so they can open and work in it.
create function private.add_creator_as_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null
     and exists (select 1 from public.profiles where id = new.created_by and role <> 'admin') then
    insert into public.project_members (project_id, user_id, added_by)
    values (new.id, new.created_by, new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger projects_add_creator_as_member
  after insert on public.projects
  for each row execute function private.add_creator_as_member();

revoke execute on function private.protect_permissions() from public, anon, authenticated;
revoke execute on function private.add_creator_as_member() from public, anon, authenticated;
revoke execute on function private.can_create_projects() from public, anon;
grant execute on function private.can_create_projects() to authenticated;

drop policy "projects: admins create" on public.projects;
create policy "projects: admins and allowed members create"
  on public.projects for insert to authenticated
  with check (private.can_create_projects());

-- The person who made a project can edit it (details, archive/restore) while
-- they're still on it. Admins' own rule ("projects: admins update") stays.
create policy "projects: creators edit while on the project"
  on public.projects for update to authenticated
  using (created_by = (select auth.uid()) and private.is_project_member(id))
  with check (created_by = (select auth.uid()) and private.is_project_member(id));
