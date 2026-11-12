"use client";

// Someone else's note: the same paper look as your own, but read-only. There's
// no saving here at all, and the database refuses changes to other people's
// notes anyway.
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { Eye } from "lucide-react";
import type { Json } from "@/types/database";
import { useNotes } from "@/components/notes/notes-context";
import { noteExtensions } from "@/components/notes/note-extensions";

export function NoteViewer({ note }: { note: { id: string; title: string; content: Json; updated_at: string } }) {
  const { others, allNotes } = useNotes();
  const writer = allNotes.find((n) => n.id === note.id)?.created_by ?? null;
  const section = others.find((o) => o.writer === writer);
  const who = section ? section.name.replace(/'s notes$/, "") : null;

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: noteExtensions({ readOnly: true }),
    content: note.content as JSONContent,
    editorProps: { attributes: { class: "note-content", "aria-label": "Note text (view only)" } },
  });

  const edited = new Date(note.updated_at).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="mb-3 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        <Eye className="size-3.5" />
        {who && writer ? `${who}'s note` : "Earlier note"} · view only · edited {edited}
      </p>

      <article className="rounded-xl border border-[#33322f] bg-[#232321] px-5 pb-12 pt-6 shadow-[0_24px_60px_-34px_rgba(0,0,0,0.95)] sm:px-12">
        <div className="rounded-md bg-white/[0.04] px-3 py-2 text-xs text-[#c9c6bf]">
          Only {who && writer ? who : "its writer"} can change this note. Write your own under <b>My notes</b>.
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-[#efede8] [overflow-wrap:anywhere]">
          {note.title || "Untitled"}
        </h1>
        <div className="mt-4 min-h-[30vh]">
          {editor ? <EditorContent editor={editor} /> : <div className="h-4 w-3/4 animate-pulse rounded bg-white/5" />}
        </div>
      </article>
    </div>
  );
}
