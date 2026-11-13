-- =============================================================================
-- ProjectHub — security check for your real database
--
-- What it does: creates a few throwaway test people and projects, then checks,
-- AS each of those people, that the database's own rules only let them see and
-- change what they should. At the end everything is undone (ROLLBACK), so
-- nothing is saved and your real data isn't touched.
--
-- How to run it: Supabase dashboard → SQL Editor → New query → paste this whole
-- file → Run. Use your DEV project (projecthub-dev).
--   * Passed:  one row saying "ALL CHECKS PASSED".
--   * Failed:  an error starting with "FAIL:" that says which rule broke.
--     Nothing is saved in that case either.
-- =============================================================================

begin;

-- Helpers (removed again by the rollback at the end) -------------------------
create schema rls_check;
grant usage on schema rls_check to anon, authenticated;

create function rls_check.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
end $$;

-- Runs some SQL and requires that the database refuses it.
create function rls_check.refused(sql text, msg text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    return;
  end;
  raise exception 'FAIL: % (it was allowed)', msg;
end $$;

-- Runs a query and requires that it returns nothing (or is refused outright).
create function rls_check.sees_nothing(sql text, msg text) returns void language plpgsql as $$
declare
  n bigint;
begin
  begin
    execute 'select count(*) from (' || sql || ') as q' into n;
  exception when others then
    return;
  end;
  if n > 0 then raise exception 'FAIL: % (% rows visible)', msg, n; end if;
end $$;

-- Becomes a test person for the following checks.
create function rls_check.act_as(user_id uuid, aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'aal', aal)::text, true);
  perform set_config('request.jwt.claim.sub', user_id::text, true);
end $$;
grant execute on all functions in schema rls_check to anon, authenticated;

-- Test data (as the database owner) -------------------------------------------
-- People: Alice (member of project A), Bob (no projects), Carol (member of A, with 2FA), Dave (admin)
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at) values
  ('0e0e0000-0000-4000-8000-00000000a11c', 'rlscheck-alice@example.invalid', '{"username":"rlscheck_alice"}', now(), now(), now()),
  ('0e0e0000-0000-4000-8000-000000000b0b', 'rlscheck-bob@example.invalid',   '{"username":"rlscheck_bob","role":"admin"}', now(), now(), now()),
  ('0e0e0000-0000-4000-8000-00000000ca01', 'rlscheck-carol@example.invalid', '{"username":"rlscheck_carol"}', now(), now(), now()),
  ('0e0e0000-0000-4000-8000-00000000da7e', 'rlscheck-dave@example.invalid',  '{"username":"rlscheck_dave"}', now(), now(), now());
update public.profiles set role = 'admin' where id = '0e0e0000-0000-4000-8000-00000000da7e';
update public.profiles set must_change_password = true where id = '0e0e0000-0000-4000-8000-00000000a11c';

insert into public.projects (id, name) values
  ('0e0e0000-0000-4000-8000-0000000000a0', 'rlscheck project A'),
  ('0e0e0000-0000-4000-8000-0000000000b0', 'rlscheck project B (secret)');
insert into public.project_members (project_id, user_id) values
  ('0e0e0000-0000-4000-8000-0000000000a0', '0e0e0000-0000-4000-8000-00000000a11c'),
  ('0e0e0000-0000-4000-8000-0000000000a0', '0e0e0000-0000-4000-8000-00000000ca01');

insert into public.notes (project_id, title, content_text) values
  ('0e0e0000-0000-4000-8000-0000000000a0', 'rlscheck note A', 'rlscheckword in A'),
  ('0e0e0000-0000-4000-8000-0000000000b0', 'rlscheck note B', 'rlscheckword in the secret project');
insert into public.notes (project_id, title, content_text, created_by) values
  ('0e0e0000-0000-4000-8000-0000000000a0', 'rlscheck Carol''s note', 'written by Carol', '0e0e0000-0000-4000-8000-00000000ca01');
insert into public.tasks (project_id, title) values ('0e0e0000-0000-4000-8000-0000000000b0', 'rlscheck secret to-do');
insert into public.meetings (project_id, title, meeting_date) values ('0e0e0000-0000-4000-8000-0000000000b0', 'rlscheck secret meeting', current_date);
insert into public.folders (project_id, name) values ('0e0e0000-0000-4000-8000-0000000000b0', 'rlscheck secret folder');
insert into public.files (project_id, storage_path, name, mime_type, size_bytes) values
  ('0e0e0000-0000-4000-8000-0000000000b0', '0e0e0000-0000-4000-8000-0000000000b0/0e0e0000-0000-4000-8000-0000000000f1/secret.pdf', 'rlscheck secret.pdf', 'application/pdf', 1);
