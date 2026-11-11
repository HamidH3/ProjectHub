// Reading projects. Everything here uses the logged-in user's session, so the
// database only ever returns projects that user is allowed to see.
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { projectIdSchema } from "@/lib/validation/project";
import { todayIn } from "@/lib/dates";
import type { Database } from "@/types/database";

export type Project = Database["public"]["Tables"]["projects"]["Row"];

// The sidebar gets full rows so its menu can open "Edit details" directly.
export type SidebarProject = Project;

export type ProjectCardData = Project & {
  openToday: number;
  overdue: number;
  done: number;
  total: number;
};

// Active (not archived) projects for the sidebar, in sidebar order.
export const getSidebarProjects = cache(async (): Promise<SidebarProject[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .is("archived_at", null)
    .order("position")
    .order("created_at");
  if (error) throw new Error("Couldn't load your projects.");
  return data;
});

// Projects for the home page, most recently opened first, with to-do counts.
export async function getHomeProjects(userId: string, timezone: string): Promise<ProjectCardData[]> {
  const supabase = await createClient();
  const today = todayIn(timezone);

  const [projects, tasks, views] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    supabase.from("tasks").select("project_id, completed_at, scheduled_date"),
    supabase.from("project_views").select("project_id, viewed_at").eq("user_id", userId),
  ]);
  if (projects.error) throw new Error("Couldn't load your projects.");

  const lastViewed = new Map((views.data ?? []).map((v) => [v.project_id, v.viewed_at]));
  const stats = new Map<string, { openToday: number; overdue: number; done: number; total: number }>();
  for (const t of tasks.data ?? []) {
    const s = stats.get(t.project_id) ?? { openToday: 0, overdue: 0, done: 0, total: 0 };
    s.total += 1;
    if (t.completed_at) s.done += 1;
    else if (t.scheduled_date === today) s.openToday += 1;
    else if (t.scheduled_date && t.scheduled_date < today) s.overdue += 1;
    stats.set(t.project_id, s);
  }

  return projects.data
    .map((p) => ({ ...p, ...(stats.get(p.id) ?? { openToday: 0, overdue: 0, done: 0, total: 0 }) }))
    .sort((a, b) => (lastViewed.get(b.id) ?? b.created_at).localeCompare(lastViewed.get(a.id) ?? a.created_at));
}

// One project, or a 404 if it doesn't exist or you can't access it.
export const getProject = cache(async (projectId: string): Promise<Project> => {
  if (!projectIdSchema.safeParse(projectId).success) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!data) notFound();
  return data;
});

export type ProjectMember = {
  userId: string;
  name: string;
  username: string | null;
  role: Database["public"]["Enums"]["app_role"] | null;
};

// Counts and people for the Overview tab.
export async function getProjectOverview(projectId: string) {
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };

  const [notes, files, open, done, members] = await Promise.all([
    supabase.from("notes").select("id", head).eq("project_id", projectId),
    supabase.from("files").select("id", head).eq("project_id", projectId),
    supabase.from("tasks").select("id", head).eq("project_id", projectId).is("completed_at", null),
    supabase.from("tasks").select("id", head).eq("project_id", projectId).not("completed_at", "is", null),
    supabase
      .from("project_members")
      .select("user_id, profiles!project_members_user_id_fkey(full_name, username, role)")
      .eq("project_id", projectId),
  ]);

  const people: ProjectMember[] = (members.data ?? []).map((m) => ({
    userId: m.user_id,
    name: m.profiles?.full_name || m.profiles?.username || "Unknown user",
    username: m.profiles?.username ?? null,
    role: m.profiles?.role ?? null,
  }));

  return {
    notes: notes.count ?? 0,
    files: files.count ?? 0,
    openTasks: open.count ?? 0,
    doneTasks: done.count ?? 0,
    members: people,
  };
}
