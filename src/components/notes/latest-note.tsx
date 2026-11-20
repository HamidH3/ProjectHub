"use client";

// Opens a note with its LATEST saved version.
//
// The browser keeps a copy of pages you've already visited (for example when
// you switch to Tasks and come back, or press Back). For a note that copy can
// be older than what's saved, and typing into an old copy would save over the
// newer text. So before the note is shown, the latest version is read straight
// from the database (a quick, small request) and used if it's newer.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useNotes } from "@/components/notes/notes-context";
import type { Json } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { rememberLastNote } from "@/lib/last-note";
import { NoteSkeleton } from "@/components/layout/loading-skeletons";
import { NoteEditor } from "@/components/notes/note-editor";
import { NoteViewer } from "@/components/notes/note-viewer";

export type OpenNote = {
  id: string;
  project_id: string;
  title: string;
  content: Json;
  updated_at: string;
  drawing: Json;
};

const newer = (a: string, b: string) => new Date(a).getTime() > new Date(b).getTime();

export function LatestNote({ note, editable, shared }: { note: OpenNote; editable: boolean; shared: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [latest, setLatest] = useState<OpenNote | null>(null);
  const [gone, setGone] = useState(false);
  const { writerNames, meId } = useNotes();

  // LIVE: a newer saved version (someone else's, or yours from another
  // window) replaces the one on screen; the editor only asks for this when
  // you're not in the middle of changing the note.
  const showNewer = (fresh: OpenNote, by: string | null) => {
    setLatest(fresh);
    if (by && by !== meId) toast.info(`Updated with ${writerNames[by] ?? "someone else"}'s changes`);
    else if (by === meId) toast.info("Updated with your changes from another window");
  };

  // So the Notes tab can bring you back here.
  useEffect(() => {
    rememberLastNote(note.project_id, note.id);
  }, [note.project_id, note.id]);

  useEffect(() => {
    let current = true;
    supabase
      .from("notes")
      .select("id, project_id, title, content, updated_at, drawing")
      .eq("id", note.id)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (current) setLatest(data && newer(data.updated_at, note.updated_at) ? data : note);
        },
        () => {
          if (current) setLatest(note); // offline: show what we have
        },
      );
    return () => {
      current = false;
    };
  }, [note, supabase]);

  if (gone) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-card px-6 py-10 text-center text-sm" role="status">
        <p className="font-medium">This note has been deleted.</p>
        <p className="mt-1 text-muted-foreground">Someone removed it (or you no longer have access).</p>
        <Link href={`/projects/${note.project_id}/notes`} className="mt-4 inline-block text-primary underline-offset-4 hover:underline">
          Back to notes
        </Link>
      </div>
    );
  }
  if (!latest) return <NoteSkeleton />;
  // key: a fresh editor for each note (and each version), so nothing carries over.
  const key = `${latest.id}:${latest.updated_at}`;
  return editable ? (
    <NoteEditor key={key} note={latest} shared={shared} onNewerVersion={showNewer} onGone={() => setGone(true)} />
  ) : (
    <NoteViewer key={key} note={latest} onNewerVersion={showNewer} onGone={() => setGone(true)} />
  );
}
