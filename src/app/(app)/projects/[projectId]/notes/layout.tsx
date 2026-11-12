import { getProject } from "@/lib/projects";
import { getNoteSummaries } from "@/lib/notes";
import { NotesWorkspace } from "@/components/notes/notes-workspace";

// Loads the project's notes list once; the open note appears beside it.
export default async function NotesLayout({ children, params }: LayoutProps<"/projects/[projectId]/notes">) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const notes = await getNoteSummaries(project.id);

  return (
    <NotesWorkspace projectId={project.id} initialNotes={notes}>
      {children}
    </NotesWorkspace>
  );
}
