import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { getTeam } from "@/lib/tasks";
import { projectIdSchema } from "@/lib/validation/project";
import { getNoteSummaries } from "@/lib/notes";
import { NotesWorkspace } from "@/components/notes/notes-workspace";

// Loads the project's notes list once (yours, then everyone else's, view
// only); the open note appears beside it.
export default async function NotesLayout({ children, params }: LayoutProps<"/projects/[projectId]/notes">) {
  const { projectId } = await params;
  if (!projectIdSchema.safeParse(projectId).success) notFound();
  // Both at once. getProject() shows "not found" if they can't open it, and
  // the database only returns notes they're allowed to see.
  const [user, project, notes, team] = await Promise.all([
    getCurrentUser(),
    getProject(projectId),
    getNoteSummaries(projectId),
    getTeam(),
  ]);
  // Names for each person's section ("Sanna's notes").
  const writerNames = Object.fromEntries(team.people.map((p) => [p.id, p.name]));

  return (
    <NotesWorkspace projectId={project.id} meId={user.id} writerNames={writerNames} initialNotes={notes}>
      {children}
    </NotesWorkspace>
  );
}
