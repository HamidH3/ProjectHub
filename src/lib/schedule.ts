// Shapes and sorting for to-dos and meetings. Safe to use on the server and in
// the browser (no database calls here).
import { addDays, type Day } from "@/lib/days";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
export type Priority = Database["public"]["Enums"]["task_priority"];

export const TASK_COLUMNS =
  "id, project_id, title, description, scheduled_date, due_time, priority, completed_at, position, assignee_id, created_by, created_at" as const;
export type Task = Pick<
  Tables["tasks"]["Row"],
  | "id"
  | "project_id"
  | "title"
  | "description"
  | "scheduled_date"
  | "due_time"
  | "priority"
  | "completed_at"
  | "position"
  | "assignee_id"
  | "created_by"
  | "created_at"
>;

export const MEETING_COLUMNS =
  "id, project_id, title, meeting_date, start_time, end_time, location, notes, created_at" as const;
export type Meeting = Pick<
  Tables["meetings"]["Row"],
  "id" | "project_id" | "title" | "meeting_date" | "start_time" | "end_time" | "location" | "notes" | "created_at"
>;

// The bits of a project that to-do and calendar screens need.
export type ProjectLite = { id: string; name: string; color: string };

// People a to-do can be assigned to. "access" lists, for each project, the
// people on it; admins can open every project, so they're on every list.
export type TeamPerson = { id: string; name: string; isAdmin: boolean };
export type Team = { people: TeamPerson[]; access: Record<string, string[]> };

export function personName(p: { full_name: string | null; username: string | null }): string {
  return p.full_name?.trim() || p.username || "Invited person";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}

// Who a to-do in this project can be assigned to: you first, then everyone
// else on the project (members and admins) by name. The database checks the
// same thing, so this list is only for convenience.
export function assignableFor(team: Team, projectId: string, meId: string): TeamPerson[] {
  const onProject = new Set(team.access[projectId] ?? []);
  return team.people
    .filter((p) => p.isAdmin || onProject.has(p.id))
    .sort((a, b) => Number(b.id === meId) - Number(a.id === meId) || a.name.localeCompare(b.name));
}

export const PRIORITIES: Record<Priority, { label: string; color: string; rank: number }> = {
  high: { label: "High", color: "#e5484d", rank: 0 },
  medium: { label: "Medium", color: "#e5b94e", rank: 1 },
  low: { label: "Low", color: "#6aa4f0", rank: 2 },
};
export const PRIORITY_NAMES = Object.keys(PRIORITIES) as Priority[];

export const TITLE_MAX = 300;
export const DESCRIPTION_MAX = 5000;
export const MEETING_TITLE_MAX = 200;
export const LOCATION_MAX = 500;

// Within a day: timed to-dos first (earliest first), then by priority, then
// in the order they were added.
export function compareTasks(a: Task, b: Task): number {
  if (a.due_time && b.due_time) return a.due_time.localeCompare(b.due_time) || a.created_at.localeCompare(b.created_at);
  if (a.due_time) return -1;
  if (b.due_time) return 1;
  const pa = a.priority ? PRIORITIES[a.priority].rank : 3;
  const pb = b.priority ? PRIORITIES[b.priority].rank : 3;
  return pa - pb || a.created_at.localeCompare(b.created_at);
}

// All-day meetings first, then by start time.
export function compareMeetings(a: Meeting, b: Meeting): number {
  if (!a.start_time && b.start_time) return -1;
  if (a.start_time && !b.start_time) return 1;
  return (a.start_time ?? "").localeCompare(b.start_time ?? "") || a.created_at.localeCompare(b.created_at);
}

export type TaskGroup = {
  key: string;
  day: Day | null; // the day new to-dos in this group get (null = no date)
  kind: "overdue" | "day" | "later" | "undated";
  tasks: Task[];
};

// Open to-dos grouped for the "Upcoming" list: Overdue, then each of the next
// seven days (always shown, so you can plan any day of the week), then Later
// and No date (only when they have something in them).
export function groupUpcoming(tasks: Task[], today: Day): TaskGroup[] {
  const open = tasks.filter((t) => !t.completed_at).sort(compareTasks);
  const lastDay = addDays(today, 6);
  const groups: TaskGroup[] = [];

  const overdue = open
    .filter((t) => t.scheduled_date && t.scheduled_date < today)
    .sort((a, b) => a.scheduled_date!.localeCompare(b.scheduled_date!) || compareTasks(a, b));
  if (overdue.length) groups.push({ key: "overdue", day: today, kind: "overdue", tasks: overdue });

  for (let i = 0; i < 7; i++) {
    const day = addDays(today, i);
    groups.push({ key: day, day, kind: "day", tasks: open.filter((t) => t.scheduled_date === day) });
  }

  const later = open
    .filter((t) => t.scheduled_date && t.scheduled_date > lastDay)
    .sort((a, b) => a.scheduled_date!.localeCompare(b.scheduled_date!) || compareTasks(a, b));
  if (later.length) groups.push({ key: "later", day: addDays(today, 7), kind: "later", tasks: later });

  const undated = open.filter((t) => !t.scheduled_date);
  if (undated.length) groups.push({ key: "undated", day: null, kind: "undated", tasks: undated });

  return groups;
}

// Clean up what someone typed before it's sent to the database. Returns an
// error message, or null when it's fine.
export function checkTaskTitle(title: string): string | null {
  const t = title.trim();
  if (!t) return "Give the to-do a name.";
  if (t.length > TITLE_MAX) return `Keep it under ${TITLE_MAX} characters.`;
  return null;
}

export function checkMeeting(m: { title: string; start_time: string | null; end_time: string | null }): string | null {
  const t = m.title.trim();
  if (!t) return "Give the meeting a name.";
  if (t.length > MEETING_TITLE_MAX) return `Keep the name under ${MEETING_TITLE_MAX} characters.`;
  if (m.end_time && !m.start_time) return "Add a start time, or clear the end time.";
  if (m.end_time && m.start_time && m.end_time <= m.start_time) return "The meeting has to end after it starts.";
  return null;
}
