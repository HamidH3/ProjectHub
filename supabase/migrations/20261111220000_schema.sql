-- =============================================================================
-- ProjectHub — migration 1 of 3: schema
-- Creates the types, tables, indexes and triggers.
-- Security rules (RLS) are in migration 2; file storage is in migration 3.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.app_role       as enum ('admin', 'member');
create type public.project_status as enum ('active', 'on_hold', 'completed');
create type public.task_priority  as enum ('low', 'medium', 'high');

-- -----------------------------------------------------------------------------
-- profiles: one row per login, created automatically when an auth user is made
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  username             text unique
                       check (username ~ '^[a-z0-9_]{3,30}$'),   -- lowercase only, so unique = case-insensitive
  full_name            text check (char_length(full_name) <= 100),
  role                 public.app_role not null default 'member',
  timezone             text not null default 'Europe/London' check (char_length(timezone) <= 64),
  avatar_path          text,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- projects
-- -----------------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (char_length(description) <= 2000),
  color       text not null default 'orange'
              check (color in ('orange', 'yellow', 'pink', 'mint', 'blue', 'lilac', 'grey')),
  icon        text check (char_length(icon) <= 40),
  status      public.project_status not null default 'active',
  start_date  date,
  deadline    date,
  position    text collate "C" not null default 'a0',   -- sortable key for drag-and-drop order
  archived_at timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint projects_dates_check check (deadline is null or start_date is null or deadline >= start_date)
);
create index projects_position_idx on public.projects (position);

-- -----------------------------------------------------------------------------
-- project_members: who can see which project (admins see everything anyway)
-- -----------------------------------------------------------------------------
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- -----------------------------------------------------------------------------
-- notes: pages and nested subpages (parent_id points at another note)
-- -----------------------------------------------------------------------------
create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  parent_id    uuid references public.notes (id) on delete cascade,
  title        text not null default 'Untitled' check (char_length(title) <= 200),
  content      jsonb not null default '{"type":"doc","content":[]}'::jsonb
               check (octet_length(content::text) <= 2000000),
  content_text text not null default '' check (octet_length(content_text) <= 1000000),
  position     text collate "C" not null default 'a0',
  created_by   uuid references public.profiles (id) on delete set null,
  updated_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  search       tsvector generated always as (
                 setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
                 setweight(to_tsvector('english'::regconfig, coalesce(content_text, '')), 'B')
               ) stored,
  constraint notes_not_own_parent check (parent_id is null or parent_id <> id)
);
create index notes_tree_idx   on public.notes (project_id, parent_id, position);
create index notes_recent_idx on public.notes (project_id, updated_at desc);
create index notes_search_idx on public.notes using gin (search);

-- -----------------------------------------------------------------------------
-- tasks: to-dos, grouped on screen by scheduled_date
-- -----------------------------------------------------------------------------
create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  title          text not null check (char_length(btrim(title)) between 1 and 300),
  description    text check (char_length(description) <= 5000),
  scheduled_date date,
  due_time       time,
  priority       public.task_priority,
  completed_at   timestamptz,
  position       text collate "C" not null default 'a0',
  assignee_id    uuid references public.profiles (id) on delete set null,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  search         tsvector generated always as (
                   setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
                   setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'B')
                 ) stored
);
create index tasks_project_date_idx on public.tasks (project_id, scheduled_date, position);
create index tasks_open_date_idx    on public.tasks (scheduled_date) where completed_at is null;  -- home page + overdue
create index tasks_search_idx       on public.tasks using gin (search);

-- -----------------------------------------------------------------------------
-- files: details of each upload (the file itself lives in Storage)
-- -----------------------------------------------------------------------------
create table public.files (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  storage_path text not null unique,
  name         text not null check (char_length(btrim(name)) between 1 and 255),
  mime_type    text not null check (char_length(mime_type) <= 255),
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 52428800),  -- 50 MB
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  search       tsvector generated always as (to_tsvector('simple'::regconfig, coalesce(name, ''))) stored,
  constraint files_path_in_project check (storage_path like project_id::text || '/%')
);
create index files_project_idx on public.files (project_id, created_at desc);
create index files_search_idx  on public.files using gin (search);

-- -----------------------------------------------------------------------------
-- invitations
-- -----------------------------------------------------------------------------
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role        public.app_role not null default 'member',
  project_ids uuid[] not null default '{}',
  invited_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
-- At most one open invitation per email address.
create unique index invitations_one_open_per_email
  on public.invitations (email) where accepted_at is null and revoked_at is null;