insert into public.invitations (email, project_ids) values ('rlscheck-erin@example.invalid', array['0e0e0000-0000-4000-8000-0000000000b0']::uuid[]);

-- Carol has a confirmed 2FA app.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '0e0e0000-0000-4000-8000-00000000ca01', 'rlscheck', 'totp', 'verified', now(), now());

-- The checks ---------------------------------------------------------------------
select rls_check.ok((select role from public.profiles where id = '0e0e0000-0000-4000-8000-000000000b0b') = 'member',
  'a role typed into sign-up details is ignored (Bob asked to be admin)');

-- Logged-out visitors
set local role anon;
select rls_check.refused($$select * from public.projects limit 1$$, 'logged-out visitors cannot read projects');
select rls_check.refused($$select * from public.notes limit 1$$, 'logged-out visitors cannot read notes');
select rls_check.refused($$select * from public.search_everything('rlscheckword')$$, 'logged-out visitors cannot search');
select rls_check.sees_nothing($$select 1 from storage.objects where bucket_id = 'project-files'$$, 'logged-out visitors see no stored files');
reset role;

-- Alice: a member of project A only
set local role authenticated;
select rls_check.act_as('0e0e0000-0000-4000-8000-00000000a11c');
select rls_check.ok(exists (select 1 from public.projects where id = '0e0e0000-0000-4000-8000-0000000000a0'), 'a member sees their own project');
select rls_check.ok(not exists (select 1 from public.projects where id = '0e0e0000-0000-4000-8000-0000000000b0'), 'a member cannot see a project they are not on');
select rls_check.ok((select count(*) from public.notes where project_id = '0e0e0000-0000-4000-8000-0000000000b0') = 0, '…nor its notes');
select rls_check.ok((select count(*) from public.tasks where project_id = '0e0e0000-0000-4000-8000-0000000000b0') = 0, '…nor its to-dos');
select rls_check.ok((select count(*) from public.meetings where project_id = '0e0e0000-0000-4000-8000-0000000000b0') = 0, '…nor its meetings');
select rls_check.ok((select count(*) from public.folders where project_id = '0e0e0000-0000-4000-8000-0000000000b0') = 0, '…nor its folders');
select rls_check.ok((select count(*) from public.files where project_id = '0e0e0000-0000-4000-8000-0000000000b0') = 0, '…nor its files');
select rls_check.ok((select count(*) from public.file_overview where project_id = '0e0e0000-0000-4000-8000-0000000000b0') = 0, '…not even through the file_overview list');
select rls_check.ok(not exists (select 1 from public.search_everything('rlscheckword') where project_id = '0e0e0000-0000-4000-8000-0000000000b0'), '…nor through search');
select rls_check.ok(exists (select 1 from public.search_everything('rlscheckword') where project_id = '0e0e0000-0000-4000-8000-0000000000a0'), 'search does find things in their own project');
select rls_check.refused($$insert into public.notes (project_id, title) values ('0e0e0000-0000-4000-8000-0000000000b0', 'sneaky')$$, 'a member cannot add a note to another project');
select rls_check.refused($$insert into public.projects (name) values ('rlscheck sneaky project')$$, 'a member cannot create projects');
select rls_check.refused($$insert into public.project_members (project_id, user_id) values ('0e0e0000-0000-4000-8000-0000000000b0', '0e0e0000-0000-4000-8000-00000000a11c')$$, 'a member cannot add themselves to a project');
select rls_check.refused($$update public.profiles set role = 'admin' where id = '0e0e0000-0000-4000-8000-00000000a11c'$$, 'a member cannot make themselves an admin');
select rls_check.refused($$update public.profiles set must_change_password = false where id = '0e0e0000-0000-4000-8000-00000000a11c'$$, 'a member cannot skip a required password change');
select rls_check.refused($$insert into public.activity_logs (action) values ('rlscheck forged entry')$$, 'a member cannot write to the activity log');
select rls_check.ok((select count(*) from public.invitations where email like 'rlscheck-%') = 0, 'a member cannot see invitations');
select rls_check.ok((select count(*) from storage.objects where bucket_id = 'project-files' and name like '0e0e0000-0000-4000-8000-0000000000b0/%') = 0, 'a member cannot see another project''s stored files');
insert into public.notes (project_id, title) values ('0e0e0000-0000-4000-8000-0000000000a0', 'rlscheck Alice''s note');
select rls_check.ok(exists (select 1 from public.notes where title = 'rlscheck Alice''s note'), 'a member can add notes to their own project');
-- Own notes (migration 13): read everyone's, change only your own
select rls_check.ok(exists (select 1 from public.notes where title = 'rlscheck Carol''s note'), 'a member can read a teammate''s notes');
update public.notes set content_text = 'overwritten by Alice' where title = 'rlscheck Carol''s note';
select rls_check.ok((select content_text from public.notes where title = 'rlscheck Carol''s note') = 'written by Carol', '…but cannot change them');
update public.notes set drawing = '{"v":1,"items":[]}'::jsonb || '{"scribbled":true}'::jsonb where title = 'rlscheck Carol''s note';
select rls_check.ok(not ((select drawing from public.notes where title = 'rlscheck Carol''s note') ? 'scribbled'), '…nor draw on them');
delete from public.notes where title = 'rlscheck Carol''s note';
select rls_check.ok(exists (select 1 from public.notes where title = 'rlscheck Carol''s note'), '…or delete them');
update public.notes set content_text = 'changed' where title = 'rlscheck note A';
select rls_check.ok((select content_text from public.notes where title = 'rlscheck note A') <> 'changed', '…or change notes with no writer (only admins can)');
select rls_check.refused($$insert into public.notes (project_id, parent_id, title) select project_id, id, 'rlscheck sneaky subpage' from public.notes where title = 'rlscheck Carol''s note'$$, '…or add a subpage inside a teammate''s note');
update public.notes set content_text = 'Alice edited this' where title = 'rlscheck Alice''s note';
select rls_check.ok((select content_text from public.notes where title = 'rlscheck Alice''s note') = 'Alice edited this', 'a member can edit their own notes');
select rls_check.ok((select created_by from public.notes where title = 'rlscheck Alice''s note') = '0e0e0000-0000-4000-8000-00000000a11c', 'a new note is recorded as written by whoever made it');
-- Assigning to-dos (migration 12)
insert into public.tasks (project_id, title, assignee_id) values ('0e0e0000-0000-4000-8000-0000000000a0', 'rlscheck for Carol', '0e0e0000-0000-4000-8000-00000000ca01');
select rls_check.ok(exists (select 1 from public.tasks where title = 'rlscheck for Carol'), 'a member can assign a to-do to someone else on the project');
insert into public.tasks (project_id, title, assignee_id) values ('0e0e0000-0000-4000-8000-0000000000a0', 'rlscheck for Dave', '0e0e0000-0000-4000-8000-00000000da7e');
select rls_check.ok(exists (select 1 from public.tasks where title = 'rlscheck for Dave'), '…or to an admin');
select rls_check.refused($$insert into public.tasks (project_id, title, assignee_id) values ('0e0e0000-0000-4000-8000-0000000000a0', 'rlscheck for Bob', '0e0e0000-0000-4000-8000-000000000b0b')$$, 'a to-do cannot be assigned to someone who cannot open the project');
select rls_check.refused($$update public.tasks set assignee_id = '0e0e0000-0000-4000-8000-000000000b0b' where title = 'rlscheck for Carol'$$, '…not even by editing an existing to-do');
select rls_check.ok(exists (select 1 from public.profiles where id = '0e0e0000-0000-4000-8000-00000000da7e'), 'a member can see admins'' names');
select rls_check.ok(not exists (select 1 from public.profiles where id = '0e0e0000-0000-4000-8000-000000000b0b'), '…but not people who share no project with them');
reset role;

