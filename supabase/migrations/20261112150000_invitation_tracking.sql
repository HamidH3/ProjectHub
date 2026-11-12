-- =============================================================================
-- ProjectHub — migration 9: keeping track of invitations
--
-- An invitation now remembers the account it created (so cancelling it can
-- remove that unused account) and when its link was last sent (shown on the
-- People page; "Resend" updates it).
-- The rules don't change: invitations are still admin-only, and role and
-- project access still come only from the invitation (handle_new_user).
-- =============================================================================

alter table public.invitations
  add column user_id      uuid references public.profiles (id) on delete set null,
  add column last_sent_at timestamptz not null default now(),
  add column full_name    text check (char_length(full_name) <= 100);

create index invitations_open_idx on public.invitations (created_at desc) where accepted_at is null and revoked_at is null;
