-- =============================================================================
-- ProjectHub — migration 4: move security helpers out of the public API
--
-- Supabase's Security Advisor flags SECURITY DEFINER functions in the `public`
-- schema, because anything in `public` can be called through the API.
-- The security rules still need these helpers, so we move them into a
-- `private` schema that the API does not expose. The existing policies and
-- triggers keep working: Postgres links them to the function itself, not to
-- its name.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.is_admin()                 set schema private;
alter function public.is_project_member(uuid)    set schema private;
alter function public.can_access_project(uuid)   set schema private;
alter function public.shares_project_with(uuid)  set schema private;
alter function public.mfa_ok()                   set schema private;
alter function public.protect_profile_fields()   set schema private;
alter function public.handle_new_user()          set schema private;
alter function public.handle_user_confirmed()    set schema private;

-- These two call other helpers by name, so point them at the new schema.
create or replace function private.can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_project_id is not null
     and (private.is_admin() or private.is_project_member(p_project_id));
$$;

create or replace function private.protect_profile_fields()
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
    if not private.is_admin() then
      raise exception 'Only an admin can change roles' using errcode = 'insufficient_privilege';
    end if;
    if new.id = uid then
      raise exception 'You cannot change your own role' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.must_change_password is distinct from old.must_change_password and not private.is_admin() then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- Trigger functions run automatically; nobody needs permission to call them.
revoke execute on function private.protect_profile_fields() from public, anon, authenticated;
revoke execute on function private.handle_new_user()        from public, anon, authenticated;
revoke execute on function private.handle_user_confirmed()  from public, anon, authenticated;

-- Supabase's own "enable RLS automatically" helper (exists only if that option
-- was chosen when the project was created). It runs automatically, so remove
-- the unneeded call permission. Skipped quietly if it doesn't exist.
do $$
begin
  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
exception
  when undefined_function then
    raise notice 'public.rls_auto_enable() not present, skipped';
end;
$$;
