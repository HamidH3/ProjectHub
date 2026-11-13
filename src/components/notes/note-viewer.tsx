"use client";

// Someone else's note: the same paper look as your own, but read-only. There's
// no saving here at all, and the database refuses changes to other people's
// notes anyway.
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { Eye } from "lucide-react";
import type { Json } from "@/types/database";
import { useNotes } from "@/components/notes/notes-context";
import { noteExtensions } from "@/components/notes/note-extensions";
import { DrawingLayer } from "@/components/notes/drawing-layer";
import { DRAW_WIDTH, drawingBottom, parseDrawing } from "@/lib/drawing";
import { useEffect, useMemo, useRef, useState } from "react";

export function NoteViewer({
  note,
}: {
  note: { id: string; title: string; content: Json; updated_at: string; drawing: Json };
}) {
  const drawing = useMemo(() => parseDrawing(note.drawing), [note.drawing]);
  const body = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / DRAW_WIDTH || 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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

      <article className="relative rounded-xl border border-(--paper-border) bg-(--paper) [color-scheme:light] px-5 pb-12 pt-6 text-(--paper-ink) shadow-(--paper-shadow) sm:px-12">
        <div className="rounded-md bg-(--paper-fill) px-3 py-2 text-xs text-(--paper-soft)">
          Only {who && writer ? who : "its writer"} can change this note. Write your own under <b>My notes</b>.
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-(--paper-ink) [overflow-wrap:anywhere]">
          {note.title || "Untitled"}
        </h1>
        <div
          ref={body}
          className="relative mt-4 min-h-[30vh]"
          style={{ minHeight: `max(30vh, ${Math.ceil((drawingBottom(drawing.items) + 60) * scale)}px)` }}
        >
          <DrawingLayer drawing={drawing} />
          {editor ? <EditorContent editor={editor} /> : <div className="h-4 w-3/4 animate-pulse rounded bg-black/5" />}
        </div>
      </article>
    </div>
  );
}
