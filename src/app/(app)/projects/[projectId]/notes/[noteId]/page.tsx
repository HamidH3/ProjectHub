import type { Metadata } from "next";
import { getProject } from "@/lib/projects";
import { getNote } from "@/lib/notes";
import { NoteEditor } from "@/components/notes/note-editor";

export async function generateMetadata({ params }: PageProps<"/projects/[projectId]/notes/[noteId]">): Promise<Metadata> {
  const { projectId, noteId } = await params;
  const note = await getNote(projectId, noteId);
  return { title: note.title || "Untitled" };
}

export default async function NotePage({ params }: PageProps<"/projects/[projectId]/notes/[noteId]">) {
  const { projectId, noteId } = await params;
  const project = await getProject(projectId);
  const note = await getNote(project.id, noteId);

  // key: a fresh editor for each note, so nothing carries over between notes.
  return (
    <NoteEditor
      key={note.id}
      note={{ id: note.id, title: note.title, content: note.content, updated_at: note.updated_at }}
    />
  );
}
