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
  const { members } = await getProjectOverview(project.id);

  // Only admins can change access, so only they need these lists.
  let addable: Awaited<ReturnType<typeof getAddablePeople>> = [];
  let projects: { id: string; name: string; color: string; archived: boolean }[] = [];
  if (isAdmin) {
    const supabase = await createClient();
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
      addable={addable}
      projects={projects}
    />
  );
}
