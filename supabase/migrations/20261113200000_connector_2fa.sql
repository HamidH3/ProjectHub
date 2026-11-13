-- =============================================================================
-- ProjectHub — migration 15: the Claude connector for people with 2FA
--
-- People who use two-step sign-in (2FA) only see data once their code has been
-- entered (private.mfa_ok(), checking "aal2" in their login token). Tokens
-- that Supabase's OAuth server gives apps like Claude always say "aal1", even
-- when the person entered their code before pressing Allow, so for them the
-- connector saw nothing.
--
-- The fix keeps 2FA airtight:
--   * When someone presses Allow on ProjectHub's own page (/oauth/consent)
--     with their code entered (an aal2 session), the SERVER records
--     "this person approved this exact app" here, using the secret key.
--   * A token from an app (it carries that app's client_id) then counts as
--     2FA-checked only if that person approved that same app this way.
-- Someone with just the password can't create the record (the page needs the
-- code, and only the server can write here), and a record for one app doesn't
-- help any other app. Disconnecting removes the record.
-- =============================================================================

create table private.connector_approvals (
  user_id     uuid not null references auth.users (id) on delete cascade,
  client_id   text not null check (length(client_id) between 1 and 200),
  approved_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
alter table private.connector_approvals enable row level security; -- no policies: only the functions below
revoke all on private.connector_approvals from public, anon, authenticated;

-- The 2FA check, now also accepting an app this person approved with their code.
create or replace function private.mfa_ok()
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
      )
      or exists (
        select 1 from private.connector_approvals a
        where a.user_id = (select auth.uid())
          and a.client_id = (select auth.jwt() ->> 'client_id')
      );
$$;

-- Called by the server (secret key) after Allow, and after Disconnect.
create function public.record_connector_approval(p_user_id uuid, p_client_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.connector_approvals (user_id, client_id) values (p_user_id, p_client_id)
  on conflict (user_id, client_id) do update set approved_at = now();
$$;

create function public.forget_connector_approvals(p_user_id uuid, p_client_ids text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.connector_approvals where user_id = p_user_id and client_id = any (p_client_ids);
$$;

revoke execute on function public.record_connector_approval(uuid, text) from public, anon, authenticated;
revoke execute on function public.forget_connector_approvals(uuid, text[]) from public, anon, authenticated;
grant execute on function public.record_connector_approval(uuid, text) to service_role;
grant execute on function public.forget_connector_approvals(uuid, text[]) to service_role;
