"use client";

// "Move to…" and "Delete" dialogs for notes.
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { childrenOf, subtreeIds, type NoteSummary } from "@/lib/note-tree";
import { cn } from "@/lib/utils";
import { useNotes } from "@/components/notes/notes-context";

type DialogProps = { note: NoteSummary; open: boolean; onOpenChange: (open: boolean) => void };

export function MoveNoteDialog({ note, open, onOpenChange }: DialogProps) {
  const { notes, moveNote } = useNotes();
  const [target, setTarget] = useState<string>(note.parent_id ?? "top");
  const [pending, startTransition] = useTransition();

  // Every page it could go under: not itself, and not one of its own subpages.
  const options = useMemo(() => {
    const blocked = subtreeIds(notes, note.id);
    const out: { id: string; title: string; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const n of childrenOf(notes, parentId)) {
        if (blocked.has(n.id)) continue;
        out.push({ id: n.id, title: n.title, depth });
        walk(n.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [notes, note.id]);

  const unchanged = (target === "top" ? null : target) === note.parent_id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move “{note.title}”</DialogTitle>
          <DialogDescription>Choose where this page should live. Its subpages move with it.</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto rounded-md border border-border" role="radiogroup" aria-label="New location">
          {[{ id: "top", title: "Top level (no parent)", depth: 0 }, ...options].map((o) => (
            <label
              key={o.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent",
                target === o.id && "bg-accent",
              )}
              style={{ paddingLeft: 12 + o.depth * 16 }}
            >
              <input
                type="radio"
                name="move-target"
                value={o.id}
                checked={target === o.id}
                onChange={() => setTarget(o.id)}
                className="accent-[var(--primary)]"
              />
              <span className="truncate">{o.title}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || unchanged}
            onClick={() =>
              startTransition(async () => {
                await moveNote(note.id, target === "top" ? null : target);
                onOpenChange(false);
              })
            }
          >
            {pending ? "Moving…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteNoteDialog({ note, open, onOpenChange }: DialogProps) {
  const { notes, deleteNote } = useNotes();
  const [pending, startTransition] = useTransition();
  const subpages = subtreeIds(notes, note.id).size - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this note?</DialogTitle>
          <DialogDescription>
            “{note.title}”
            {subpages > 0 ? ` and its ${subpages} subpage${subpages === 1 ? "" : "s"}` : ""} will be permanently
            deleted. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteNote(note.id);
                onOpenChange(false);
              })
            }
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
