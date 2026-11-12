-- =============================================================================
-- ProjectHub — migration 12: assigning to-dos to people
--
-- tasks.assignee_id has existed since migration 1; this makes it safe to use:
--   1. A to-do can only be assigned to someone who can open its project
--      (a member of that project, or an admin). The database checks this, so
--      it can't be got round from the browser.
--   2. When someone is taken off a project (or stops being an admin), their
--      to-dos in projects they can no longer open become unassigned.
--   3. Everyone signed in can see admins' names (not just teammates'), so a
--      member can assign a to-do to an admin and see when one is for them.
-- Anyone who can open a project can still create and edit its to-dos (as
-- before), so any member can assign a to-do to any other person on it.
-- =============================================================================

-- Can this person (not necessarily the one logged in) open this project?
create function private.user_can_open_project(p_user_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_user_id and role = 'admin')
      or exists (select 1 from public.project_members where project_id = p_project_id and user_id = p_user_id);
$$;

-- 1. Only assign to people who can open the project.
create function private.check_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null and not private.user_can_open_project(new.assignee_id, new.project_id) then
    raise exception 'That person can''t open this project, so the to-do can''t be assigned to them.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger tasks_check_assignee
  before insert or update of assignee_id, project_id on public.tasks
  for each row execute function private.check_task_assignee();

-- 2a. Taken off a project: unassign their to-dos there (unless they're an
--     admin, who can still open it). When a whole project is deleted there's
--     nothing left to update, which is fine.
create function private.unassign_removed_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks
     set assignee_id = null
   where project_id = old.project_id
     and assignee_id = old.user_id
     and not private.user_can_open_project(old.user_id, old.project_id);
  return old;
end;
$$;

create trigger project_members_unassign
  after delete on public.project_members
  for each row execute function private.unassign_removed_member();

-- 2b. No longer an admin: unassign their to-dos in projects they aren't on.
create function private.unassign_former_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks t
     set assignee_id = null
   where t.assignee_id = new.id
     and not exists (select 1 from public.project_members m where m.project_id = t.project_id and m.user_id = new.id);
  return new;
end;
$$;

create trigger profiles_unassign_former_admin
  after update of role on public.profiles
  for each row
  when (old.role = 'admin' and new.role <> 'admin')
  execute function private.unassign_former_admin();

revoke execute on function private.user_can_open_project(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.check_task_assignee()            from public, anon, authenticated;
revoke execute on function private.unassign_removed_member()        from public, anon, authenticated;
revoke execute on function private.unassign_former_admin()          from public, anon, authenticated;

-- 3. Admins' names are visible to everyone signed in (the existing rule still
--    lets you see yourself and the people on your projects).
create policy "profiles: everyone signed in sees admins"
  on public.profiles for select to authenticated
  using (role = 'admin');

create index tasks_assignee_idx on public.tasks (assignee_id) where assignee_id is not null;
