-- =============================================================================
-- ProjectHub — migration 5: note previews
-- A short, automatically maintained preview of each note's text, so the notes
-- list can show a snippet without downloading every note in full.
-- =============================================================================

alter table public.notes
  add column preview text
  generated always as (left(btrim(regexp_replace(content_text, '\s+', ' ', 'g')), 160)) stored;