-- Bob: has an account but no projects
set local role authenticated;
select rls_check.act_as('0e0e0000-0000-4000-8000-000000000b0b');
select rls_check.ok((select count(*) from public.projects where name like 'rlscheck%') = 0, 'someone with no projects sees no projects');
select rls_check.ok((select count(*) from public.notes where title like 'rlscheck%') = 0, '…and no notes');
reset role;

-- Carol: member of project A with 2FA set up
set local role authenticated;
select rls_check.act_as('0e0e0000-0000-4000-8000-00000000ca01', 'aal1');
select rls_check.ok(not exists (select 1 from public.projects where id = '0e0e0000-0000-4000-8000-0000000000a0'), 'with 2FA set up, nothing is visible until the code is entered');
select rls_check.act_as('0e0e0000-0000-4000-8000-00000000ca01', 'aal2');
select rls_check.ok(exists (select 1 from public.projects where id = '0e0e0000-0000-4000-8000-0000000000a0'), '…and their project appears once it is entered');
reset role;

-- Claude connector + 2FA (migration 15). Carol has 2FA. A connector token says aal1 and
-- carries the app's client_id; it only counts if Carol approved that exact app with her code.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '0e0e0000-0000-4000-8000-00000000ca01', 'role', 'authenticated', 'aal', 'aal1', 'client_id', 'rlscheck-claude')::text, true);
select set_config('request.jwt.claim.sub', '0e0e0000-0000-4000-8000-00000000ca01', true);
select rls_check.ok(not exists (select 1 from public.projects where id = '0e0e0000-0000-4000-8000-0000000000a0'), 'an app token without an approval sees nothing for a 2FA user');
select rls_check.refused($$select public.record_connector_approval('0e0e0000-0000-4000-8000-00000000ca01', 'rlscheck-claude')$$, 'a signed-in person cannot record an approval themselves');
reset role;
select public.record_connector_approval('0e0e0000-0000-4000-8000-00000000ca01', 'rlscheck-claude'); -- what the server does after Allow
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '0e0e0000-0000-4000-8000-00000000ca01', 'role', 'authenticated', 'aal', 'aal1', 'client_id', 'rlscheck-claude')::text, true);
select rls_check.ok(exists (select 1 from public.projects where id = '0e0e0000-0000-4000-8000-0000000000a0'), 'the app she approved with her code can see her project');
select set_config('request.jwt.claims', json_build_object('sub', '0e0e0000-0000-4000-8000-00000000ca01', 'role', 'authenticated', 'aal', 'aal1', 'client_id', 'rlscheck-other-app')::text, true);
select rls_check.ok(not exists (select 1 from public.projects where id = '0e0e0000-0000-4000-8000-0000000000a0'), '…but a different app cannot');
select set_config('request.jwt.claims', json_build_object('sub', '0e0e0000-0000-4000-8000-00000000ca01', 'role', 'authenticated', 'aal', 'aal1')::text, true);
select rls_check.ok(not exists (select 1 from public.projects where id = '0e0e0000-0000-4000-8000-0000000000a0'), '…and a normal login without her code still cannot');
select set_config('request.jwt.claims', json_build_object('sub', '0e0e0000-0000-4000-8000-00000000a11c', 'role', 'authenticated', 'aal', 'aal1', 'client_id', 'rlscheck-claude')::text, true);
select set_config('request.jwt.claim.sub', '0e0e0000-0000-4000-8000-00000000a11c', true);
select rls_check.ok(not exists (select 1 from public.notes where title = 'rlscheck note B'), 'an approval never shows anyone projects they are not on');
reset role;
select public.forget_connector_approvals('0e0e0000-0000-4000-8000-00000000ca01', array['rlscheck-claude']); -- Disconnect
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '0e0e0000-0000-4000-8000-00000000ca01', 'role', 'authenticated', 'aal', 'aal1', 'client_id', 'rlscheck-claude')::text, true);
select set_config('request.jwt.claim.sub', '0e0e0000-0000-4000-8000-00000000ca01', true);
select rls_check.ok(not exists (select 1 from public.projects where id = '0e0e0000-0000-4000-8000-0000000000a0'), 'after Disconnect the app sees nothing again');
reset role;

