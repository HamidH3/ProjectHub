"use client";

// The note itself: a title and a rich-text page that looks like paper, with
// a drawing layer on top (pen, highlighter, pictures; see drawing-layer.tsx).
// Saves automatically about a second after you stop typing or drawing.
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { createKeepaliveClient } from "@/lib/supabase/client";
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
  clampMove,
  copiesOf,
  drawingBottom,
  keepOnPage,
  moveItems,
  parseDrawing,
  placePicture,
  reorder,
  type DrawItem,
  type Drawing,
} from "@/lib/drawing";
import { DrawingStatus, ShortcutsDialog } from "@/components/notes/drawing-help";
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
  // Saves still arrive if the tab is closed right after typing (see client.ts).
  const supabase = useMemo(() => createKeepaliveClient(), []);
  const { updateLocal } = useNotes();
  const isNew = useSearchParams().get("new") === "1";

  const [title, setTitle] = useState(isNew && note.title === "Untitled" ? "" : note.title);
  const [savedAt, setSavedAt] = useState<Date | null>(() => new Date(note.updated_at));
  const [tooLarge, setTooLarge] = useState(false);
  const titleRef = useRef(title);
  const titleInput = useRef<HTMLInputElement>(null);

  // Drawing: what's on the page, undo/redo history, and the chosen tool.
  const [drawing, setDrawingState] = useState<Drawing>(() => {
    const d = parseDrawing(note.drawing);
    return { ...d, items: keepOnPage(d.items) }; // anything off the page comes back onto it
  });
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
  const [helpOpen, setHelpOpen] = useState(false);
  // Read out by screen readers ("Pen on", "2 items deleted", ...).
  const [announcement, setAnnouncement] = useState("");
  const announce = (text: string) => setAnnouncement(text);

  // One undo for everything: Ctrl+Z undoes whatever you did last, text or
  // drawing. These lists remember the order ("t" = text, "d" = drawing).
  const doneOrder = useRef<("t" | "d")[]>([]);
  const undoneOrder = useRef<("t" | "d")[]>([]);
  const replaying = useRef(false); // true while we undo/redo text ourselves
  const copied = useRef<DrawItem[]>([]); // drawings copied with Ctrl+C

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
    onUpdate: () => {
      if (!replaying.current) {
        if (doneOrder.current.at(-1) !== "t") doneOrder.current.push("t");
        undoneOrder.current = [];
      }
      autosave.schedule();
    },
  });

  // A copy of the text taken when the note closes. A save that finishes after
  // that (e.g. you typed while one was on its way, then clicked another tab)
  // uses this copy, because the editor itself is gone by then.
  const lastCopy = useRef<{ content: JSONContent; text: string } | null>(null);
  const takeCopy = () => {
    if (!editor || editor.isDestroyed) return;
    lastCopy.current = { content: editor.getJSON(), text: editor.getText({ blockSeparator: "\n" }) };
  };

  const autosave = useAutosave(async () => {
    const live = editor && !editor.isDestroyed;
    if (!live && !lastCopy.current) return true;
    const content = live ? editor.getJSON() : lastCopy.current!.content;
    const text = live ? editor.getText({ blockSeparator: "\n" }) : lastCopy.current!.text;
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
        content_text: text.slice(0, MAX_TEXT_CHARS),
      })
      .eq("id", note.id)
      .select("title, preview, updated_at")
      .single();
    if (error || !data) return false;

    updateLocal(note.id, data);
    setSavedAt(new Date(data.updated_at));
    return true;
  });
  const { schedule, flush, leave, hasUnsaved, status } = autosave;

  // Every drawing change goes through here (so it can be undone, and is saved).
  function showDrawing(next: Drawing) {
    drawingRef.current = next;
    setDrawingState(next);
    schedule();
  }
  function changeDrawing(next: Drawing) {
    setPast([...past.slice(-49), drawingRef.current]);
    setFuture([]);
    doneOrder.current.push("d");
    undoneOrder.current = [];
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
  // Ctrl+Z / Ctrl+Y: undo or redo whatever was done last, text or drawing.
  function dropLast(list: ("t" | "d")[], kind: "t" | "d") {
    const i = list.lastIndexOf(kind);
    if (i >= 0) list.splice(i, 1);
  }
  function undoLast() {
    const kind = doneOrder.current.at(-1) ?? (past.length > 0 ? "d" : "t");
    if (kind === "d" && past.length > 0) {
      doneOrder.current.pop();
      undoneOrder.current.push("d");
      undoDrawing();
      announce("Drawing undone");
    } else if (editor?.can().undo()) {
      replaying.current = true;
      editor.commands.undo();
      replaying.current = false;
      undoneOrder.current.push("t");
      if (!editor.can().undo()) dropLast(doneOrder.current, "t");
      announce("Undone");
    } else if (past.length > 0) {
      dropLast(doneOrder.current, "d");
      undoneOrder.current.push("d");
      undoDrawing();
      announce("Drawing undone");
    }
  }
  function redoLast() {
    const kind = undoneOrder.current.pop() ?? (future.length > 0 ? "d" : "t");
    if (kind === "d" && future.length > 0) {
      doneOrder.current.push("d");
      redoDrawing();
      announce("Drawing redone");
    } else if (editor?.can().redo()) {
      replaying.current = true;
      editor.commands.redo();
      replaying.current = false;
      if (doneOrder.current.at(-1) !== "t") doneOrder.current.push("t");
      announce("Redone");
    }
  }
  // The drawing undo/redo buttons only touch the drawing.
  function undoDrawingButton() {
    dropLast(doneOrder.current, "d");
    undoneOrder.current.push("d");
    undoDrawing();
  }
  function redoDrawingButton() {
    dropLast(undoneOrder.current, "d");
    doneOrder.current.push("d");
    redoDrawing();
  }

  // Acting on what's picked with Select.
  const allItems = () => drawingRef.current.items;
  const picked = () => allItems().filter((i) => selected.includes(i.id));
  function deleteSelected() {
    if (selected.length === 0) return;
    const ids = new Set(selected);
    changeDrawing({ ...drawingRef.current, items: allItems().filter((i) => !ids.has(i.id)) });
    announce(selected.length === 1 ? "Deleted" : `${selected.length} items deleted`);
    setSelected([]);
  }
  function pasteCopies(source: DrawItem[]) {
    if (source.length === 0) return;
    const copies = copiesOf(source);
    changeDrawing({ ...drawingRef.current, items: [...allItems(), ...copies] });
    chooseTool("select", { quiet: true });
    setSelected(copies.map((c) => c.id));
    announce(copies.length === 1 ? "Pasted" : `${copies.length} items pasted`);
  }
  function arrange(to: "front" | "back") {
    if (selected.length === 0) return;
    changeDrawing({ ...drawingRef.current, items: reorder(allItems(), new Set(selected), to) });
    announce(to === "front" ? "Brought to front" : "Sent to back");
  }
  function nudge(dx: number, dy: number) {
    const ids = new Set(selected);
    const [x, y] = clampMove(allItems(), ids, dx, dy);
    if (x !== 0 || y !== 0) changeDrawing({ ...drawingRef.current, items: moveItems(allItems(), ids, x, y) });
  }

  const TOOL_NAMES: Record<DrawTool, string> = {
    type: "Typing",
    pen: "Pen",
    highlighter: "Highlighter",
    eraser: "Eraser",
    select: "Select",
  };
  function chooseTool(t: DrawTool, { quiet = false } = {}) {
    setTool(t);
    if (t !== "select") setSelected([]);
    if (!quiet) announce(t === "type" ? "Typing. Press Escape to leave the text." : `${TOOL_NAMES[t]} on`);
    // Drawing tools take the cursor out of the text, so keys act on the
    // drawing and nothing gets typed by accident; Type puts it back.
    if (t === "type") editor?.commands.focus();
    else editor?.commands.blur();
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
    announce("Picture added. Drag to move it, or drag its corner to resize.");
  }

  // Delete/Backspace removes what's selected; Ctrl+Z / Ctrl+Y undo and redo
  // drawing while a drawing tool is in use (in Type mode they undo text).
  // Keyboard support (listed in the shortcuts window, drawing-help.tsx).
  // Listens before the text editor does, so Ctrl+Z can undo a drawing even
  // while you're in the text.
  const onKeys = useEffectEvent((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (helpOpen || !target) return;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
    const inArticle = Boolean(body.current?.closest("article")?.contains(target));
    if (!inArticle && target !== document.body) return; // e.g. typing in the search box
    const inText = Boolean(target.closest(".note-content"));
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Undo / redo, for text and drawing together.
    if (mod && !e.altKey && key === "z") {
      stop();
      if (e.shiftKey) redoLast();
      else undoLast();
      return;
    }
    if (mod && !e.altKey && key === "y") {
      stop();
      redoLast();
      return;
    }

    if (inText) {
      if (e.key === "Escape") {
        stop();
        editor?.commands.blur();
        announce("Left the text. Press P for pen, S to select, or ? for all shortcuts.");
      }
      return; // everything else is normal typing
    }

    if (!mod && !e.altKey) {
      if (e.key === "?") {
        stop();
        setHelpOpen(true);
        return;
      }
      const tools: Record<string, DrawTool> = { t: "type", p: "pen", h: "highlighter", e: "eraser", s: "select", v: "select" };
      if (!e.shiftKey && tools[key]) {
        stop();
        chooseTool(tools[key]);
        return;
      }
      if (e.key === "Escape") {
        stop();
        if (selected.length > 0) {
          setSelected([]);
          announce("Nothing picked");
        } else if (tool !== "type") {
          chooseTool("type");
        }
        return;
      }
    }

    if (tool !== "select") return;
    if (mod && key === "a") {
      stop();
      setSelected(allItems().map((i) => i.id));
      announce(`${allItems().length} items picked`);
      return;
    }
    if (selected.length === 0) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      stop();
      deleteSelected();
    } else if (mod && key === "c") {
      stop();
      copied.current = picked();
      announce("Copied");
    } else if (mod && key === "x") {
      stop();
      copied.current = picked();
      deleteSelected();
    } else if (mod && key === "d") {
      stop();
      pasteCopies(picked());
    } else if (e.key === "]") {
      stop();
      arrange("front");
    } else if (e.key === "[") {
      stop();
      arrange("back");
    } else if (e.key.startsWith("Arrow")) {
      stop();
      const step = e.shiftKey ? 20 : 2;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (moves[e.key]) nudge(...moves[e.key]);
    }
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onKeys(e);
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Paste a screenshot (Ctrl+V) while you're in the note, in any tool; or
  // drop a picture onto the text.
  const pastePicture = useEffectEvent((file: File) => void addPicture(file));
  const pasteDrawings = useEffectEvent(() => pasteCopies(copied.current));
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const focus = document.activeElement;
      const inNote = !focus || focus === document.body || body.current?.closest("article")?.contains(focus);
      if (!inNote || focus === titleInput.current) return;
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        pastePicture(file);
      } else if (copied.current.length > 0 && !focus?.closest(".note-content")) {
        // Drawings copied with Ctrl+C (only when you're not typing in the text).
        e.preventDefault();
        pasteDrawings();
      }
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

  // Save when leaving the note (another tab or note), when the window is
  // hidden (switching apps on a phone), and warn before closing the tab with
  // changes that haven't reached the server yet.
  const onLeave = useEffectEvent(() => {
    takeCopy();
    leave();
  });
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsaved()) {
        flush();
        e.preventDefault();
      }
    }
    function onHidden() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
      onLeave();
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
              onTool={(t) => chooseTool(t)}
              color={tool === "highlighter" ? markColor : penColor}
              onColor={tool === "highlighter" ? setMarkColor : setPenColor}
              size={penSize}
              onSize={setPenSize}
              onPicture={(f) => void addPicture(f)}
              canUndo={past.length > 0}
              canRedo={future.length > 0}
              onUndo={undoDrawingButton}
              onRedo={redoDrawingButton}
              selectedCount={selected.length}
              onDeleteSelected={deleteSelected}
              onDuplicate={() => pasteCopies(picked())}
              onFront={() => arrange("front")}
              onBack={() => arrange("back")}
              onHelp={() => setHelpOpen(true)}
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

      <DrawingStatus
        tool={tool}
        selectedCount={selected.length}
        onType={() => chooseTool("type")}
        onHelp={() => setHelpOpen(true)}
      />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
