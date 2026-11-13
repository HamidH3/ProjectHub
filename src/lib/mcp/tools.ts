import "server-only";

// What Claude can do in ProjectHub through the connector. Every tool runs as
// the signed-in person, through a Supabase client that carries THEIR token,
// so the database rules (RLS) decide what they can see and change, exactly
// like the website. Nothing here uses the secret key.
//
// Deliberately left out: deleting anything, managing people, project settings.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { addDays, dayLabel, dayLong, shortTime, startOfWeek, type Day } from "@/lib/days";
import {
  MEETING_COLUMNS,
  PRIORITY_NAMES,
  TASK_COLUMNS,
  assignableFor,
  checkMeeting,
  checkTaskTitle,
  compareTasks,
  personName,
  DESCRIPTION_MAX,
  LOCATION_MAX,
  type Priority,
  type Task,
  type Team,
} from "@/lib/schedule";
import { keyBetween } from "@/lib/note-tree";
import { parseDrawing } from "@/lib/drawing";
import { clip, docText, parseDay, parseTime, pickByName, textToDoc } from "@/lib/mcp/words";
import type { ToolDefinition, ToolResult } from "@/lib/mcp/protocol";

export type Me = { id: string; name: string; username: string | null; role: string; timezone: string };
export type ToolContext = { supabase: SupabaseClient<Database>; me: Me; today: Day };

const MAX_NOTE_TEXT = 1_000_000;

// ---------------------------------------------------------------- the list

