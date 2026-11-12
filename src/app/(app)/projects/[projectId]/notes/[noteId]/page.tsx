import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { getNote } from "@/lib/notes";
import { NoteEditor } from "@/components/notes/note-editor";
import { NoteViewer } from "@/components/notes/note-viewer";

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
  // account is gone.
  const canEdit = note.created_by === user.id || (note.created_by === null && user.role === "admin");
  if (!canEdit) {
    return (
      <NoteViewer
        key={note.id}
        note={{ id: note.id, title: note.title, content: note.content, updated_at: note.updated_at }}
      />
    );
  }

  // key: a fresh editor for each note, so nothing carries over between notes.
  return (
    <NoteEditor
      key={note.id}
      note={{ id: note.id, title: note.title, content: note.content, updated_at: note.updated_at }}
    />
  );
}