-- Dave: an admin
set local role authenticated;
select rls_check.act_as('0e0e0000-0000-4000-8000-00000000da7e');
select rls_check.ok((select count(*) from public.projects where name like 'rlscheck%') = 2, 'an admin sees every project');
select rls_check.ok((select count(*) from public.invitations where email like 'rlscheck-%') = 1, 'an admin sees invitations');
update public.notes set content_text = 'tidied by admin' where title = 'rlscheck note A';
select rls_check.ok((select content_text from public.notes where title = 'rlscheck note A') = 'tidied by admin', 'an admin can tidy up notes whose writer is gone');
update public.notes set content_text = 'admin overwrite' where title = 'rlscheck Carol''s note';
select rls_check.ok((select content_text from public.notes where title = 'rlscheck Carol''s note') = 'written by Carol', '…but not someone else''s notes');
select rls_check.refused($$update public.profiles set role = 'member' where id = '0e0e0000-0000-4000-8000-00000000da7e'$$, 'an admin cannot change their own role (so there is always an admin)');
reset role;

-- Meeting recorder and AI notes (migration 16) ---------------------------------
-- Set up as the server would: an AI note in A written by Carol, and recordings
-- for Alice (summary not ready yet), Dave (summary ready) and Carol.
insert into public.notes (project_id, title, content_text, kind, created_by) values
  ('0e0e0000-0000-4000-8000-0000000000a0', 'rlscheck AI note', 'AI summary', 'ai', '0e0e0000-0000-4000-8000-00000000ca01');