const projectArg = { type: "string", description: "Project name (or part of it) or id." };
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export const TOOLS: ToolDefinition[] = [
  {
    name: "about_me",
    title: "Who am I",
    description: "The signed-in ProjectHub user: name, role, time zone and today's date. Use it to work out dates like 'Friday'.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Who am I", ...read },
  },
  {
    name: "list_projects",
    title: "List projects",
    description: "The projects the user can open, with their status, dates and number of open to-dos.",
    inputSchema: {
      type: "object",
      properties: { include_archived: { type: "boolean", description: "Also list archived projects." } },
      additionalProperties: false,
    },
    annotations: { title: "List projects", ...read },
  },
  {
    name: "list_todos",
    title: "List to-dos",
    description:
      "To-dos, newest problems first. Filter by project, by when (overdue, today, tomorrow, this_week, next_7_days, no_day, open, done) and by who they're for (me, unassigned, or a person's name).",
    inputSchema: {
      type: "object",
      properties: {
        project: projectArg,
        when: {
          type: "string",
          enum: ["open", "overdue", "today", "tomorrow", "this_week", "next_7_days", "no_day", "done"],
          description: "Which to-dos. Default: open (everything not done).",
        },
        for: { type: "string", description: "'me', 'unassigned', or a person's name." },
      },
      additionalProperties: false,
    },
    annotations: { title: "List to-dos", ...read },
  },
  {
    name: "add_todo",
    title: "Add a to-do",
    description: "Adds a to-do to a project. Day can be YYYY-MM-DD, 'today', 'tomorrow' or a weekday.",
    inputSchema: {
      type: "object",
      properties: {
        project: projectArg,
        title: { type: "string", description: "What needs doing." },
        day: { type: "string", description: "When: YYYY-MM-DD, today, tomorrow, or a weekday. Leave out for no day." },
        time: { type: "string", description: "Optional time, e.g. 14:30 or 2pm (needs a day)." },
        priority: { type: "string", enum: PRIORITY_NAMES, description: "Optional priority." },
        for: { type: "string", description: "Who it's for: 'me' or a person on the project. Leave out for nobody in particular." },
        notes: { type: "string", description: "Optional extra details." },
      },
      required: ["project", "title"],
      additionalProperties: false,
    },
    annotations: { title: "Add a to-do", ...write },
  },
  {
    name: "update_todo",
    title: "Update a to-do",
    description: "Ticks off, reopens or changes a to-do (name, day, time, priority, who it's for, notes). Find it by id or by its name.",
    inputSchema: {
      type: "object",
      properties: {
        todo: { type: "string", description: "The to-do's id, or its name (or part of it)." },
        project: { ...projectArg, description: "Optional: the project, to find the to-do by name more easily." },
        done: { type: "boolean", description: "true to tick it off, false to reopen it." },
        title: { type: "string" },
        day: { type: "string", description: "New day (YYYY-MM-DD, today, tomorrow, a weekday) or 'none'." },
        time: { type: "string", description: "New time (e.g. 14:30) or 'none'." },
        priority: { type: "string", enum: [...PRIORITY_NAMES, "none"] },
        for: { type: "string", description: "'me', a person's name, or 'nobody'." },
        notes: { type: "string" },
      },
      required: ["todo"],
      additionalProperties: false,
    },
    annotations: { title: "Update a to-do", ...write, idempotentHint: true },
  },
  {
    name: "list_meetings",
    title: "List meetings",
    description: "Meetings between two days (default: today and the next 13 days), optionally for one project.",
    inputSchema: {
      type: "object",
      properties: {
        project: projectArg,
        from: { type: "string", description: "First day (YYYY-MM-DD, today, a weekday…). Default today." },
        to: { type: "string", description: "Last day. Default 13 days after the first." },
      },
      additionalProperties: false,
    },
    annotations: { title: "List meetings", ...read },
  },
  {
    name: "add_meeting",
    title: "Add a meeting",
    description: "Adds a meeting to a project's calendar. Leave out the times for an all-day meeting.",
    inputSchema: {
      type: "object",
      properties: {
        project: projectArg,
        title: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD, today, tomorrow or a weekday." },
        start: { type: "string", description: "Start time, e.g. 10:00 or 10am." },
        end: { type: "string", description: "End time." },
        location: { type: "string", description: "Place or meeting link." },
        notes: { type: "string" },
      },
      required: ["project", "title", "date"],
      additionalProperties: false,
    },
    annotations: { title: "Add a meeting", ...write },
  },
  {
    name: "search",
    title: "Search everything",
    description: "Searches projects, notes, to-dos, meetings and files the user can see.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { title: "Search everything", ...read },
  },
  {
    name: "list_notes",
    title: "List a project's notes",
    description: "The notes in a project, as a tree, showing who wrote each one. The user can only change their own.",
    inputSchema: { type: "object", properties: { project: projectArg }, required: ["project"], additionalProperties: false },
    annotations: { title: "List a project's notes", ...read },
  },
  {
    name: "read_note",
    title: "Read a note",
    description: "The text of one note. Find it by id, or by title (optionally within a project).",
    inputSchema: {
      type: "object",
      properties: { note: { type: "string", description: "Note id or title." }, project: projectArg },
      required: ["note"],
      additionalProperties: false,
    },
    annotations: { title: "Read a note", ...read },
  },
  {
    name: "add_note",
    title: "Add a note",
    description:
      "Creates a note in the user's own section of a project. Text: blank lines make paragraphs, '- ' bullets, '[ ] ' tick boxes, '# ' headings. Can go inside another of the user's own notes.",
    inputSchema: {
      type: "object",
      properties: {
        project: projectArg,
        title: { type: "string" },
        text: { type: "string" },
        inside: { type: "string", description: "Optional: title or id of one of the user's own notes to put it inside." },
      },
      required: ["project", "title"],
      additionalProperties: false,
    },
    annotations: { title: "Add a note", ...write },
  },
  {
    name: "add_to_note",
    title: "Add to a note",
    description: "Adds text to the end of one of the user's own notes (same text format as add_note).",
    inputSchema: {
      type: "object",
      properties: {
        note: { type: "string", description: "Note id or title (must be the user's own note)." },
        project: projectArg,
        text: { type: "string" },
      },
      required: ["note", "text"],
      additionalProperties: false,
    },
    annotations: { title: "Add to a note", ...write },
  },
];

// ---------------------------------------------------------------- helpers

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const fail = (text: string): ToolResult => ({ text, isError: true });

type ProjectRow = { id: string; name: string; status: string; start_date: string | null; deadline: string | null; archived_at: string | null };

