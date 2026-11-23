"use client";

// Right-click in a note: a small formatting bar above the word, like Word's
// mini toolbar. Right-clicking a word picks it first. Right-clicking a picture
// offers sizes and Delete. Shift + right-click still opens the browser's own
// menu (spelling suggestions and so on).
import { useEffect, useRef } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
  Bold,
  ClipboardPaste,
  Copy,
  Heading1,
  Heading2,
  Italic,
  List,
  ListChecks,
  RemoveFormatting,
  Scissors,
  Strikethrough,
  Trash2,
  Underline,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PICTURE_SIZES, clampPictureWidth } from "@/lib/page-scale";

/** The word around a position in the text (letters, digits, ' and -), if any. */
export function wordAt(doc: PMNode, pos: number): { from: number; to: number } | null {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock) return null;
  // One character per position: anything that isn't text counts as a space.
  const text = parent.textBetween(0, parent.content.size, "\0", "\0");
  const isWord = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_'’-]/u.test(ch);
  let from = $pos.parentOffset;
  let to = from;
  while (from > 0 && isWord(text[from - 1])) from--;
  while (to < text.length && isWord(text[to])) to++;
  if (from === to) return null;
  const start = $pos.start();
  return { from: start + from, to: start + to };
}

/**
 * Gets the note ready for the bar after a right-click at (x, y): picks the
 * picture, or the word under the mouse (unless it's inside what's already
 * picked). Says what it picked, or false if the click wasn't on the text.
 */
export type RightClickPick = "picture" | "word" | "kept";
export function prepareRightClick(editor: Editor, target: HTMLElement, x: number, y: number): RightClickPick | false {
  const view = editor.view;
  if (!view.dom.contains(target)) return false;
  const picture = target.closest(".note-picture");
  if (picture) {
    const pos = view.posAtDOM(picture, 0);
    const node = view.state.doc.nodeAt(pos);
    if (node?.type.name !== "picture") return false;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.focus();
    return "picture";
  }
  const hit = view.posAtCoords({ left: x, top: y });
  if (!hit) return false;
  const { from, to, empty } = view.state.selection;
  const inside = !empty && hit.pos >= from && hit.pos <= to;
  if (!inside) {
    const word = wordAt(view.state.doc, hit.pos);
    const sel = word
      ? TextSelection.create(view.state.doc, word.from, word.to)
      : TextSelection.near(view.state.doc.resolve(hit.pos));
    view.dispatch(view.state.tr.setSelection(sel));
  }
  view.focus();
  return inside ? "kept" : "word";
}

