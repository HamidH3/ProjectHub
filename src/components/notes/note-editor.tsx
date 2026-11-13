"use client";

// The note itself: a title and a rich-text page that looks like paper, with
// a drawing layer on top (pen, highlighter, pictures; see drawing-layer.tsx).
// Saves automatically about a second after you stop typing or drawing.
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
import { useNotes } from "@/components/notes/notes-context";
import { EditorToolbar } from "@/components/notes/editor-toolbar";
import { noteExtensions } from "@/components/notes/note-extensions";
import { DrawingLayer, type DrawTool } from "@/components/notes/drawing-layer";
import { DrawToolbar } from "@/components/notes/draw-toolbar";
import {
  DRAW_WIDTH,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_SIZE,
  drawingBottom,
  parseDrawing,
  placePicture,
  type Drawing,
} from "@/lib/drawing";
import { useAutosave, type SaveStatus } from "@/components/notes/use-autosave";

export type EditableNote = {
  id: string;
  title: string;
  content: Json;
  updated_at: string;
  drawing: Json;
  project_id: string;
};

const MAX_DRAWING_CHARS = 2_900_000;
const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

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

  // Drawing: what's on the page, undo/redo history, and the chosen tool.
  const [drawing, setDrawingState] = useState<Drawing>(() => parseDrawing(note.drawing));
  const drawingRef = useRef(drawing);
  const [past, setPast] = useState<Drawing[]>([]);
  const [future, setFuture] = useState<Drawing[]>([]);
  const [tool, setTool] = useState<DrawTool>("type");
  const [penColor, setPenColor] = useState("#141414");
  const [markColor, setMarkColor] = useState<string>(HIGHLIGHT_COLORS[0]);
  const [penSize, setPenSize] = useState(4);
  const [selected, setSelected] = useState<string[]>([]);
  const [localPictures, setLocalPictures] = useState<Record<string, string>>({});
  const body = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    immediatelyRender: false, // avoids a mismatch between server and browser rendering
    extensions: noteExtensions(),
    content: note.content as JSONContent,
    editorProps: {
      attributes: { class: "note-content", "aria-label": "Note text" },
      // Pasted or dropped pictures go on the drawing layer (handled below), not into the text.
      handlePaste: (_view, event) => Array.from(event.clipboardData?.files ?? []).some((f) => f.type.startsWith("image/")),
      handleDrop: (_view, event) => {
        const file = Array.from((event as DragEvent).dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
        if (!file) return false;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("note-picture-dropped", { detail: file }));
        return true;
      },
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

    const drawingJson = JSON.stringify(drawingRef.current);
    if (drawingJson.length > MAX_DRAWING_CHARS) {
      setTooLarge(true);
      return true;
    }

    const { data, error } = await supabase
      .from("notes")
      .update({
        title: titleRef.current.trim().slice(0, 200) || "Untitled",
        content: content as Json,
        drawing: drawingRef.current as unknown as Json,
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

  // Every drawing change goes through here (so it can be undone, and is saved).
  function showDrawing(next: Drawing) {
    drawingRef.current = next;
    setDrawingState(next);
    schedule();
  }
  function changeDrawing(next: Drawing) {
    setPast([...past.slice(-49), drawingRef.current]);
    setFuture([]);
    showDrawing(next);
  }
  function undoDrawing() {
    if (past.length === 0) return;
    setFuture([drawingRef.current, ...future]);
    setPast(past.slice(0, -1));
    showDrawing(past[past.length - 1]);
  }
  function redoDrawing() {
    if (future.length === 0) return;
    setPast([...past, drawingRef.current]);
    setFuture(future.slice(1));
    showDrawing(future[0]);
  }
  function deleteSelected() {
    if (selected.length === 0) return;
    const ids = new Set(selected);
    changeDrawing({ ...drawingRef.current, items: drawingRef.current.items.filter((i) => !ids.has(i.id)) });
    setSelected([]);
  }

  // Pictures: pasted screenshots, dropped images, or "Add a picture". They're
  // uploaded privately to the project's storage, then placed on the page.
  async function addPicture(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Pictures need to be PNG or JPG.");
      return;
    }
    if (file.size > MAX_PICTURE_BYTES) {
      toast.error("That picture is over 10 MB.");
      return;
    }
    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = `${note.project_id}/note-images/${note.id}/${crypto.randomUUID()}.${ext}`;
    const preview = URL.createObjectURL(file);
    let natural = { w: 600, h: 400 };
    try {
      const bmp = await createImageBitmap(file);
      natural = { w: bmp.width, h: bmp.height };
      bmp.close();
    } catch {
      // keep the default size
    }

    const el = body.current;
    const scale = el ? el.clientWidth / DRAW_WIDTH : 1;
    const visibleTop = el ? Math.max(0, -el.getBoundingClientRect().top + 120) / scale : 0;
    // Screenshots from high-resolution screens are twice their on-screen size.
    const ratio = window.devicePixelRatio > 1 ? window.devicePixelRatio : 1;
    const place = placePicture(natural.w / ratio, natural.h / ratio, visibleTop);
    const id = crypto.randomUUID();

    setLocalPictures((all) => ({ ...all, [path]: preview }));
    const { error } = await supabase.storage
      .from("project-files")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      toast.error("Couldn't upload the picture. Try again.");
      return;
    }
    changeDrawing({ ...drawingRef.current, items: [...drawingRef.current.items, { id, kind: "image", path, ...place }] });
    setTool("select");
    setSelected([id]);
  }

  // Delete/Backspace removes what's selected; Ctrl+Z / Ctrl+Y undo and redo
  // drawing while a drawing tool is in use (in Type mode they undo text).
  const onDrawKey = useEffectEvent((e: KeyboardEvent) => {
    if (tool === "type") return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selected.length > 0) {
      e.preventDefault();
      deleteSelected();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redoDrawing();
      else undoDrawing();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redoDrawing();
    } else if (e.key === "Escape") {
      setSelected([]);
    }
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onDrawKey(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Paste a screenshot (Ctrl+V) while you're in the note, in any tool; or
  // drop a picture onto the text.
  const pastePicture = useEffectEvent((file: File) => void addPicture(file));
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      const focus = document.activeElement;
      const inNote = !focus || focus === document.body || body.current?.closest("article")?.contains(focus);
      if (!inNote || focus === titleInput.current) return;
      e.preventDefault();
      pastePicture(file);
    }
    function onDropped(e: Event) {
      pastePicture((e as CustomEvent<File>).detail);
    }
    window.addEventListener("paste", onPaste);
    window.addEventListener("note-picture-dropped", onDropped);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("note-picture-dropped", onDropped);
    };
  }, []);

  // The page's width in drawing units, so it can grow to fit the drawing.
  const [bodyScale, setBodyScale] = useState(1);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBodyScale(entry.contentRect.width / DRAW_WIDTH || 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
        className={`mb-3 text-right text-xs ${status === "error" || tooLarge ? "text-(--danger-soft)" : "text-muted-foreground"}`}
      >
        {statusText(status, savedAt, tooLarge)}
      </p>

      <article className="relative rounded-xl border border-(--paper-border) bg-(--paper) [color-scheme:light] px-5 pb-12 pt-4 text-(--paper-ink) shadow-(--paper-shadow) sm:px-12">
        {editor ? (
          <EditorToolbar editor={editor}>
            <DrawToolbar
              tool={tool}
              onTool={(t) => {
                setTool(t);
                if (t !== "select") setSelected([]);
                // Drawing tools take the cursor out of the text, so keys like
                // Delete act on the drawing and typing can't happen by accident.
                if (t !== "type") editor.commands.blur();
              }}
              color={tool === "highlighter" ? markColor : penColor}
              onColor={tool === "highlighter" ? setMarkColor : setPenColor}
              size={penSize}
              onSize={setPenSize}
              onPicture={(f) => void addPicture(f)}
              canUndo={past.length > 0}
              canRedo={future.length > 0}
              onUndo={undoDrawing}
              onRedo={redoDrawing}
              selectedCount={selected.length}
              onDeleteSelected={deleteSelected}
            />
          </EditorToolbar>
        ) : (
          <div className="h-20" />
        )}

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
          className="mt-6 w-full bg-transparent text-3xl font-semibold tracking-tight text-(--paper-ink) outline-none placeholder:text-(--paper-ink)/30"
        />

        <div
          ref={body}
          className="relative mt-4 min-h-[50vh]"
          // The page grows to fit the drawing.
          style={{ minHeight: `max(50vh, ${Math.ceil((drawingBottom(drawing.items) + 60) * bodyScale)}px)` }}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.items).some((i) => i.type.startsWith("image/"))) e.preventDefault();
          }}
          onDrop={(e) => {
            const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
            if (file && tool !== "type") {
              e.preventDefault();
              void addPicture(file);
            }
          }}
        >
          <DrawingLayer
            drawing={drawing}
            onChange={changeDrawing}
            tool={tool}
            color={tool === "highlighter" ? markColor : penColor}
            size={tool === "highlighter" ? HIGHLIGHT_SIZE : penSize}
            selected={selected}
            onSelect={setSelected}
            localPictures={localPictures}
          />
          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            <div className="space-y-3" aria-hidden>
              <div className="h-4 w-3/4 animate-pulse rounded bg-black/5" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-black/5" />
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
