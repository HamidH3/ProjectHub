-- =============================================================================
-- ProjectHub — migration 6: meetings (for the calendar)
--
-- A meeting belongs to one project and sits on a day, with optional start and
-- end times (no times = all day). Like to-dos, times are stored as the clock
-- time you typed (e.g. 14:30), not converted between time zones.
--
-- Same protection as notes and to-dos: only people who can open the project
-- can see or change its meetings, the 2FA rule applies, and logged-out
-- visitors get nothing.
-- =============================================================================

create table public.meetings (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  meeting_date date not null,
  start_time   time,
  end_time     time,
  location     text check (char_length(location) <= 500),   -- a room or a video-call link
  notes        text check (char_length(notes) <= 5000),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  search       tsvector generated always as (
                 setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
                 setweight(to_tsvector('english'::regconfig, coalesce(location, '') || ' ' || coalesce(notes, '')), 'B')
               ) stored,
  -- An end time needs a start time, and must be after it.
  constraint meetings_times_check check (end_time is null or (start_time is not null and end_time > start_time))
);

create index meetings_project_date_idx on public.meetings (project_id, meeting_date, start_time);
create index meetings_date_idx         on public.meetings (meeting_date);
create index meetings_search_idx       on public.meetings using gin (search);

-- The "Completed" list on the Tasks tab shows the most recently finished first.
create index tasks_project_completed_idx on public.tasks (project_id, completed_at desc) where completed_at is not null;

create trigger meetings_updated_at    before update on public.meetings for each row execute function public.set_updated_at();
create trigger meetings_stamp_author  before insert on public.meetings for each row execute function public.stamp_author();

-- Security ---------------------------------------------------------------------
revoke all on public.meetings from anon;
grant select, insert, update, delete on public.meetings to authenticated;

alter table public.meetings enable row level security;

create policy "2fa: code entered if enrolled" on public.meetings
  as restrictive for all to authenticated
  using (private.mfa_ok()) with check (private.mfa_ok());

create policy "meetings: read"   on public.meetings for select to authenticated using (private.can_access_project(project_id));
create policy "meetings: create" on public.meetings for insert to authenticated with check (private.can_access_project(project_id));
create policy "meetings: edit"   on public.meetings for update to authenticated using (private.can_access_project(project_id)) with check (private.can_access_project(project_id));
create policy "meetings: delete" on public.meetings for delete to authenticated using (private.can_access_project(project_id));