-- -----------------------------------------------------------------------------
-- activity_logs: audit trail + project history. No foreign key on project_id,
-- so the history survives a project being deleted.
-- -----------------------------------------------------------------------------
create table public.activity_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  project_id  uuid,
  action      text not null check (char_length(action) <= 100),
  entity_type text check (char_length(entity_type) <= 50),
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index activity_logs_project_idx on public.activity_logs (project_id, created_at desc);
create index activity_logs_recent_idx  on public.activity_logs (created_at desc);

-- -----------------------------------------------------------------------------
-- project_views: "recently opened" ordering on the home page
-- -----------------------------------------------------------------------------
create table public.project_views (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (user_id, project_id)
);

-- -----------------------------------------------------------------------------
-- app_settings: exactly one row
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id                  boolean primary key default true check (id),
  app_name            text not null default 'ProjectHub' check (char_length(app_name) <= 60),
  require_mfa_for_all boolean not null default false,
  updated_at          timestamptz not null default now()
);
insert into public.app_settings default values;

-- -----------------------------------------------------------------------------
-- rate_limits: counters for sensitive actions (used by migration 2's function)
-- -----------------------------------------------------------------------------
create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        integer not null
);

-- =============================================================================
-- Triggers
-- =============================================================================

-- Keep updated_at current on every edit.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at     before update on public.profiles     for each row execute function public.set_updated_at();
create trigger projects_updated_at     before update on public.projects     for each row execute function public.set_updated_at();
create trigger notes_updated_at        before update on public.notes        for each row execute function public.set_updated_at();
create trigger tasks_updated_at        before update on public.tasks        for each row execute function public.set_updated_at();
create trigger files_updated_at        before update on public.files        for each row execute function public.set_updated_at();
create trigger app_settings_updated_at before update on public.app_settings for each row execute function public.set_updated_at();

-- Record who created / edited a row from the logged-in user, so the browser
-- can't claim to be someone else. (Server jobs using the secret key have no
-- logged-in user, so whatever they pass is kept.)
create function public.stamp_author()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    case tg_table_name
      when 'files' then new.uploaded_by := uid;
      else new.created_by := uid;
    end case;
  end if;

  if tg_table_name = 'notes' then
    new.updated_by := uid;
  end if;

  return new;
end;
$$;

create trigger projects_stamp_author before insert            on public.projects for each row execute function public.stamp_author();
create trigger notes_stamp_author    before insert or update  on public.notes    for each row execute function public.stamp_author();
create trigger tasks_stamp_author    before insert            on public.tasks    for each row execute function public.stamp_author();
create trigger files_stamp_author    before insert            on public.files    for each row execute function public.stamp_author();

-- A subpage must sit in the same project as its parent, and a page can't be
-- moved underneath one of its own subpages (that would create a loop).
create function public.check_note_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_project uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select project_id into parent_project from public.notes where id = new.parent_id;

  if parent_project is null then
    raise exception 'Parent note not found' using errcode = 'foreign_key_violation';
  end if;

  if parent_project <> new.project_id then
    raise exception 'A subpage must be in the same project as its parent' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and exists (
    with recursive ancestors as (
      select id, parent_id from public.notes where id = new.parent_id
      union
      select n.id, n.parent_id from public.notes n join ancestors a on n.id = a.parent_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'A page cannot be moved inside one of its own subpages' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger notes_check_parent
  before insert or update of parent_id, project_id on public.notes
  for each row execute function public.check_note_parent();

-- When an auth user is created (by /setup or an invite), create their profile.
-- Role and project access come ONLY from an open invitation, never from data
-- the user can edit. Everyone else starts as a member with no projects;
-- /setup promotes the first admin using the secret key.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invitations%rowtype;
begin
  select * into inv
  from public.invitations
  where email = lower(new.email)
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  insert into public.profiles (id, username, full_name, role)
  values (
    new.id,
    nullif(lower(btrim(new.raw_user_meta_data ->> 'username')), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    coalesce(inv.role, 'member')
  );

  if inv.id is not null then
    insert into public.project_members (project_id, user_id, added_by)
    select p.id, new.id, inv.invited_by
    from public.projects p
    where p.id = any (inv.project_ids)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- When an invited user confirms (clicks the invite link), mark it accepted.
create function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.invitations
    set accepted_at = now()
    where email = lower(new.email)
      and accepted_at is null
      and revoked_at is null;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();
