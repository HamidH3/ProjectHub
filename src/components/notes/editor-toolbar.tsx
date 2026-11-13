"use client";

// Formatting buttons above the note: headings, bold/italic, lists,
// checklist, link, quote, code block, table and undo/redo.
import { useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Rows3,
  SquareCode,
  Strikethrough,
  Table,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the cursor in the note when clicking a button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-(--paper-soft) transition hover:bg-black/[0.07] hover:text-(--paper-ink) disabled:pointer-events-none disabled:opacity-35",
        active && "bg-black/[0.09] text-primary",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-(--paper-line)" />;
}

// Accepts "example.com", "https://…", "http://…" or "mailto:…".
function normaliseUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^(https?:\/\/|mailto:)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null; // other schemes (e.g. javascript:) are refused
  return `https://${value}`;
}

export function EditorToolbar({ editor, children }: { editor: Editor; children?: React.ReactNode }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  function openLink() {
    setLinkValue((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkError(null);
    setLinkOpen((o) => !o);
  }

  function applyLink(e: React.FormEvent) {
    e.preventDefault();
    if (!linkValue.trim()) {
      chain().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const url = normaliseUrl(linkValue);
    if (!url) {
      setLinkError("Use a web address (https://…) or an email link (mailto:…).");
      return;
    }
    chain().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
  }

  return (
    <div className="sticky top-0 z-10 -mx-2 mb-2 rounded-lg border border-(--paper-line) bg-(--paper-fill)/95 px-1 py-1 backdrop-blur">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
        <ToolButton label="Undo (Ctrl+Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
          <Undo2 className="size-4" />
        </ToolButton>
        <ToolButton label="Redo (Ctrl+Shift+Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
          <Redo2 className="size-4" />
        </ToolButton>
        <Divider />
        <ToolButton label="Heading 1" active={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="size-4" />
        </ToolButton>
        <ToolButton label="Heading 2" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="size-4" />
        </ToolButton>
        <ToolButton label="Heading 3" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="size-4" />
        </ToolButton>
        <Divider />
        <ToolButton label="Bold (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}>
          <Bold className="size-4" />
        </ToolButton>
        <ToolButton label="Italic (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic className="size-4" />
        </ToolButton>
        <ToolButton label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough className="size-4" />
        </ToolButton>
        <ToolButton label="Inline code" active={s.code} onClick={() => chain().toggleCode().run()}>
          <Code className="size-4" />
        </ToolButton>
        <ToolButton label="Link" active={s.link || linkOpen} onClick={openLink}>
          <Link2 className="size-4" />
        </ToolButton>
        <Divider />
        <ToolButton label="Bullet list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
          <List className="size-4" />
        </ToolButton>
        <ToolButton label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered className="size-4" />
        </ToolButton>
        <ToolButton label="Checklist" active={s.task} onClick={() => chain().toggleTaskList().run()}>
          <ListChecks className="size-4" />
        </ToolButton>
        <Divider />
        <ToolButton label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
          <Quote className="size-4" />
        </ToolButton>
        <ToolButton label="Code block" active={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>
          <SquareCode className="size-4" />
        </ToolButton>
        <ToolButton label="Divider line" onClick={() => chain().setHorizontalRule().run()}>
          <Minus className="size-4" />
        </ToolButton>
        <ToolButton
          label="Insert table"
          active={s.table}
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <Table className="size-4" />
        </ToolButton>
        {s.table && (
          <>
            <Divider />
            <ToolButton label="Add row below" onClick={() => chain().addRowAfter().run()}>
              <Rows3 className="size-4" />
            </ToolButton>
            <ToolButton label="Add column right" onClick={() => chain().addColumnAfter().run()}>
              <Columns3 className="size-4" />
            </ToolButton>
            <ToolButton label="Delete row" onClick={() => chain().deleteRow().run()}>
              <Rows3 className="size-4 text-[#c4312f]" />
            </ToolButton>
            <ToolButton label="Delete column" onClick={() => chain().deleteColumn().run()}>
              <Columns3 className="size-4 text-[#c4312f]" />
            </ToolButton>
            <ToolButton label="Delete table" onClick={() => chain().deleteTable().run()}>
              <Trash2 className="size-4 text-[#c4312f]" />
            </ToolButton>
          </>
        )}
      </div>

      {linkOpen && (
        <form onSubmit={applyLink} className="mt-1 flex flex-wrap items-center gap-2 px-1 pb-1">
          <input
            autoFocus
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            placeholder="Paste a link (leave empty to remove)"
            aria-label="Link address"
            className="h-8 min-w-0 flex-1 rounded-md border border-(--paper-line) bg-white px-2.5 text-sm text-(--paper-ink) outline-none placeholder:text-(--paper-soft) focus:border-ring"
          />
          <button type="submit" className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Apply
          </button>
          <button
            type="button"
            onClick={() => setLinkOpen(false)}
            className="h-8 rounded-md px-2 text-sm text-(--paper-soft) hover:text-(--paper-ink)"
          >
            Cancel
          </button>
          {linkError && <p className="w-full text-xs text-[#c4312f]">{linkError}</p>}
        </form>
      )}
      {children}
    </div>
  );
}
