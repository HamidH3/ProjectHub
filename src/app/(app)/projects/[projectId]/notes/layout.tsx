import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
import { projectIdSchema } from "@/lib/validation/project";
import { getNoteSummaries } from "@/lib/notes";
import { NotesWorkspace } from "@/components/notes/notes-workspace";

// Loads the project's notes list once; the open note appears beside it.
export default async function NotesLayout({ children, params }: LayoutProps<"/projects/[projectId]/notes">) {
  const { projectId } = await params;
  if (!projectIdSchema.safeParse(projectId).success) notFound();
  // Both at once. getProject() shows "not found" if they can't open it, and
  // the database only returns notes they're allowed to see.
  const [project, notes] = await Promise.all([getProject(projectId), getNoteSummaries(projectId)]);

  return (
    <NotesWorkspace projectId={project.id} initialNotes={notes}>
      {children}
    </NotesWorkspace>
  );
}
