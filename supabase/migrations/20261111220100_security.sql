-- =============================================================================
-- ProjectHub — migration 2 of 3: security
-- Row Level Security (RLS) on every table. Anything not allowed here is refused.
--
--   * Admins can see and do everything (subject to 2FA, below).
--   * Members can only see projects they've been added to, and can read and
--     write notes, tasks and files inside those projects.
--   * Only admins can create, change or delete projects, members, invitations
--     and settings.
--   * Anyone who has set up 2FA must have entered their code this session
--     (JWT "aal2"), or every table returns nothing.
--   * The logged-out role ("anon") has no access to anything.
--   * Server code using the secret key bypasses RLS by design; it is only used
--     for setup, invites, username lookup, audit logs and removing users.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions (security definer = they can look at membership without
-- tripping over the very policies they are used in)
-- -----------------------------------------------------------------------------
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = (select auth.uid())
  );
$$;

create function public.can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_project_id is not null
     and (public.is_admin() or public.is_project_member(p_project_id));
$$;

-- True if the logged-in user and p_user_id share at least one project.
create function public.shares_project_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members mine
    join public.project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

-- True unless the user has a verified 2FA factor but hasn't entered a code yet.
create function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors
        where user_id = (select auth.uid()) and status = 'verified'
      );
$$;

-- -----------------------------------------------------------------------------
-- Rate limiting: returns true if the action is allowed, false if over the limit.
-- Server-only (called with the secret key).
-- -----------------------------------------------------------------------------
create function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
                  when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
                  else r.count + 1
                end,
        window_start = case
                  when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
                  else r.window_start
                end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- -----------------------------------------------------------------------------
-- Stop people promoting themselves. Only admins (or server jobs) can change
-- roles or the must_change_password flag, and an admin can't change their own
-- role (so the last admin can't lock everyone out by accident).
-- -----------------------------------------------------------------------------
create function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    return new;  -- server job with the secret key
  end if;

  if new.id <> old.id then
    raise exception 'Profile id cannot change' using errcode = 'insufficient_privilege';
  end if;

  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Only an admin can change roles' using errcode = 'insufficient_privilege';
    end if;
    if new.id = uid then
      raise exception 'You cannot change your own role' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.must_change_password is distinct from old.must_change_password and not public.is_admin() then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- -----------------------------------------------------------------------------
-- Who may call which function
-- -----------------------------------------------------------------------------
revoke execute on function public.is_admin()                                  from public, anon;
revoke execute on function public.is_project_member(uuid)                     from public, anon;
revoke execute on function public.can_access_project(uuid)                    from public, anon;
revoke execute on function public.shares_project_with(uuid)                   from public, anon;
revoke execute on function public.mfa_ok()                                    from public, anon;
revoke execute on function public.hit_rate_limit(text, integer, integer)      from public, anon, authenticated;
revoke execute on function public.handle_new_user()                           from public, anon, authenticated;
revoke execute on function public.handle_user_confirmed()                     from public, anon, authenticated;

grant execute on function public.is_admin()                to authenticated;
grant execute on function public.is_project_member(uuid)   to authenticated;
grant execute on function public.can_access_project(uuid)  to authenticated;
grant execute on function public.shares_project_with(uuid) to authenticated;
grant execute on function public.mfa_ok()                  to authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- The logged-out role gets nothing at all from our tables, now or in future
-- migrations.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- =============================================================================
-- Turn on RLS everywhere
-- =============================================================================
alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.notes           enable row level security;
alter table public.tasks           enable row level security;
alter table public.files           enable row level security;
alter table public.invitations     enable row level security;
alter table public.activity_logs   enable row level security;
alter table public.project_views   enable row level security;
alter table public.app_settings    enable row level security;
alter table public.rate_limits     enable row level security;  -- no policies: server only

-- =============================================================================
-- 2FA gate: a RESTRICTIVE policy is ANDed with every other policy on the table
-- =============================================================================
create policy "2fa: code entered if enrolled" on public.profiles        as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy "2fa: code entered if enrolled" on public.projects        as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy "2fa: code entered if enrolled" on public.project_members as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy "2fa: code entered if enrolled" on public.notes           as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy "2fa: code entered if enrolled" on public.tasks           as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy "2fa: code entered if enrolled" on public.files           as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy "2fa: code entered if enrolled" on public.invitations     as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy "2fa: code entered if enrolled" on public.activity_logs   as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy "2fa: code entered if enrolled" on public.project_views   as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy "2fa: code entered if enrolled" on public.app_settings    as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

-- =============================================================================
-- profiles
-- =============================================================================
create policy "profiles: read self, teammates, or all if admin"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_admin()
    or public.shares_project_with(id)
  );

