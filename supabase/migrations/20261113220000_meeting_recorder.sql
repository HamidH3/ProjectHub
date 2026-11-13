-- =============================================================================
-- ProjectHub — migration 16: meeting recorder and AI notes
--
-- 1. AI notes: ordinary notes with kind = 'ai'. They appear in their own
--    "AI notes" section, and ANYONE on the project can edit or delete them
--    (personal notes stay editable by their writer only). AI notes are always
--    top-level pages: no subpages inside them, and they can't be moved under
--    another note. A note's kind can't be changed after it's made.
--
-- 2. meeting_recordings: one row per meeting the recorder bot (Recall.ai) was
--    sent to. Only the person who sent the bot can see or delete the row. The
--    rows are written only by the server (secret key), after it has checked
--    the request, so nobody can fake a transcript or a summary.
--
-- 3. assign_recording(): the "which project is this for?" step. The person who
--    sent the bot picks a project they can open; once the summary is ready it
--    becomes an AI note there (straight away if it's ready already).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AI notes
-- -----------------------------------------------------------------------------
alter table public.notes
  add column kind text not null default 'personal' check (kind in ('personal', 'ai'));

create index notes_project_kind_idx on public.notes (project_id, kind);

create function private.check_note_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    raise exception 'A note can''t be changed into an AI note, or back.' using errcode = 'check_violation';
  end if;
  if new.kind = 'ai' and new.parent_id is not null then
    raise exception 'AI notes can''t be subpages.' using errcode = 'check_violation';
  end if;
  if new.parent_id is not null
     and exists (select 1 from public.notes where id = new.parent_id and kind = 'ai') then
    raise exception 'AI notes can''t have subpages.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger notes_check_kind
  before insert or update of kind, parent_id on public.notes
  for each row execute function private.check_note_kind();

revoke execute on function private.check_note_kind() from public, anon, authenticated;

-- These sit alongside "notes: edit your own" / "notes: delete your own"
-- (either may allow a change). The 2FA policy on notes still applies to both.
create policy "notes: anyone on the project edits AI notes"
  on public.notes for update to authenticated
  using (kind = 'ai' and private.can_access_project(project_id))
  with check (kind = 'ai' and private.can_access_project(project_id));

create policy "notes: anyone on the project deletes AI notes"
  on public.notes for delete to authenticated
  using (kind = 'ai' and private.can_access_project(project_id));

-- -----------------------------------------------------------------------------
-- 2. meeting_recordings
-- -----------------------------------------------------------------------------
create table public.meeting_recordings (
  id               uuid primary key default gen_random_uuid(),
  created_by       uuid not null references public.profiles (id) on delete cascade,
  bot_id           text unique check (char_length(bot_id) between 1 and 100),
  meeting_url      text not null check (char_length(meeting_url) between 1 and 2000),
  title            text not null default 'Meeting' check (char_length(btrim(title)) between 1 and 200),
  project_id       uuid references public.projects (id) on delete set null,
  status           text not null default 'joining' check (status in
                     ('joining', 'waiting_room', 'recording', 'processing', 'summarising', 'ready', 'filed', 'failed')),
  status_detail    text check (char_length(status_detail) <= 500),
  transcript_text  text check (octet_length(transcript_text) <= 1500000),
  summary_title    text check (char_length(summary_title) <= 200),
  summary_doc      jsonb check (octet_length(summary_doc::text) <= 2000000),
  summary_text     text check (octet_length(summary_text) <= 1000000),
  note_id          uuid references public.notes (id) on delete set null,
  claimed_at       timestamptz,   -- when the server started working on the transcript
  ended_at         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index meeting_recordings_owner_idx on public.meeting_recordings (created_by, created_at desc);

create trigger meeting_recordings_updated_at
  before update on public.meeting_recordings
  for each row execute function public.set_updated_at();

alter table public.meeting_recordings enable row level security;

create policy "2fa: code entered if enrolled" on public.meeting_recordings
  as restrictive for all to authenticated using (private.mfa_ok()) with check (private.mfa_ok());

create policy "recordings: see your own"
  on public.meeting_recordings for select to authenticated
  using (created_by = (select auth.uid()));

create policy "recordings: delete your own"
  on public.meeting_recordings for delete to authenticated
  using (created_by = (select auth.uid()));

-- No insert/update policies: only the server (secret key) writes these rows.
revoke all on public.meeting_recordings from anon;
revoke insert, update, truncate, references, trigger on public.meeting_recordings from authenticated;
grant select, delete on public.meeting_recordings to authenticated;
grant all on public.meeting_recordings to service_role;

-- -----------------------------------------------------------------------------
-- 3. Turning a finished summary into an AI note
-- -----------------------------------------------------------------------------

-- Makes the AI note if the recording is ready and has a project its owner can
-- still open. Returns the new note's id, or null if it isn't ready yet.
-- Server only (the webhook calls it when a summary finishes for a recording
-- that already has a project).
create function public.file_recording_note(p_recording_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.meeting_recordings;
  new_note uuid;
begin
  select * into r from public.meeting_recordings where id = p_recording_id for update;
  if not found or r.status <> 'ready' or r.project_id is null or r.summary_doc is null then
    return null;
  end if;
  if not private.user_can_open_project(r.created_by, r.project_id) then
    raise exception 'You can''t add notes to that project.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.notes (project_id, title, content, content_text, kind, created_by, updated_by)
  values (r.project_id, left(coalesce(nullif(btrim(r.summary_title), ''), r.title), 200), r.summary_doc,
          coalesce(r.summary_text, ''), 'ai', r.created_by, r.created_by)
  returning id into new_note;

  update public.meeting_recordings
     set status = 'filed', note_id = new_note, status_detail = null
   where id = p_recording_id;
  return new_note;
end;
$$;

-- "Which project is this meeting for?" Called by the person who sent the bot.
-- Returns the AI note's id if it was made now, or null if the summary is still
-- being written (it's added to the project automatically when it's done).
create function public.assign_recording(p_recording_id uuid, p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or not private.mfa_ok() then
    raise exception 'Not allowed.' using errcode = 'insufficient_privilege';
  end if;
  if p_project_id is null or not private.can_access_project(p_project_id) then
    raise exception 'You can''t add notes to that project.' using errcode = 'insufficient_privilege';
  end if;

  update public.meeting_recordings
     set project_id = p_project_id
   where id = p_recording_id and created_by = uid and status not in ('filed', 'failed');
  if not found then
    raise exception 'That recording wasn''t found, or it has already been added to a project.'
      using errcode = 'no_data_found';
  end if;

  return public.file_recording_note(p_recording_id);
end;
$$;

revoke execute on function public.file_recording_note(uuid) from public, anon, authenticated;
revoke execute on function public.assign_recording(uuid, uuid) from public, anon;
grant execute on function public.file_recording_note(uuid) to service_role;
grant execute on function public.assign_recording(uuid, uuid) to authenticated;
