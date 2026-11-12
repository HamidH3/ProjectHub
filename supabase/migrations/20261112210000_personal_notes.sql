-- =============================================================================
-- ProjectHub — migration 13: everyone has their own notes in a project
--
-- Before: anyone on a project could edit or delete any of its notes.
-- Now:
--   * Everyone on a project can still READ all of its notes.
--   * Only the person who wrote a note (notes.created_by, which the database
--     fills in itself and can't be faked) can edit, move or delete it.
--   * Notes whose writer's account was deleted (created_by is empty) can be
--     edited or deleted by admins, so they can be tidied up.
--   * A subpage must belong to the same person as the page it sits in, so
--     nobody can add pages inside someone else's notes.
-- =============================================================================

drop policy "notes: edit"   on public.notes;
drop policy "notes: delete" on public.notes;

create policy "notes: edit your own"
  on public.notes for update to authenticated
  using (
    private.can_access_project(project_id)
    and (created_by = (select auth.uid()) or (created_by is null and private.is_admin()))
  )
  with check (
    private.can_access_project(project_id)
    and (created_by = (select auth.uid()) or (created_by is null and private.is_admin()))
  );

create policy "notes: delete your own"
  on public.notes for delete to authenticated
  using (
    private.can_access_project(project_id)
    and (created_by = (select auth.uid()) or (created_by is null and private.is_admin()))
  );

-- A subpage and its parent page must have the same writer. Runs after
-- notes_stamp_author (triggers run in name order), so created_by is filled in.
create function private.check_note_same_writer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_writer uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  select created_by into parent_writer from public.notes where id = new.parent_id;
  if parent_writer is distinct from new.created_by then
    raise exception 'A subpage must belong to the same person as its parent page.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger notes_subpage_same_writer
  before insert or update of parent_id, created_by on public.notes
  for each row execute function private.check_note_same_writer();

revoke execute on function private.check_note_same_writer() from public, anon, authenticated;

create index notes_project_writer_idx on public.notes (project_id, created_by);
