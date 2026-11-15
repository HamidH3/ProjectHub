-- =============================================================================
-- ProjectHub — migration 18: meeting transcripts saved as files
--
-- The meeting recorder now puts the full transcript in the project's Files
-- (folder "Transcripts", named "<meeting title> - <date>.txt") instead of
-- inside the AI note. This remembers which file it became, so it's saved only
-- once and the recorder page can link to it. Written by the server only (like
-- the rest of meeting_recordings); if the file is deleted later, the link just
-- stops showing.
-- =============================================================================

alter table public.meeting_recordings add column transcript_file_id uuid;
