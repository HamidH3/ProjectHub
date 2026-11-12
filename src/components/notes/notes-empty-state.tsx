"use client";

import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotes } from "@/components/notes/notes-context";

export function NotesEmptyState() {
  const { notes, createNote } = useNotes();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 text-center">
      <FileText className="size-8 text-muted-foreground" aria-hidden />
      <h2 className="mt-3 font-medium">{notes.length ? "Pick a note to open it" : "No notes yet"}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {notes.length
          ? "Choose a note from the list, or start a new one."
          : "Notes are pages you can nest inside each other, like a notebook for this project."}
      </p>
      <Button
        className="mt-5 gap-2"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await createNote(null);
          setBusy(false);
        }}
      >
        <Plus className="size-4" /> New note
      </Button>
    </div>
  );
}
