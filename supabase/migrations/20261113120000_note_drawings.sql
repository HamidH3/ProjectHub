-- =============================================================================
-- ProjectHub — migration 14: drawing and pictures on notes
--
-- notes.drawing holds the ink (pen and highlighter strokes) and the pictures
-- placed on a note's page, as JSON: {"v":1,"items":[...]}. Pictures themselves
-- are stored privately in the project-files bucket at
--   {project_id}/note-images/{note_id}/{random}.png|jpg
-- (the same rules as other project files: only people on the project).
--
-- No new access rules are needed: the note rules from migration 13 already
-- cover every column, so only the note's writer can change its drawing.
-- =============================================================================

alter table public.notes
  add column drawing jsonb not null default '{"v":1,"items":[]}'::jsonb
    check (jsonb_typeof(drawing) = 'object' and octet_length(drawing::text) <= 3000000);
