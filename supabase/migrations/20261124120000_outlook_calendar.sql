-- =============================================================================
-- ProjectHub — migration 21: Outlook calendar
--
-- Each person can connect their own Outlook calendar (Settings → Outlook
-- calendar), either by signing in with Microsoft or by pasting the calendar's
-- published ICS link. Their Outlook events then show on the Calendar and Home
-- pages, only for them, and they can link an event to one of their projects.
--
--   calendar_connections  one row per person per way of connecting. The
--                         sign-in token / ICS link is stored ENCRYPTED by the
--                         server, and nobody can read that column through the
--                         app's API (only the server, with the secret key).
--   outlook_events        a copy of the person's events (about a month back to
--                         six months ahead), refreshed by the server. Only the
--                         person can see them; they can only change which
--                         project an event is linked to.
-- =============================================================================

create table public.calendar_connections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  kind           text not null check (kind in ('microsoft', 'link')),
  label          text check (char_length(label) <= 200),        -- e.g. the Microsoft account's email
  secret         text not null,                                 -- encrypted refresh token or ICS link
  status         text not null default 'ok' check (status in ('ok', 'error')),
  last_error     text check (char_length(last_error) <= 300),
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (user_id, kind)
);

alter table public.calendar_connections enable row level security;
revoke all on public.calendar_connections from anon, authenticated;
-- Everything except the secret, and only your own rows (policy below).
grant select (id, user_id, kind, label, status, last_error, last_synced_at, created_at)
  on public.calendar_connections to authenticated;
grant delete on public.calendar_connections to authenticated;
grant all on public.calendar_connections to service_role;

create policy "calendar connections: see your own"
  on public.calendar_connections for select to authenticated
  using (user_id = (select auth.uid()));
create policy "calendar connections: disconnect your own"
  on public.calendar_connections for delete to authenticated
  using (user_id = (select auth.uid()));
create policy "2fa: code entered if enrolled"
  on public.calendar_connections as restrictive for all to authenticated
  using (private.mfa_ok()) with check (private.mfa_ok());

create table public.outlook_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  connection_id uuid not null references public.calendar_connections (id) on delete cascade,
  external_id   text not null check (char_length(external_id) <= 1024),
  title         text not null check (char_length(title) <= 300),
  location      text check (char_length(location) <= 500),
  join_url      text check (char_length(join_url) <= 2000 and join_url ~ '^https://'),
  web_link      text check (char_length(web_link) <= 2000 and web_link ~ '^https://'),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  all_day       boolean not null default false,
  project_id    uuid references public.projects (id) on delete set null,
  sync_run      uuid,
  updated_at    timestamptz not null default now(),
  unique (connection_id, external_id),
  check (ends_at >= starts_at)
);
create index outlook_events_user_time on public.outlook_events (user_id, starts_at);
create index outlook_events_project on public.outlook_events (project_id) where project_id is not null;

alter table public.outlook_events enable row level security;
revoke all on public.outlook_events from anon, authenticated;
grant select on public.outlook_events to authenticated;
grant update (project_id) on public.outlook_events to authenticated;
grant all on public.outlook_events to service_role;

create policy "outlook events: see your own"
  on public.outlook_events for select to authenticated
  using (user_id = (select auth.uid()));
-- Link (or unlink) one of your events to a project you can open.
create policy "outlook events: link your own to your projects"
  on public.outlook_events for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (project_id is null or private.can_access_project(project_id)));
create policy "2fa: code entered if enrolled"
  on public.outlook_events as restrictive for all to authenticated
  using (private.mfa_ok()) with check (private.mfa_ok());
