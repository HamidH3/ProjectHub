-- =============================================================================
-- ProjectHub — migration 11: invite links that link scanners can't use up
--
-- Invite links are now ProjectHub's own: /invite/<random code>, valid until the
-- invitation expires (7 days). Only a fingerprint (SHA-256) of the code is
-- stored, so even someone who could read this table couldn't rebuild a link.
-- Opening the link only shows a "Continue" button; the sign-in happens when a
-- person presses it, so email and chat link-checkers no longer use it up.
-- The rules don't change: invitations stay admin-only.
-- =============================================================================

alter table public.invitations
  add column token_hash text check (token_hash ~ '^[0-9a-f]{64}$');

create unique index invitations_token_hash_idx on public.invitations (token_hash) where token_hash is not null;
