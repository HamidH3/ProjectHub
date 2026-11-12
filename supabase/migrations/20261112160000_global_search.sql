-- =============================================================================
-- ProjectHub — migration 10: search across everything
--
-- public.search_everything(query) looks through projects, notes, to-dos,
-- meetings and files in one go and returns the best matches of each kind.
--   * Matches as you type: "kick" finds "Kick-off", and "meetings" finds
--     "meeting" (English word endings are ignored).
--   * Runs with YOUR permissions (security invoker), so the normal rules
--     decide what you can find: members only ever get results from their own
--     projects.
--   * Note snippets mark the matching words with ⟦ ⟧; the app highlights
--     them (as plain text, never as HTML).
-- =============================================================================

-- Projects get a search column like the other tables.
alter table public.projects
  add column search tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'B')
  ) stored;
create index projects_search_idx on public.projects using gin (search);

-- File names are split on dots, dashes and underscores too, so "pdf" finds
-- "Report_Q3.pdf" and "q3" finds it as well.
alter table public.files drop column search;
alter table public.files
  add column search tsvector generated always as (
    to_tsvector('simple'::regconfig, regexp_replace(coalesce(name, ''), '[^[:alnum:]]+', ' ', 'g'))
  ) stored;
create index files_search_idx on public.files using gin (search);

-- Turns what someone typed into a "starts with" search: each word (letters
-- and numbers only, up to 10 words) must match the start of a word.
-- Returns null when there's nothing searchable in it.
create function private.prefix_query(p_text text, p_config regconfig)
returns tsquery
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when count(*) = 0 then null
    else to_tsquery(p_config, string_agg(w || ':*', ' & '))
  end
  from (
    select left(w, 50) as w
    from regexp_split_to_table(lower(coalesce(p_text, '')), '[^[:alnum:]]+') as w
    where w <> ''
    limit 10
  ) words;
$$;

revoke execute on function private.prefix_query(text, regconfig) from public, anon;
grant  execute on function private.prefix_query(text, regconfig) to authenticated;

create function public.search_everything(p_query text, p_limit integer default 6)
returns table (
  kind          text,      -- 'project' | 'note' | 'task' | 'meeting' | 'file'
  id            uuid,
  project_id    uuid,
  project_name  text,
  project_color text,
  title         text,
  snippet       text,      -- matching words marked with ⟦ ⟧ (notes, to-dos, meetings, projects)
  detail        text,      -- a day for to-dos/meetings, the type for files, the status for projects
  folder_id     uuid,      -- files only
  done          boolean,   -- to-dos only
  rank          real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select
      private.prefix_query(p_query, 'english') as en,
      private.prefix_query(p_query, 'simple')  as plain,
      least(greatest(coalesce(p_limit, 6), 1), 20) as n
  ),
  hl as (
    select 'MaxWords=18, MinWords=6, ShortWord=2, MaxFragments=1, FragmentDelimiter=" … ", StartSel=⟦, StopSel=⟧'::text as opts
  )
  (
    select 'project', p.id, p.id, p.name, p.color, p.name,
           case when p.description is not null then ts_headline('english', p.description, q.en, hl.opts) end,
           case when p.archived_at is not null then 'archived' else p.status::text end,
           null::uuid, null::boolean,
           ts_rank(p.search, q.en)
    from public.projects p, q, hl
    where q.en is not null and p.search @@ q.en
    order by ts_rank(p.search, q.en) desc, p.updated_at desc
    limit (select n from q)
  )
  union all
  (
    select 'note', n.id, n.project_id, p.name, p.color, n.title,
           ts_headline('english', left(n.content_text, 20000), q.en, hl.opts),
           null, null, null,
           ts_rank(n.search, q.en)
    from public.notes n
    join public.projects p on p.id = n.project_id, q, hl
    where q.en is not null and n.search @@ q.en
    order by ts_rank(n.search, q.en) desc, n.updated_at desc
    limit (select n from q)
  )
  union all
  (
    select 'task', t.id, t.project_id, p.name, p.color, t.title,
           case when t.description is not null then ts_headline('english', t.description, q.en, hl.opts) end,
           t.scheduled_date::text, null, t.completed_at is not null,
           ts_rank(t.search, q.en)
    from public.tasks t
    join public.projects p on p.id = t.project_id, q, hl
    where q.en is not null and t.search @@ q.en
    order by (t.completed_at is null) desc, ts_rank(t.search, q.en) desc, t.updated_at desc
    limit (select n from q)
  )
  union all
  (
    select 'meeting', m.id, m.project_id, p.name, p.color, m.title,
           case when coalesce(m.location, m.notes) is not null
                then ts_headline('english', concat_ws(' · ', m.location, m.notes), q.en, hl.opts) end,
           m.meeting_date::text, null, null,
           ts_rank(m.search, q.en)
    from public.meetings m
    join public.projects p on p.id = m.project_id, q, hl
    where q.en is not null and m.search @@ q.en
    order by ts_rank(m.search, q.en) desc, m.meeting_date desc
    limit (select n from q)
  )
  union all
  (
    select 'file', f.id, f.project_id, p.name, p.color, f.name,
           null, f.mime_type, f.folder_id, null,
           ts_rank(f.search, q.plain)
    from public.files f
    join public.projects p on p.id = f.project_id, q
    where q.plain is not null and f.search @@ q.plain
    order by ts_rank(f.search, q.plain) desc, f.created_at desc
    limit (select n from q)
  );
$$;

revoke execute on function public.search_everything(text, integer) from public, anon;
grant  execute on function public.search_everything(text, integer) to authenticated;
