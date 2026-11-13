"use client";

// Everyone else's notes in this project, one section per person, under your
// own. You can open and read them, but not change them (the database enforces
// this too), so there's no dragging, renaming or adding here.
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Eye } from "lucide-react";
import { childrenOf, type NoteSummary } from "@/lib/note-tree";
import { cn } from "@/lib/utils";
import { useNotes, type WriterSection } from "@/components/notes/notes-context";

const INDENT = 14;

export function OtherNotes() {
  const { others } = useNotes();
  if (others.length === 0) return null;
  return (
    <div className="mt-6 space-y-4 border-t border-border pt-5">
      {others.map((section) => (
        <Section key={section.writer ?? "earlier"} section={section} />
      ))}
    </div>
  );
}

function Section({ section }: { section: WriterSection }) {
  const [open, setOpen] = useState(true);
  return (
    <section aria-label={section.name}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mb-1 flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase hover:text-foreground"
      >
        <ChevronRight className={cn("size-3.5 shrink-0 transition", open && "rotate-90")} />
        <span className="min-w-0 flex-1 truncate">{section.name}</span>
        <span className="inline-flex shrink-0 items-center gap-1 font-normal normal-case tracking-normal">
          <Eye className="size-3" /> View only · {section.notes.length}
        </span>
      </button>
      {open && (
        <ul>
          <Branch all={section.notes} parentId={null} depth={0} />
        </ul>
      )}
    </section>
  );
}

function Branch({ all, parentId, depth }: { all: NoteSummary[]; parentId: string | null; depth: number }) {
  const { projectId, activeId } = useNotes();
  return childrenOf(all, parentId).map((note) => {
    const active = activeId === note.id;
    return (
      <li key={note.id}>
        <Link
          href={`/projects/${projectId}/notes/${note.id}`}
          aria-current={active ? "page" : undefined}
          className={cn(
            "block rounded-md py-1.5 pr-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active ? "bg-accent" : "hover:bg-(--hover)",
          )}
          style={{ paddingLeft: 26 + depth * INDENT }}
        >
          <span className={cn("block truncate text-sm", active ? "font-medium" : "text-foreground/90")}>
            {note.title || "Untitled"}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{note.preview || "Empty note"}</span>
        </Link>
        <ul>
          <Branch all={all} parentId={note.id} depth={depth + 1} />
        </ul>
      </li>
    );
  });
}
