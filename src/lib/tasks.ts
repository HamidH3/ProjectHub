// Loading to-dos and meetings. Everything here uses the logged-in user's
// session, so the database only returns rows from projects they can open.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, monthGrid, type Day, type Month } from "@/lib/days";
import { MEETING_COLUMNS, TASK_COLUMNS, type Meeting, type ProjectLite, type Task } from "@/lib/schedule";

const COMPLETED_SHOWN = 100;

// The Tasks tab: every open to-do, the most recently finished ones, and the
// meetings in the coming week (shown alongside each day).
export async function getProjectTaskBoard(projectId: string, today: Day) {
  const supabase = await createClient();
  const [open, done, meetings] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).eq("project_id", projectId).is("completed_at", null),
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("project_id", projectId)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(COMPLETED_SHOWN),
    supabase
      .from("meetings")
      .select(MEETING_COLUMNS)
      .eq("project_id", projectId)
      .gte("meeting_date", today)
      .lte("meeting_date", addDays(today, 6)),
  ]);
  if (open.error || done.error || meetings.error) throw new Error("Couldn't load the to-dos.");
  return { tasks: [...open.data, ...done.data] as Task[], meetings: meetings.data as Meeting[] };
}

// A month on the calendar (whole weeks, so the first and last rows include a
// few days from the months either side). Leave projectId out for all projects.
export async function getCalendarMonth(month: Month, projectId?: string) {
  const supabase = await createClient();
  const days = monthGrid(month);
  const from = days[0];
  const to = days[days.length - 1];

  let tasks = supabase.from("tasks").select(TASK_COLUMNS).gte("scheduled_date", from).lte("scheduled_date", to);
  let meetings = supabase.from("meetings").select(MEETING_COLUMNS).gte("meeting_date", from).lte("meeting_date", to);
  if (projectId) {
    tasks = tasks.eq("project_id", projectId);
    meetings = meetings.eq("project_id", projectId);
  }
  const [t, m] = await Promise.all([tasks, meetings]);
  if (t.error || m.error) throw new Error("Couldn't load the calendar.");
  return { days, tasks: t.data as Task[], meetings: m.data as Meeting[] };
}

// The home page's sticky notes: open to-dos due today or earlier, to-dos for
// today that are already ticked (so they show crossed out), and today's meetings.
export async function getTodayBoard(today: Day) {
  const supabase = await createClient();
  const [open, doneToday, meetings] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).is("completed_at", null).lte("scheduled_date", today),
    supabase.from("tasks").select(TASK_COLUMNS).not("completed_at", "is", null).eq("scheduled_date", today),
    supabase.from("meetings").select(MEETING_COLUMNS).eq("meeting_date", today),
  ]);
  if (open.error || doneToday.error || meetings.error) throw new Error("Couldn't load today's to-dos.");
  return { tasks: [...open.data, ...doneToday.data] as Task[], meetings: meetings.data as Meeting[] };
}

export function toProjectLite(p: { id: string; name: string; color: string }): ProjectLite {
  return { id: p.id, name: p.name, color: p.color };
}
