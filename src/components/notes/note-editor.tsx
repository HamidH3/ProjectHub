"use client";

// The note itself: a title and a rich-text page that looks like paper.
// Saves automatically about a second after you stop typing.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
import { useNotes } from "@/components/notes/notes-context";
import { EditorToolbar } from "@/components/notes/editor-toolbar";
import { useAutosave, type SaveStatus } from "@/components/notes/use-autosave";

export type EditableNote = {
  id: string;
  title: string;
  content: Json;
  updated_at: string;
};

// Database limits are 2 MB for the content and 1 MB for the plain text.
const MAX_CONTENT_CHARS = 1_900_000;
const MAX_TEXT_CHARS = 250_000;

function statusText(status: SaveStatus, savedAt: Date | null, tooLarge: boolean) {
  if (tooLarge) return "This note is too large to save. Split it into subpages.";
  switch (status) {
    case "pending":
      return "Unsaved changes";
    case "saving":
      return "Saving…";
    case "error":
      return "Couldn't save. Retrying…";
    default:
      return savedAt
        ? `Saved · ${savedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
        : "Saved";
  }
}

export function NoteEditor({ note }: { note: EditableNote }) {
  const supabase = useMemo(() => createClient(), []);
  const { updateLocal } = useNotes();
  const isNew = useSearchParams().get("new") === "1";

  const [title, setTitle] = useState(isNew && note.title === "Untitled" ? "" : note.title);
  const [savedAt, setSavedAt] = useState<Date | null>(() => new Date(note.updated_at));
  const [tooLarge, setTooLarge] = useState(false);
  const titleRef = useRef(title);
  const titleInput = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false, // avoids a mismatch between server and browser rendering
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["http", "https", "mailto"],
          // Never allow links like javascript: or data:
          isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && !/^\s*(javascript|data|vbscript):/i.test(url),
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: note.content as JSONContent,
    editorProps: {
      attributes: { class: "note-content", "aria-label": "Note text" },
    },
    onUpdate: () => autosave.schedule(),
  });

  const autosave = useAutosave(async () => {
    if (!editor) return true;
    const content = editor.getJSON();
    if (JSON.stringify(content).length > MAX_CONTENT_CHARS) {
      setTooLarge(true);
      return true; // don't retry: it can't succeed until the note is shorter
    }
    setTooLarge(false);

    const { data, error } = await supabase
      .from("notes")
      .update({
        title: titleRef.current.trim().slice(0, 200) || "Untitled",
        content: content as Json,
        content_text: editor.getText({ blockSeparator: "\n" }).slice(0, MAX_TEXT_CHARS),
      })
      .eq("id", note.id)
      .select("title, preview, updated_at")
      .single();
    if (error || !data) return false;

    updateLocal(note.id, data);
    setSavedAt(new Date(data.updated_at));
    return true;
  });
  const { schedule, flush, hasUnsaved, status } = autosave;

  // Ctrl+S / Cmd+S saves straight away instead of opening the browser's dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flush();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  // Warn before closing the tab with unsaved changes; save when leaving the note.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsaved()) {
        flush();
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      flush();
    };
  }, [flush, hasUnsaved]);

  // Renamed from the notes list while open.
  useEffect(() => {
    function onRenamed(e: Event) {
      const { id, title: next } = (e as CustomEvent<{ id: string; title: string }>).detail;
      if (id === note.id) {
        titleRef.current = next;
        setTitle(next);
      }
    }
    window.addEventListener("note-renamed", onRenamed);
    return () => window.removeEventListener("note-renamed", onRenamed);
  }, [note.id]);

  useEffect(() => {
    if (isNew) titleInput.current?.focus();
  }, [isNew]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p
        aria-live="polite"
        className={`mb-3 text-right text-xs ${status === "error" || tooLarge ? "text-red-300" : "text-muted-foreground"}`}
      >
        {statusText(status, savedAt, tooLarge)}
      </p>

      <article className="rounded-xl border border-[#33322f] bg-[#232321] px-5 pb-12 pt-4 shadow-[0_24px_60px_-34px_rgba(0,0,0,0.95)] sm:px-12">
        {editor ? <EditorToolbar editor={editor} /> : <div className="h-10" />}

        <input
          ref={titleInput}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            titleRef.current = e.target.value;
            schedule();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editor?.commands.focus("start");
            }
          }}
          placeholder="Untitled"
          maxLength={200}
          aria-label="Note title"
          className="mt-6 w-full bg-transparent text-3xl font-semibold tracking-tight text-[#efede8] outline-none placeholder:text-[#efede8]/30"
        />

        <div className="mt-4 min-h-[50vh]">
          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            <div className="space-y-3" aria-hidden>
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/5" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/5" />
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