function BarButton({
  label,
  active,
  onClick,
  danger,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // Keep the selection in the note while clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs text-(--paper-soft) transition hover:bg-black/[0.07] hover:text-(--paper-ink)",
        active && "bg-black/[0.09] text-primary",
        danger && "text-[#c4312f] hover:text-[#c4312f]",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-0.5 h-5 w-px bg-(--paper-line)" />;

export function FormatBubble({
  editor,
  pickedWord = false,
  onClose,
  onPastePicture,
}: {
  editor: Editor;
  pickedWord?: boolean; // the word was picked by the right-click, not by you
  onClose: () => void;
  onPastePicture: (file: File) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const sel = e.state.selection;
      const picture = sel instanceof NodeSelection && sel.node.type.name === "picture";
      return {
        picture,
        width: picture ? clampPictureWidth((sel as NodeSelection).node.attrs.width) : 0,
        from: sel.from,
        to: sel.to,
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        h1: e.isActive("heading", { level: 1 }),
        h2: e.isActive("heading", { level: 2 }),
        bullet: e.isActive("bulletList"),
        task: e.isActive("taskList"),
      };
    },
  });

  // Above what's picked (below it if there's no room), kept on the screen.
  const place = (el: HTMLDivElement | null) => {
    if (!el || editor.isDestroyed) return;
    const view = editor.view;
    let top: number;
    let bottom: number;
    let left: number;
    let right: number;
    if (s.picture) {
      const dom = view.nodeDOM(s.from) as HTMLElement | null;
      const r = (dom?.querySelector("[data-drag-handle]") ?? dom)?.getBoundingClientRect();
      if (!r) return;
      ({ top, bottom, left, right } = r);
    } else {
      const a = view.coordsAtPos(s.from);
      const b = view.coordsAtPos(s.to);
      top = Math.min(a.top, b.top);
      bottom = Math.max(a.bottom, b.bottom);
      left = a.top === b.top ? Math.min(a.left, b.left) : a.left;
      right = a.top === b.top ? Math.max(a.right, b.right) : a.left;
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = Math.min(Math.max(8, (left + right) / 2 - w / 2), window.innerWidth - w - 8);
    const y = top - h - 8 >= 8 ? top - h - 8 : Math.min(bottom + 8, window.innerHeight - h - 8);
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    el.style.visibility = "visible";
  };

  useEffect(() => {
    place(bar.current);
  });

  // Closes when you click elsewhere, press Escape, type, scroll or resize.
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      if (e.key === "Escape") e.preventDefault();
      if (!bar.current?.contains(e.target as Node)) onClose();
    };
    const gone = () => onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("scroll", gone, true);
    window.addEventListener("resize", gone);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", gone, true);
      window.removeEventListener("resize", gone);
    };
  }, [onClose]);

  const chain = () => editor.chain().focus();

  function copyOrCut(kind: "copy" | "cut") {
    editor.view.focus();
    const ok = document.execCommand(kind);
    if (!ok) toast.message(`Press Ctrl+${kind === "copy" ? "C" : "X"} to ${kind}.`);
    if (kind === "cut") onClose();
  }

  async function paste() {
    onClose();
    // Paste after the word you right-clicked, rather than over it.
    if (pickedWord) editor.commands.setTextSelection(editor.state.selection.to);
    try {
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find((t) => t === "image/png" || t === "image/jpeg");
          if (type) {
            const blob = await item.getType(type);
            onPastePicture(new File([blob], `pasted.${type === "image/png" ? "png" : "jpg"}`, { type }));
            return;
          }
        }
      }
      const text = await navigator.clipboard.readText();
      if (text) editor.view.pasteText(text);
      editor.view.focus();
    } catch {
      toast.message("Press Ctrl+V to paste.");
    }
  }

  return (
    <div
      ref={(el) => {
        bar.current = el;
        place(el);
      }}
      role="toolbar"
      aria-label={s.picture ? "Picture options" : "Quick formatting"}
      data-print-hide
      className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-(--paper-line) bg-(--paper) [color-scheme:light] p-1 shadow-lg"
      style={{ left: 0, top: 0, visibility: "hidden" }}
      title="Shift + right-click for the browser's own menu"
    >
      {s.picture ? (
        <>
          {(Object.entries(PICTURE_SIZES) as [keyof typeof PICTURE_SIZES, number][]).map(([name, w]) => (
            <BarButton
              key={name}
              label={`${name[0].toUpperCase()}${name.slice(1)} picture`}
              active={Math.abs(s.width - w) < 0.01}
              onClick={() => chain().updateAttributes("picture", { width: w }).setNodeSelection(s.from).run()}
            >
              {name === "full" ? "Full width" : `${name[0].toUpperCase()}${name.slice(1)}`}
            </BarButton>
          ))}
          <Divider />
          <BarButton
            label="Delete picture"
            danger
            onClick={() => {
              chain().deleteSelection().run();
              onClose();
            }}
          >
            <Trash2 className="size-4" />
          </BarButton>
        </>
      ) : (
        <>
          <BarButton label="Bold (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}>
            <Bold className="size-4" />
          </BarButton>
          <BarButton label="Italic (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}>
            <Italic className="size-4" />
          </BarButton>
          <BarButton label="Underline (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
            <Underline className="size-4" />
          </BarButton>
          <BarButton label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}>
            <Strikethrough className="size-4" />
          </BarButton>
          <Divider />
          <BarButton label="Heading 1" active={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
            <Heading1 className="size-4" />
          </BarButton>
          <BarButton label="Heading 2" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="size-4" />
          </BarButton>
          <BarButton label="Bullet list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
            <List className="size-4" />
          </BarButton>
          <BarButton label="Checklist" active={s.task} onClick={() => chain().toggleTaskList().run()}>
            <ListChecks className="size-4" />
          </BarButton>
          <BarButton label="Clear formatting" onClick={() => chain().unsetAllMarks().run()}>
            <RemoveFormatting className="size-4" />
          </BarButton>
          <Divider />
          <BarButton label="Cut" onClick={() => copyOrCut("cut")}>
            <Scissors className="size-4" />
          </BarButton>
          <BarButton label="Copy" onClick={() => copyOrCut("copy")}>
            <Copy className="size-4" />
          </BarButton>
          <BarButton label="Paste" onClick={() => void paste()}>
            <ClipboardPaste className="size-4" />
          </BarButton>
        </>
      )}
    </div>
  );
}
