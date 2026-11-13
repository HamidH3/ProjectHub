"use client";

// The project's AI notes: summaries the meeting recorder wrote, plus any
// added by hand. Unlike personal notes, anyone on the project can open, add
// to, rename or delete these (the database allows the same).
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEdited, type NoteSummary } from "@/lib/note-tree";
import { useNotes } from "@/components/notes/notes-context";
import { DeleteNoteDialog } from "@/components/notes/note-dialogs";

export function AiNotes() {
  const { aiNotes, createAiNote } = useNotes();
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [doomed, setDoomed] = useState<NoteSummary | null>(null);

  return (
    <section aria-label="AI notes" className="mb-6 border-b border-border pb-5">
      <div className="mb-1 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase hover:text-foreground"
        >
          <ChevronRight className={cn("size-3.5 shrink-0 transition", open && "rotate-90")} />
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">AI notes</span>
          <span className="font-normal normal-case tracking-normal">· shared · {aiNotes.length}</span>
        </button>
        <button
          type="button"
          disabled={adding}
          onClick={async () => {
            setAdding(true);
            try {
              await createAiNote();
            } finally {
              setAdding(false);
            }
          }}
          aria-label="Add an AI note"
          title="Add an AI note (anyone on the project can edit it)"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-(--hover) hover:text-foreground disabled:opacity-50"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {open &&
        (aiNotes.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            Meeting summaries from the recorder appear here. Anyone on the project can add to them.
          </p>
        ) : (
          <ul>
            {aiNotes.map((note) => (
              <AiNoteRow key={note.id} note={note} onDelete={() => setDoomed(note)} />
            ))}
          </ul>
        ))}

      {doomed && (
        <DeleteNoteDialog note={doomed} open={Boolean(doomed)} onOpenChange={(o) => !o && setDoomed(null)} />
      )}
    </section>
  );
}

function AiNoteRow({ note, onDelete }: { note: NoteSummary; onDelete: () => void }) {
  const { projectId, activeId } = useNotes();
  const active = activeId === note.id;
  return (
    <li className="group relative">
      <Link
        href={`/projects/${projectId}/notes/${note.id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "block rounded-md py-1.5 pl-[26px] pr-9 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "bg-accent" : "hover:bg-(--hover)",
        )}
      >
        <span className={cn("block truncate text-sm", active ? "font-medium" : "text-foreground/90")}>
          {note.title || "Untitled"}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {formatEdited(note.created_at)} · {note.preview || "Empty note"}
        </span>
      </Link>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${note.title || "Untitled"}`}
        title="Delete"
        className="absolute top-1.5 right-1 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-(--hover) hover:text-destructive focus-visible:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}