insert into public.meeting_recordings (id, created_by, bot_id, meeting_url, title, status) values
  ('0e0e0000-0000-4000-8000-0000000000e1', '0e0e0000-0000-4000-8000-00000000a11c', 'rlscheck-bot-1', 'https://teams.microsoft.com/l/meetup-join/x', 'rlscheck Alice meeting', 'processing'),
  ('0e0e0000-0000-4000-8000-0000000000e3', '0e0e0000-0000-4000-8000-00000000ca01', 'rlscheck-bot-3', 'https://teams.microsoft.com/l/meetup-join/z', 'rlscheck Carol meeting', 'recording');
insert into public.meeting_recordings (id, created_by, bot_id, meeting_url, title, status, summary_title, summary_doc, summary_text) values
  ('0e0e0000-0000-4000-8000-0000000000e2', '0e0e0000-0000-4000-8000-00000000da7e', 'rlscheck-bot-2', 'https://teams.microsoft.com/l/meetup-join/y', 'rlscheck Dave meeting', 'ready',
   'rlscheck Dave summary', '{"type":"doc","content":[]}', 'summary');

set local role authenticated;
select rls_check.act_as('0e0e0000-0000-4000-8000-00000000a11c');
update public.notes set content_text = 'Alice added to the AI note' where title = 'rlscheck AI note';
select rls_check.ok((select content_text from public.notes where title = 'rlscheck AI note') = 'Alice added to the AI note', 'anyone on the project can edit an AI note');
select rls_check.refused($$update public.notes set kind = 'ai' where title = 'rlscheck Alice''s note'$$, 'a personal note cannot be turned into an AI note');
select rls_check.refused($$insert into public.notes (project_id, parent_id, title) select project_id, id, 'rlscheck sneaky subpage' from public.notes where title = 'rlscheck AI note'$$, 'nobody can add a subpage inside an AI note');
select rls_check.refused($$insert into public.notes (project_id, title, kind) values ('0e0e0000-0000-4000-8000-0000000000b0', 'rlscheck sneaky AI note', 'ai')$$, 'nobody can add an AI note to a project they are not on');
insert into public.notes (project_id, title, kind) values ('0e0e0000-0000-4000-8000-0000000000a0', 'rlscheck Alice AI note', 'ai');
select rls_check.ok(exists (select 1 from public.notes where title = 'rlscheck Alice AI note' and kind = 'ai'), 'a member can add an AI note to their own project');
select rls_check.ok(exists (select 1 from public.meeting_recordings where title = 'rlscheck Alice meeting'), 'you see your own recordings');
select rls_check.ok(not exists (select 1 from public.meeting_recordings where title <> 'rlscheck Alice meeting'), '…but nobody else''s');
select rls_check.refused($$insert into public.meeting_recordings (created_by, meeting_url) values ('0e0e0000-0000-4000-8000-00000000a11c', 'https://teams.microsoft.com/x')$$, 'nobody can add a recording directly (only the server can)');
select rls_check.refused($$update public.meeting_recordings set status = 'ready', summary_doc = '{}' where title = 'rlscheck Alice meeting'$$, 'nobody can fake a summary on their own recording');
select rls_check.refused($$select public.file_recording_note('0e0e0000-0000-4000-8000-0000000000e2')$$, 'only the server can file a summary directly');
select rls_check.refused($$select public.assign_recording('0e0e0000-0000-4000-8000-0000000000e1', '0e0e0000-0000-4000-8000-0000000000b0')$$, 'you cannot send a recording to a project you are not on');
select rls_check.refused($$select public.assign_recording('0e0e0000-0000-4000-8000-0000000000e2', '0e0e0000-0000-4000-8000-0000000000a0')$$, 'you cannot assign someone else''s recording');
select rls_check.ok(public.assign_recording('0e0e0000-0000-4000-8000-0000000000e1', '0e0e0000-0000-4000-8000-0000000000a0') is null, 'you can pick a project before the summary is ready');
select rls_check.ok((select project_id from public.meeting_recordings where title = 'rlscheck Alice meeting') = '0e0e0000-0000-4000-8000-0000000000a0', '…and the choice is saved');
delete from public.notes where title = 'rlscheck AI note';
select rls_check.ok(not exists (select 1 from public.notes where title = 'rlscheck AI note'), 'anyone on the project can delete an AI note');
reset role;

