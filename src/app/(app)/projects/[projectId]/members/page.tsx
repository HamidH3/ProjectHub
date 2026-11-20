import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getProject, getProjectOverview } from "@/lib/projects";
import { getAddablePeople } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import { ProjectMembers } from "@/components/people/project-members";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: PageProps<"/projects/[projectId]/members">) {
  const { projectId } = await params;
  const [user, project] = await Promise.all([getCurrentUser(), getProject(projectId)]);
  const isAdmin = user.role === "admin";
  const supabase = await createClient();
  const [{ members }, { data: canManage }] = await Promise.all([
    getProjectOverview(project.id),
    // Admins, or whoever made this project while they're on it (migration 19).
    isAdmin ? Promise.resolve({ data: true }) : supabase.rpc("can_delete_project", { p_project_id: project.id }),
  ]);

  // Only people who can change access need these lists.
  let addable: Awaited<ReturnType<typeof getAddablePeople>> = [];
  let projects: { id: string; name: string; color: string; archived: boolean }[] = [];
  if (canManage && !isAdmin) addable = await getAddablePeople(project.id, { asServer: true });
  if (isAdmin) {
    const [people, { data }] = await Promise.all([
      getAddablePeople(project.id),
      supabase.from("projects").select("id, name, color, archived_at").order("name"),
    ]);
    addable = people;
    projects = (data ?? []).map((p) => ({ id: p.id, name: p.name, color: p.color, archived: Boolean(p.archived_at) }));
  }

  return (
    <ProjectMembers
      project={{ id: project.id, name: project.name }}
      members={members}
      isAdmin={isAdmin}
      canManage={Boolean(canManage)}
      meId={user.id}
      addable={addable}
      projects={projects}
    />
  );
}