create policy "profiles: update self, or anyone if admin"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());
-- No insert/delete policies: profiles are created by the auth trigger and
-- removed when the auth user is deleted.

-- =============================================================================
-- projects
-- =============================================================================
create policy "projects: read if member or admin"
  on public.projects for select to authenticated
  using (public.can_access_project(id));

create policy "projects: admins create"
  on public.projects for insert to authenticated
  with check (public.is_admin());

create policy "projects: admins update"
  on public.projects for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "projects: admins delete"
  on public.projects for delete to authenticated
  using (public.is_admin());

-- =============================================================================
-- project_members
-- =============================================================================
create policy "members: read for your projects"
  on public.project_members for select to authenticated
  using (public.can_access_project(project_id));

create policy "members: admins add"
  on public.project_members for insert to authenticated
  with check (public.is_admin());

create policy "members: admins remove"
  on public.project_members for delete to authenticated
  using (public.is_admin());

-- =============================================================================
-- notes, tasks, files: full access inside projects you can access
-- =============================================================================
create policy "notes: read"   on public.notes for select to authenticated using (public.can_access_project(project_id));
create policy "notes: create" on public.notes for insert to authenticated with check (public.can_access_project(project_id));
create policy "notes: edit"   on public.notes for update to authenticated using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
create policy "notes: delete" on public.notes for delete to authenticated using (public.can_access_project(project_id));

create policy "tasks: read"   on public.tasks for select to authenticated using (public.can_access_project(project_id));
create policy "tasks: create" on public.tasks for insert to authenticated with check (public.can_access_project(project_id));
create policy "tasks: edit"   on public.tasks for update to authenticated using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
create policy "tasks: delete" on public.tasks for delete to authenticated using (public.can_access_project(project_id));

create policy "files: read"   on public.files for select to authenticated using (public.can_access_project(project_id));
create policy "files: create" on public.files for insert to authenticated with check (public.can_access_project(project_id));
create policy "files: edit"   on public.files for update to authenticated using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
create policy "files: delete" on public.files for delete to authenticated using (public.can_access_project(project_id));

-- =============================================================================
-- invitations: admins only
-- =============================================================================
create policy "invitations: admins only"
  on public.invitations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- activity_logs: admins read everything, members read their projects' history.
-- Written only by the server (secret key); nobody can edit or delete entries.
-- =============================================================================
create policy "activity: read"
  on public.activity_logs for select to authenticated
  using (public.is_admin() or public.can_access_project(project_id));

-- =============================================================================
-- project_views: your own "recently opened" list
-- =============================================================================
create policy "views: own, readable"
  on public.project_views for select to authenticated
  using (user_id = (select auth.uid()));

create policy "views: own, record"
  on public.project_views for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_access_project(project_id));

create policy "views: own, refresh"
  on public.project_views for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_access_project(project_id));

create policy "views: own, clear"
  on public.project_views for delete to authenticated
  using (user_id = (select auth.uid()));

-- =============================================================================
-- app_settings: everyone logged in can read; admins change
-- =============================================================================
create policy "settings: read"
  on public.app_settings for select to authenticated
  using (true);

create policy "settings: admins update"
  on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
