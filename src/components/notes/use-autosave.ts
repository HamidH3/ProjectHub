"use client";

// Saves automatically after you stop typing, retries if the connection
// drops, and reports its status for the "Saved · 23:41" indicator.
import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "saved" | "pending" | "saving" | "error";

export function useAutosave(persist: () => Promise<boolean>, delayMs = 800) {
  // Always call the latest version of persist (it reads the latest text).
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  });

  const state = useRef({
    timer: null as ReturnType<typeof setTimeout> | null,
    inFlight: false,
    dirty: false,
    retries: 0,
  });
  const [status, setStatus] = useState<SaveStatus>("saved");

  const run = useCallback(async function run() {
    const s = state.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    if (s.inFlight) return; // the save in progress will pick up new changes
    s.inFlight = true;
    s.dirty = false;
    setStatus("saving");

    const ok = await persistRef.current().catch(() => false);
    s.inFlight = false;

    if (!ok) {
      // Try again after 2s, 4s, 8s … up to 30s. Nothing typed is lost meanwhile.
      s.dirty = true;
      setStatus("error");
      const wait = Math.min(30_000, 2_000 * 2 ** s.retries);
      s.retries += 1;
      s.timer = setTimeout(run, wait);
      return;
    }

    s.retries = 0;
    if (s.dirty) {
      // More typing happened while saving.
      setStatus("pending");
      s.timer = setTimeout(run, delayMs);
    } else {
      setStatus("saved");
    }
  }, [delayMs]);

  const schedule = useCallback(() => {
    const s = state.current;
    s.dirty = true;
    if (s.inFlight) return;
    setStatus("pending");
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(run, delayMs);
  }, [run, delayMs]);

  // Save now if anything is waiting (Ctrl+S, leaving the page).
  const flush = useCallback(() => {
    const s = state.current;
    if (s.dirty && !s.inFlight) void run();
  }, [run]);

  const hasUnsaved = useCallback(() => state.current.dirty || state.current.inFlight, []);

  return { status, schedule, flush, hasUnsaved };
}