async function loadProjects(ctx: ToolContext, includeArchived = false): Promise<ProjectRow[]> {
  let q = ctx.supabase.from("projects").select("id, name, status, start_date, deadline, archived_at").order("position");
  if (!includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

async function findProject(ctx: ToolContext, query: unknown) {
  const q = str(query);
  if (!q) return { error: "Say which project." };
  return pickByName(await loadProjects(ctx, true), q, "project");
}

async function loadTeam(ctx: ToolContext): Promise<Team> {
  const [people, members] = await Promise.all([
    ctx.supabase.from("profiles").select("id, full_name, username, role"),
    ctx.supabase.from("project_members").select("project_id, user_id"),
  ]);
  if (people.error || members.error) throw new Error("Couldn't load people.");
  const access: Record<string, string[]> = {};
  for (const m of members.data) (access[m.project_id] ??= []).push(m.user_id);
  return { people: people.data.map((p) => ({ id: p.id, name: personName(p), isAdmin: p.role === "admin" })), access };
}

// "me" / "nobody" / a name → a person who can open the project (or null).
function findPerson(team: Team, projectId: string, me: Me, query: string): { id: string | null; name: string } | { error: string } {
  const q = query.trim().toLowerCase();
  if (["me", "myself", "i", "you"].includes(q)) return { id: me.id, name: "you" };
  if (["nobody", "none", "no one", "noone", "unassigned", ""].includes(q)) return { id: null, name: "nobody" };
  const found = pickByName(assignableFor(team, projectId, me.id), query, "person on this project");
  return "error" in found ? found : { id: found.item.id, name: found.item.id === me.id ? "you" : found.item.name };
}

function nameOf(team: Team, me: Me, id: string | null) {
  if (!id) return null;
  if (id === me.id) return "you";
  return team.people.find((p) => p.id === id)?.name ?? "someone";
}

function dayText(day: string | null, today: Day) {
  return day ? `${dayLabel(day, today)} (${day})` : "no day";
}

function todoLine(t: Task, projectName: string | undefined, team: Team, ctx: ToolContext) {
  const bits = [
    dayText(t.scheduled_date, ctx.today) + (t.due_time ? ` ${shortTime(t.due_time)}` : ""),
    t.priority ? `${t.priority} priority` : null,
    t.assignee_id ? `for ${nameOf(team, ctx.me, t.assignee_id)}` : null,
    projectName,
  ].filter(Boolean);
  return `- [${t.completed_at ? "x" : " "}] ${t.title} · ${bits.join(" · ")} · id ${t.id}`;
}

function todoData(t: Task, projectName: string | undefined, team: Team, me: Me) {
  return {
    id: t.id,
    title: t.title,
    project: projectName,
    project_id: t.project_id,
    day: t.scheduled_date,
    time: shortTime(t.due_time),
    priority: t.priority,
    for: nameOf(team, me, t.assignee_id),
    done: Boolean(t.completed_at),
    notes: t.description,
  };
}

// A day the user typed, or an error saying what we accept.
function dayArg(value: unknown, ctx: ToolContext, label = "day"): { day: Day | null } | { error: string } {
  const s = str(value);
  if (s === undefined) return { day: null };
  const d = parseDay(s, ctx.today);
  return d ? { day: d } : { error: `Couldn't understand the ${label} "${s}". Use YYYY-MM-DD, today, tomorrow or a weekday.` };
}

async function findNote(ctx: ToolContext, query: string, project?: string, onlyMine = false) {
  let projectId: string | undefined;
  if (project) {
    const p = await findProject(ctx, project);
    if ("error" in p) return p;
    projectId = p.item.id;
  }
  let q = ctx.supabase.from("notes").select("id, title, project_id, created_by").order("updated_at", { ascending: false }).limit(500);
  if (projectId) q = q.eq("project_id", projectId);
  if (onlyMine) q = q.eq("created_by", ctx.me.id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const found = pickByName(
    data.map((n) => ({ ...n, name: n.title })),
    query,
    onlyMine ? "note of yours" : "note",
  );
  return found;
}

// ---------------------------------------------------------------- the tools

export async function callTool(name: string, args: Args, ctx: ToolContext): Promise<ToolResult> {
  const { supabase, me, today } = ctx;

  switch (name) {
    case "about_me": {
      const data = { name: me.name, username: me.username, role: me.role, timezone: me.timezone, today, today_long: dayLong(today) };
      return {
        text: `You're ${me.name}${me.username ? ` (@${me.username})` : ""}, ${me.role === "admin" ? "an admin" : "a member"}. Today is ${dayLong(today)} (${today}), time zone ${me.timezone}.`,
        data,
      };
    }

    case "list_projects": {
      const projects = await loadProjects(ctx, args.include_archived === true);
      const { data: open, error } = await supabase.from("tasks").select("project_id").is("completed_at", null).limit(10000);
      if (error) throw new Error(error.message);
      const counts: Record<string, number> = {};
      for (const t of open) counts[t.project_id] = (counts[t.project_id] ?? 0) + 1;
      if (projects.length === 0) return { text: "You don't have any projects yet.", data: [] };
      const lines = projects.map((p) => {
        const bits = [p.status.replace(/_/g, " "), p.deadline ? `due ${p.deadline}` : null, p.archived_at ? "archived" : null]
          .filter(Boolean)
          .join(", ");
        return `- ${p.name} (${bits}) · ${counts[p.id] ?? 0} open to-dos · id ${p.id}`;
      });
      return {
        text: `${projects.length} project${projects.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
        data: projects.map((p) => ({ ...p, open_todos: counts[p.id] ?? 0 })),
      };
    }

    case "list_todos": {
      const [projects, team] = await Promise.all([loadProjects(ctx, true), loadTeam(ctx)]);
      const projectName = (id: string) => projects.find((p) => p.id === id)?.name;
      let q = supabase.from("tasks").select(TASK_COLUMNS).limit(200);
      if (args.project !== undefined) {
        const p = pickByName(projects, String(args.project), "project");
        if ("error" in p) return fail(p.error);
        q = q.eq("project_id", p.item.id);
      }
      const when = str(args.when) ?? "open";
      if (when === "done") q = q.not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(50);
      else q = q.is("completed_at", null);
      if (when === "overdue") q = q.lt("scheduled_date", today);
      if (when === "today") q = q.eq("scheduled_date", today);
      if (when === "tomorrow") q = q.eq("scheduled_date", addDays(today, 1));
      if (when === "this_week") q = q.gte("scheduled_date", today).lte("scheduled_date", addDays(startOfWeek(today), 6));
      if (when === "next_7_days") q = q.gte("scheduled_date", today).lte("scheduled_date", addDays(today, 6));
      if (when === "no_day") q = q.is("scheduled_date", null);
      const who = str(args.for);
      if (who) {
        const w = who.trim().toLowerCase();
        if (["me", "myself", "i"].includes(w)) q = q.eq("assignee_id", me.id);
        else if (["unassigned", "nobody", "none"].includes(w)) q = q.is("assignee_id", null);
        else {
          const person = pickByName(team.people, who, "person");
          if ("error" in person) return fail(person.error);
          q = q.eq("assignee_id", person.item.id);
        }
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const tasks = when === "done" ? data : [...data].sort(compareTasks);
      if (tasks.length === 0) return { text: "No to-dos match.", data: [] };
      return {
        text: `${tasks.length} to-do${tasks.length === 1 ? "" : "s"} (${when.replace(/_/g, " ")}):\n${tasks
          .map((t) => todoLine(t, projectName(t.project_id), team, ctx))
          .join("\n")}`,
        data: tasks.map((t) => todoData(t, projectName(t.project_id), team, me)),
      };
    }

    case "add_todo": {
      const title = str(args.title) ?? "";
      const problem = checkTaskTitle(title);
      if (problem) return fail(problem);
      const p = await findProject(ctx, args.project);
      if ("error" in p) return fail(p.error);
      if (p.item.archived_at) return fail(`${p.item.name} is archived. Restore it in ProjectHub first.`);
      const d = dayArg(args.day, ctx);
      if ("error" in d) return fail(d.error);
      const time = str(args.time) ? parseTime(str(args.time)) : null;
      if (str(args.time) && !time) return fail(`Couldn't understand the time "${args.time}". Use e.g. 14:30 or 2pm.`);
      if (time && !d.day) return fail("A time needs a day too.");
      const priority = str(args.priority) as Priority | undefined;
      if (priority && !PRIORITY_NAMES.includes(priority)) return fail(`Priority must be one of: ${PRIORITY_NAMES.join(", ")}.`);
      let assignee: { id: string | null; name: string } = { id: null, name: "nobody" };
      if (str(args.for)) {
        const team = await loadTeam(ctx);
        const found = findPerson(team, p.item.id, me, str(args.for)!);
        if ("error" in found) return fail(found.error);
        assignee = found;
      }
      const notes = str(args.notes)?.trim().slice(0, DESCRIPTION_MAX) || null;
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          project_id: p.item.id,
          title: title.trim(),
          description: notes,
          scheduled_date: d.day,
          due_time: time,
          priority: priority ?? null,
          assignee_id: assignee.id,
        })
        .select("id")
        .single();
      if (error) return fail(error.message.includes("can't open this project") ? "That person isn't on this project." : `Couldn't add it: ${error.message}`);
      return {
        text: `Added "${title.trim()}" to ${p.item.name} · ${dayText(d.day, today)}${time ? ` ${time}` : ""}${priority ? ` · ${priority} priority` : ""}${assignee.id ? ` · for ${assignee.name}` : ""}. (id ${data.id})`,
        data: { id: data.id },
      };
    }

    case "update_todo": {
      const ref = str(args.todo) ?? "";
      let q = supabase.from("tasks").select(TASK_COLUMNS).order("created_at", { ascending: false }).limit(1000);
      if (args.project !== undefined) {
        const p = await findProject(ctx, args.project);
        if ("error" in p) return fail(p.error);
        q = q.eq("project_id", p.item.id);
      }
      const { data: all, error } = await q;
      if (error) throw new Error(error.message);
      // Prefer open to-dos when finding by name.
      const preferred = all.filter((t) => (args.done === false ? t.completed_at : !t.completed_at));
      const candidates = all.some((t) => t.id === ref) || preferred.length === 0 ? all : preferred;
      const found = pickByName(candidates.map((t) => ({ ...t, name: t.title })), ref, "to-do");
      if ("error" in found) return fail(found.error);
      const task = found.item;

      const patch: Database["public"]["Tables"]["tasks"]["Update"] = {};
      const said: string[] = [];
      if (typeof args.done === "boolean") {
        patch.completed_at = args.done ? new Date().toISOString() : null;
        said.push(args.done ? "ticked off" : "reopened");
      }
      if (str(args.title) !== undefined) {
        const problem = checkTaskTitle(str(args.title)!);
        if (problem) return fail(problem);
        patch.title = str(args.title)!.trim();
        said.push(`renamed to "${patch.title}"`);
      }
      if (str(args.day) !== undefined) {
        if (str(args.day)!.trim().toLowerCase() === "none") {
          patch.scheduled_date = null;
          patch.due_time = null;
          said.push("no day");
        } else {
          const d = dayArg(args.day, ctx);
          if ("error" in d) return fail(d.error);
          patch.scheduled_date = d.day;
          said.push(`moved to ${dayText(d.day, today)}`);
        }
      }
      if (str(args.time) !== undefined) {
        if (str(args.time)!.trim().toLowerCase() === "none") patch.due_time = null;
        else {
          const time = parseTime(str(args.time));
          if (!time) return fail(`Couldn't understand the time "${args.time}".`);
          if (!(patch.scheduled_date ?? task.scheduled_date)) return fail("A time needs a day too.");
          patch.due_time = time;
        }
        said.push(patch.due_time ? `at ${patch.due_time}` : "no time");
      }
      if (str(args.priority) !== undefined) {
        const pr = str(args.priority)!;
        if (pr !== "none" && !PRIORITY_NAMES.includes(pr as Priority)) return fail(`Priority must be one of: ${PRIORITY_NAMES.join(", ")}, none.`);
        patch.priority = pr === "none" ? null : (pr as Priority);
        said.push(pr === "none" ? "no priority" : `${pr} priority`);
      }
      if (str(args.for) !== undefined) {
        const team = await loadTeam(ctx);
        const person = findPerson(team, task.project_id, me, str(args.for)!);
        if ("error" in person) return fail(person.error);
        patch.assignee_id = person.id;
        said.push(person.id ? `for ${person.name}` : "for nobody in particular");
      }
      if (str(args.notes) !== undefined) {
        patch.description = str(args.notes)!.trim().slice(0, DESCRIPTION_MAX) || null;
        said.push("notes updated");
      }
      if (said.length === 0) return fail("Nothing to change: say what to update (done, title, day, time, priority, for, notes).");
      const { error: upErr, data: updated } = await supabase.from("tasks").update(patch).eq("id", task.id).select("id");
      if (upErr) return fail(upErr.message.includes("can't open this project") ? "That person isn't on this project." : `Couldn't update it: ${upErr.message}`);
      if (!updated?.length) return fail("You can't change that to-do.");
      return { text: `"${task.title}": ${said.join(", ")}.`, data: { id: task.id } };
    }

    case "list_meetings": {
      const from = dayArg(args.from ?? "today", ctx, "start day");
      if ("error" in from) return fail(from.error);
      const to = dayArg(args.to, ctx, "end day");
      if ("error" in to) return fail(to.error);
      const first = from.day!;
      const last = to.day ?? addDays(first, 13);
      const projects = await loadProjects(ctx, true);
      let q = supabase
        .from("meetings")
        .select(MEETING_COLUMNS)
        .gte("meeting_date", first)
        .lte("meeting_date", last)
        .order("meeting_date")
        .order("start_time", { nullsFirst: true })
        .limit(200);
      if (args.project !== undefined) {
        const p = pickByName(projects, String(args.project), "project");
        if ("error" in p) return fail(p.error);
        q = q.eq("project_id", p.item.id);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      if (data.length === 0) return { text: `No meetings between ${first} and ${last}.`, data: [] };
      const pn = (id: string) => projects.find((p) => p.id === id)?.name;
      const lines = data.map((m) => {
        const time = m.start_time ? `${shortTime(m.start_time)}${m.end_time ? `–${shortTime(m.end_time)}` : ""}` : "all day";
        return `- ${dayText(m.meeting_date, today)} ${time} · ${m.title} · ${pn(m.project_id)}${m.location ? ` · ${m.location}` : ""} · id ${m.id}`;
      });
      return {
        text: `${data.length} meeting${data.length === 1 ? "" : "s"} from ${first} to ${last}:\n${lines.join("\n")}`,
        data: data.map((m) => ({ ...m, project: pn(m.project_id) })),
      };
    }

    case "add_meeting": {
      const p = await findProject(ctx, args.project);
      if ("error" in p) return fail(p.error);
      if (p.item.archived_at) return fail(`${p.item.name} is archived. Restore it in ProjectHub first.`);
      const d = dayArg(args.date, ctx, "date");
      if ("error" in d) return fail(d.error);
      if (!d.day) return fail("Say which day the meeting is.");
      const start = str(args.start) ? parseTime(str(args.start)) : null;
      const end = str(args.end) ? parseTime(str(args.end)) : null;
      if (str(args.start) && !start) return fail(`Couldn't understand the start time "${args.start}".`);
      if (str(args.end) && !end) return fail(`Couldn't understand the end time "${args.end}".`);
      const title = (str(args.title) ?? "").trim();
      const problem = checkMeeting({ title, start_time: start, end_time: end });
      if (problem) return fail(problem);
      const { data, error } = await supabase
        .from("meetings")
        .insert({
          project_id: p.item.id,
          title,
          meeting_date: d.day,
          start_time: start,
          end_time: end,
          location: str(args.location)?.trim().slice(0, LOCATION_MAX) || null,
          notes: str(args.notes)?.trim().slice(0, DESCRIPTION_MAX) || null,
        })
        .select("id")
        .single();
      if (error) return fail(`Couldn't add it: ${error.message}`);
      return {
        text: `Added the meeting "${title}" to ${p.item.name} on ${dayText(d.day, today)}${start ? ` at ${start}${end ? `–${end}` : ""}` : " (all day)"}. (id ${data.id})`,
        data: { id: data.id },
      };
    }

    case "search": {
      const query = (str(args.query) ?? "").trim();
      if (!query) return fail("Say what to search for.");
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      const { data, error } = await supabase.rpc("search_everything", { p_query: query, p_limit: limit });
      if (error) throw new Error(error.message);
      if (!data?.length) return { text: `Nothing found for "${query}".`, data: [] };
      const lines = data.map(
        (r) =>
          `- ${r.kind}: ${r.title} · ${r.project_name ?? ""}${r.snippet ? ` · "${r.snippet.replace(/[⟦⟧]/g, "")}"` : ""}${r.detail ? ` · ${r.detail}` : ""} · id ${r.id}`,
      );
      return { text: `${data.length} result${data.length === 1 ? "" : "s"} for "${query}":\n${lines.join("\n")}`, data };
    }

    case "list_notes": {
      const p = await findProject(ctx, args.project);
      if ("error" in p) return fail(p.error);
      const [{ data, error }, team] = await Promise.all([
        supabase.from("notes").select("id, parent_id, title, preview, updated_at, created_by").eq("project_id", p.item.id).order("position"),
        loadTeam(ctx),
      ]);
      if (error) throw new Error(error.message);
      if (data.length === 0) return { text: `${p.item.name} has no notes yet.`, data: [] };
      const ids = new Set(data.map((n) => n.id));
      const lines: string[] = [];
      const walk = (parent: string | null, depth: number) => {
        for (const n of data.filter((x) => (x.parent_id && ids.has(x.parent_id) ? x.parent_id : null) === parent)) {
          const who = n.created_by === me.id ? "yours" : `${nameOf(team, me, n.created_by) ?? "earlier"}'s, view only`;
          lines.push(`${"  ".repeat(depth)}- ${n.title || "Untitled"} (${who}) · id ${n.id}`);
          walk(n.id, depth + 1);
        }
      };
      walk(null, 0);
      return { text: `Notes in ${p.item.name}:\n${lines.join("\n")}`, data };
    }

    case "read_note": {
      const found = await findNote(ctx, str(args.note) ?? "", str(args.project));
      if ("error" in found) return fail(found.error);
      const { data: n, error } = await supabase
        .from("notes")
        .select("id, title, content_text, created_by, updated_at, project_id, drawing")
        .eq("id", found.item.id)
        .single();
      if (error) throw new Error(error.message);
      const team = await loadTeam(ctx);
      const mine = n.created_by === me.id;
      const drawn = parseDrawing(n.drawing).items.length;
      const head = `${n.title || "Untitled"} (${mine ? "your note" : `${nameOf(team, me, n.created_by) ?? "an earlier"}'s note, view only`}, edited ${n.updated_at.slice(0, 10)})`;
      const extra = drawn ? `\n\n(This note also has ${drawn} drawing${drawn === 1 ? "" : "s"} or picture${drawn === 1 ? "" : "s"}, which can only be seen in ProjectHub.)` : "";
      return {
        text: `${head}\n\n${clip(n.content_text || "(empty)", 20000)}${extra}`,
        data: { id: n.id, title: n.title, yours: mine, text: clip(n.content_text, 20000) },
      };
    }

    case "add_note": {
      const p = await findProject(ctx, args.project);
      if ("error" in p) return fail(p.error);
      const title = (str(args.title) ?? "").trim().slice(0, 200) || "Untitled";
      let parentId: string | null = null;
      if (str(args.inside)) {
        const parent = await findNote(ctx, str(args.inside)!, p.item.id, true);
        if ("error" in parent) return fail(parent.error);
        parentId = parent.item.id;
      }
      let siblings = supabase.from("notes").select("position").eq("project_id", p.item.id).order("position", { ascending: false }).limit(1);
      siblings = parentId ? siblings.eq("parent_id", parentId) : siblings.is("parent_id", null);
      const { data: last } = await siblings;
      const doc = textToDoc(str(args.text) ?? "");
      const { data, error } = await supabase
        .from("notes")
        .insert({
          project_id: p.item.id,
          parent_id: parentId,
          title,
          content: doc as unknown as Json,
          content_text: docText(doc).slice(0, MAX_NOTE_TEXT),
          position: keyBetween(last?.[0]?.position ?? null, null) ?? "a0",
        })
        .select("id")
        .single();
      if (error) return fail(`Couldn't add the note: ${error.message}`);
      return { text: `Added the note "${title}" to your notes in ${p.item.name}. (id ${data.id})`, data: { id: data.id } };
    }

    case "add_to_note": {
      const text = str(args.text) ?? "";
      if (!text.trim()) return fail("Say what to add.");
      const found = await findNote(ctx, str(args.note) ?? "", str(args.project), true);
      if ("error" in found) return fail(found.error);
      const { data: n, error } = await supabase
        .from("notes")
        .select("id, title, content, content_text")
        .eq("id", found.item.id)
        .single();
      if (error) throw new Error(error.message);
      const added = textToDoc(text);
      const current = (n.content as { type?: string; content?: unknown[] } | null) ?? {};
      const content = { type: "doc", content: [...(Array.isArray(current.content) ? current.content : []), ...added.content] };
      const { data: updated, error: upErr } = await supabase
        .from("notes")
        .update({
          content: content as unknown as Json,
          content_text: `${n.content_text}${n.content_text ? "\n" : ""}${docText(added)}`.slice(0, MAX_NOTE_TEXT),
        })
        .eq("id", n.id)
        .eq("created_by", me.id)
        .select("id");
      if (upErr) return fail(`Couldn't add to it: ${upErr.message}`);
      if (!updated?.length) return fail("You can only add to your own notes.");
      return { text: `Added to "${n.title}".`, data: { id: n.id } };
    }

    default:
      return fail(`Unknown tool ${name}.`);
  }
}