-- Carol (2FA) without her code sees none of her recordings.
set local role authenticated;
select rls_check.act_as('0e0e0000-0000-4000-8000-00000000ca01', 'aal1');
select rls_check.ok(not exists (select 1 from public.meeting_recordings), 'with 2FA set up, recordings stay hidden until the code is entered');
select rls_check.refused($$select public.assign_recording('0e0e0000-0000-4000-8000-0000000000e3', '0e0e0000-0000-4000-8000-0000000000a0')$$, '…and cannot be assigned without it');
reset role;

-- Bob sees no AI notes in projects he is not on.
set local role authenticated;
select rls_check.act_as('0e0e0000-0000-4000-8000-000000000b0b');
select rls_check.ok(not exists (select 1 from public.notes where kind = 'ai'), 'AI notes are private to the project');
reset role;

-- Dave (admin) assigns his ready recording: it becomes an AI note straight away.
set local role authenticated;
select rls_check.act_as('0e0e0000-0000-4000-8000-00000000da7e');
select rls_check.ok(public.assign_recording('0e0e0000-0000-4000-8000-0000000000e2', '0e0e0000-0000-4000-8000-0000000000b0') is not null, 'a ready summary becomes an AI note when a project is picked');
select rls_check.ok(exists (select 1 from public.notes where title = 'rlscheck Dave summary' and kind = 'ai' and project_id = '0e0e0000-0000-4000-8000-0000000000b0'), '…in the chosen project');
select rls_check.refused($$select public.assign_recording('0e0e0000-0000-4000-8000-0000000000e2', '0e0e0000-0000-4000-8000-0000000000a0')$$, '…and it cannot be added a second time');
reset role;

-- The server finishes Alice's summary: it goes into the project she picked earlier.
-- (The server's secret key carries no person, like here.)
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
update public.meeting_recordings set status = 'ready', summary_title = 'rlscheck Alice summary', summary_doc = '{"type":"doc","content":[]}', summary_text = 's'
 where id = '0e0e0000-0000-4000-8000-0000000000e1';
select rls_check.ok(public.file_recording_note('0e0e0000-0000-4000-8000-0000000000e1') is not null, 'a summary finished later is filed into the project picked earlier');
select rls_check.ok((select created_by from public.notes where title = 'rlscheck Alice summary') = '0e0e0000-0000-4000-8000-00000000a11c', '…as written by the person who sent the bot');
select rls_check.ok((select status from public.meeting_recordings where id = '0e0e0000-0000-4000-8000-0000000000e1') = 'filed', '…and the recording is marked as added');

-- Taken off a project / no longer an admin: their to-dos there become unassigned
delete from public.project_members where project_id = '0e0e0000-0000-4000-8000-0000000000a0' and user_id = '0e0e0000-0000-4000-8000-00000000ca01';
select rls_check.ok((select assignee_id from public.tasks where title = 'rlscheck for Carol') is null, 'taking someone off a project unassigns their to-dos there');
-- Nobody logged in (as when a role is changed in the Supabase dashboard).
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
update public.profiles set role = 'member' where id = '0e0e0000-0000-4000-8000-00000000da7e';
select rls_check.ok((select assignee_id from public.tasks where title = 'rlscheck for Dave') is null, 'an admin who becomes a member loses to-dos in projects they are not on');

-- Storage bucket settings
select rls_check.ok((select not public from storage.buckets where id = 'project-files'), 'the project-files bucket is private');
select rls_check.ok((select file_size_limit from storage.buckets where id = 'project-files') = 52428800, 'the project-files bucket has the 50 MB limit');

-- Every table has its rules switched on
select rls_check.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
), 'every table has row level security switched on');

rollback;

select 'ALL CHECKS PASSED. The test people and projects were removed again; nothing was saved.' as result;
