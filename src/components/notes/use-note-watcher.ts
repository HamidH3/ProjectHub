"use client";

// LIVE updates for the open note: every few seconds (while the page is in
// view, and straight away when you come back to it) asks the database whether
// the note has a newer saved version than the one on screen.
//   - newer, and you're not busy with it → load it (onNewer)
//   - newer, but you're typing or have unsaved changes → tell you (onConflict)
//   - gone (deleted, or you were taken off the project) → onGone
// Only the note's time stamp is checked each time; the full note is read only
// when it has actually changed.
import { useEffect, useEffectEvent, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { LIVE_CHECK_MS } from "@/lib/note-tree";
import type { OpenNote } from "@/components/notes/latest-note";

export const newerThan = (a: string, b: string) => new Date(a).getTime() > new Date(b).getTime();

export function useNoteWatcher({
  noteId,
  version,
  saving,
  busy,
  onNewer,
  onConflict,
  onGone,
}: {
  noteId: string;
  version: () => string; // the saved version on screen (updated_at)
  saving: () => boolean; // a save of ours is on its way: skip this check
  busy: () => boolean; // typing / unsaved changes: don't replace the page
  onNewer: (note: OpenNote, by: string | null) => void;
  onConflict?: (by: string | null) => void;
  onGone?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const check = useEffectEvent(async () => {
    if (document.visibilityState !== "visible" || saving()) return;
    const { data, error } = await supabase.from("notes").select("updated_at, updated_by").eq("id", noteId).maybeSingle();
    if (error) return; // offline for a moment: try again next time
    if (!data) {
      onGone?.();
      return;
    }
    if (saving() || !newerThan(data.updated_at, version())) return;
    if (busy()) {
      onConflict?.(data.updated_by);
      return;
    }
    const { data: full } = await supabase
      .from("notes")
      .select("id, project_id, title, content, updated_at, drawing")
      .eq("id", noteId)
      .maybeSingle();
    if (full && newerThan(full.updated_at, version()) && !busy()) onNewer(full, data.updated_by);
  });

  useEffect(() => {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await check();
      } finally {
        running = false;
      }
    };
    const timer = window.setInterval(tick, LIVE_CHECK_MS);
    const onBack = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [noteId]);
}
