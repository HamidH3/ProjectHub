import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { getNote } from "@/lib/notes";
import { LatestNote } from "@/components/notes/latest-note";

export async function generateMetadata({ params }: PageProps<"/projects/[projectId]/notes/[noteId]">): Promise<Metadata> {
  const { projectId, noteId } = await params;
  const note = await getNote(projectId, noteId);
  return { title: note.title || "Untitled" };
}

export default async function NotePage({ params }: PageProps<"/projects/[projectId]/notes/[noteId]">) {
  const { projectId, noteId } = await params;
  const [user, project] = await Promise.all([getCurrentUser(), getProject(projectId)]);
  const note = await getNote(project.id, noteId);

  // Your own notes open in the editor; everyone else's are view only (the
  // database has the same rule). Admins can tidy up notes whose writer's
  // account is gone. AI notes are shared: anyone on the project can edit them.
  const shared = note.kind === "ai";
  const canEdit = shared || note.created_by === user.id || (note.created_by === null && user.role === "admin");

  // LatestNote checks for a newer saved version first (see latest-note.tsx).
  return (
    <LatestNote
      key={note.id}
      editable={canEdit}
      shared={shared}
      note={{
        id: note.id,
        project_id: note.project_id,
        title: note.title,
        content: note.content,
        updated_at: note.updated_at,
        drawing: note.drawing,
      }}
    />
  );
}
