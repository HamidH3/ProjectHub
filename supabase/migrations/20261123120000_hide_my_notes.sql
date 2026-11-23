-- =============================================================================
-- ProjectHub — migration 20: hide your notes from everyone else
--
-- Each person can hide all of their own notes in a project ("My notes" →
-- Hide from others), and show them again at any time. While hidden:
--   * nobody else can read them (admins included), checked by the database
--   * nobody else can see or open the pictures pasted into them
-- AI notes are shared notes, so they're never hidden. Notes whose writer's
-- account is gone come back (the row below goes with the account), so an
-- admin can still tidy them up.
-- =============================================================================

create table public.hidden_note_writers (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.hidden_note_writers enable row level security;
revoke all on public.hidden_note_writers from anon;
grant select, insert, delete on public.hidden_note_writers to authenticated;

-- You only see, add and remove your own choice, in projects you can open.
create policy "hidden notes: see your own"
  on public.hidden_note_writers for select to authenticated
  using (user_id = (select auth.uid()));
create policy "hidden notes: hide your own"
  on public.hidden_note_writers for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_access_project(project_id));
create policy "hidden notes: show your own again"
  on public.hidden_note_writers for delete to authenticated
  using (user_id = (select auth.uid()));
create policy "2fa: code entered if enrolled"
  on public.hidden_note_writers as restrictive for all to authenticated
  using (private.mfa_ok()) with check (private.mfa_ok());

-- Has this writer hidden their notes in this project? (Reads the table above
-- without its rules, so it works for everyone else too; only says yes or no.)
create function private.notes_hidden(p_project_id uuid, p_writer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_writer is not null
     and p_writer <> (select auth.uid())
     and exists (
       select 1 from public.hidden_note_writers
       where project_id = p_project_id and user_id = p_writer
     );
$$;
revoke execute on function private.notes_hidden(uuid, uuid) from public, anon;
grant execute on function private.notes_hidden(uuid, uuid) to authenticated;

-- Reading notes: as before, minus other people's hidden personal notes.
drop policy "notes: read" on public.notes;
create policy "notes: read"
  on public.notes for select to authenticated
  using (
    private.can_access_project(project_id)
    and (kind = 'ai' or not private.notes_hidden(project_id, created_by))
  );

-- Pictures in notes live at {project}/note-images/{note}/…. Someone else's
-- picture is off limits while that note is hidden. (A picture whose note is
-- gone stays reachable, so deleting a note can still tidy up its pictures.)
create function private.note_picture_hidden(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.notes n
    where split_part(p_name, '/', 2) = 'note-images'
      and n.id::text = split_part(p_name, '/', 3)
      and n.kind = 'personal'
      and private.notes_hidden(n.project_id, n.created_by)
  );
$$;
revoke execute on function private.note_picture_hidden(text) from public, anon;
grant execute on function private.note_picture_hidden(text) to authenticated;

create policy "project-files: hidden notes' pictures stay private"
  on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'project-files' or not private.note_picture_hidden(name));
