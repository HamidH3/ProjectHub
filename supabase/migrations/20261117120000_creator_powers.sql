-- =============================================================================
-- ProjectHub — migration 19: what a project's creator can do
--
-- Whoever made a project (and is still on it) can now also:
--   * delete it
--   * add people to it, and take people off it (not themselves: an admin
--     does that, so a project is never left with nobody looking after it)
-- These follow who made the project, not the "Create projects" switch: they
-- keep these powers over projects they made even after the switch is turned
-- off, and lose them if an admin takes them off the project.
-- Inviting new people by email stays admin-only.
-- =============================================================================

-- Did the signed-in person make this project, and are they still on it?
create function private.is_project_creator(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id and created_by = (select auth.uid())
  ) and private.is_project_member(p_project_id);
$$;

revoke execute on function private.is_project_creator(uuid) from public, anon;
grant execute on function private.is_project_creator(uuid) to authenticated;

create policy "projects: creators delete while on the project"
  on public.projects for delete to authenticated
  using (private.is_project_creator(id));

create policy "members: project creators add"
  on public.project_members for insert to authenticated
  with check (private.is_project_creator(project_id));

create policy "members: project creators remove others"
  on public.project_members for delete to authenticated
  using (private.is_project_creator(project_id) and user_id <> (select auth.uid()));

-- For the app: "may I delete this project?" asked before anything is removed
-- (a project's stored files are cleared before the project itself).
create function public.can_delete_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or private.is_project_creator(p_project_id);
$$;

revoke execute on function public.can_delete_project(uuid) from public, anon;
grant execute on function public.can_delete_project(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notes: "last edited" only changes when the note itself changes (its title,
-- text or drawing), not when it's moved in the list. The editor only saves
-- over the version it has on screen, so moving the note you're writing in must
-- not look like someone else edited it.
-- ---------------------------------------------------------------------------
drop trigger if exists notes_updated_at on public.notes;
create trigger notes_updated_at
  before update on public.notes
  for each row
  when (
    old.title is distinct from new.title
    or old.content is distinct from new.content
    or old.drawing is distinct from new.drawing
  )
  execute function public.set_updated_at();
