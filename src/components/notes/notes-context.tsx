"use client";

// Shared state for a project's notes: the list (for the left-hand tree) and
// the actions that change it. Everyone on the project can read every note, but
// only change their own: `notes` is just yours (the tree you can rearrange);
// `allNotes` has everyone's (shown read-only in their own sections). Changes go straight to the database through the
// browser client; the database's security rules decide what is allowed.
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { forgetLastNote } from "@/lib/last-note";
import {
  LIVE_CHECK_MS,
  noteListKey,
  aiNotesOf,
  applyPlacement,
  childrenOf,
  evenlySpacedKeys,
  keyBetween,
  notesBy,
  otherWriters,
  planPlacement,
  subtreeIds,
  type DropPosition,
  type NoteSummary,
} from "@/lib/note-tree";

const EXPANDED_KEY = "ph-notes-expanded";
const EXPANDED_EVENT = "ph-notes-expanded";
function readExpanded(): boolean {
  try {
    return window.localStorage.getItem(EXPANDED_KEY) === "1";
  } catch {
    return false; // storage unavailable: it just isn't remembered
  }
}
function writeExpanded(on: boolean) {
  try {
    window.localStorage.setItem(EXPANDED_KEY, on ? "1" : "0");
  } catch {
    // not remembered
  }
  window.dispatchEvent(new Event(EXPANDED_EVENT));
}
function subscribeExpanded(onChange: () => void) {
  window.addEventListener(EXPANDED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EXPANDED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
const SUMMARY = "id, parent_id, title, preview, position, updated_at, created_at, created_by, kind";

export type WriterSection = { writer: string | null; name: string; notes: NoteSummary[] };

type NotesContextValue = {
  projectId: string;
  meId: string;
  writerNames: Record<string, string>; // people's names, by id
  expanded: boolean; // notes list hidden, page widened (remembered on this device)
  toggleExpanded: () => void;
  notes: NoteSummary[]; // yours
  allNotes: NoteSummary[]; // everyone's
  others: WriterSection[]; // everyone else's notes, one section per person
  aiNotes: NoteSummary[]; // the project's AI notes, which everyone can change
  activeId: string | null;
  createNote: (parentId: string | null) => Promise<void>;
  createAiNote: () => Promise<void>;
  renameNote: (id: string, title: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  moveNote: (id: string, newParentId: string | null) => Promise<void>;
  placeNote: (id: string, targetId: string, where: DropPosition) => Promise<void>;
  updateLocal: (id: string, patch: Partial<NoteSummary>) => void;
  hidden: boolean; // your notes here are hidden from everyone else
  setHidden: (hide: boolean) => Promise<void>;
};

const NotesContext = createContext<NotesContextValue | null>(null);

export function useNotes() {
  const value = use(NotesContext);
  if (!value) throw new Error("useNotes must be used inside NotesProvider");
  return value;
}

export function NotesProvider({
  projectId,
  meId,
  writerNames,
  initialNotes,
  initialHidden = false,
  children,
}: {
  projectId: string;
  meId: string;
  writerNames: Record<string, string>;
  initialNotes: NoteSummary[];
  initialHidden?: boolean;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useParams<{ noteId?: string }>();
  const activeId = params.noteId ?? null;

  // Every note in the project; changes below update this list.
  const [allNotes, setNotes] = useState(initialNotes);
  // If the server sends a fresh list (e.g. after navigating back), use it.
  const [seen, setSeen] = useState(initialNotes);
  if (seen !== initialNotes) {
    setSeen(initialNotes);
    setNotes(initialNotes);
  }
  // "Expand": hide the notes list and widen the page. Remembered on this
  // device (the server, which can't know, draws it narrow).
  const expanded = useSyncExternalStore(subscribeExpanded, readExpanded, () => false);
  const toggleExpanded = useCallback(() => writeExpanded(!readExpanded()), []);

  // Changes made here (create, rename, move…) note the time, so a live check
  // that started before them can't put the old list back.
  const lastLocalChange = useRef(0);
  const changeNotes = useCallback((update: NoteSummary[] | ((all: NoteSummary[]) => NoteSummary[])) => {
    lastLocalChange.current = Date.now();
    setNotes(update);
  }, []);

  // LIVE: the list is re-read every few seconds while the page is in view (and
  // straight away when you come back to it), so notes others add, rename or
  // delete appear without refreshing. This also replaces a list the browser
  // kept from an earlier visit (e.g. after switching to Tasks and back).
  useEffect(() => {
    let current = true;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      const startedAt = Date.now();
      const { data, error } = await supabase.from("notes").select(SUMMARY).eq("project_id", projectId);
      busy = false;
      if (!current || error || !data) return;
      if (lastLocalChange.current > startedAt - 1000) return; // our own change may not be in this answer yet
      setNotes((now) => (noteListKey(now) === noteListKey(data) ? now : data));
    };
    void check();
    const timer = window.setInterval(check, LIVE_CHECK_MS);
    const onBack = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [initialNotes, projectId, supabase]);

  const notes = useMemo(() => notesBy(allNotes, meId), [allNotes, meId]);
  const others = useMemo(
    () =>
      otherWriters(allNotes, meId, (id) => writerNames[id]).map((w) => ({ ...w, notes: notesBy(allNotes, w.writer) })),
    [allNotes, meId, writerNames],
  );

  const aiNotes = useMemo(() => aiNotesOf(allNotes), [allNotes]);

  const updateLocal = useCallback((id: string, patch: Partial<NoteSummary>) => {
    changeNotes((all) => all.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, [changeNotes]);

  const createNote = useCallback(
    async (parentId: string | null) => {
      const siblings = childrenOf(notes, parentId);
      const position = keyBetween(siblings.at(-1)?.position ?? null, null) ?? evenlySpacedKeys(1)[0];
      const { data, error } = await supabase
        .from("notes")
        .insert({ project_id: projectId, parent_id: parentId, title: "Untitled", position })
        .select(SUMMARY)
        .single();
      if (error || !data) {
        toast.error("Couldn't create the note. Try again.");
        return;
      }
      changeNotes((all) => [...all, data]);
      router.push(`/projects/${projectId}/notes/${data.id}?new=1`);
    },
    [notes, projectId, router, supabase, changeNotes],
  );

  // A blank AI note (most come from the meeting recorder).
  const createAiNote = useCallback(async () => {
    const { data, error } = await supabase
      .from("notes")
      .insert({ project_id: projectId, title: "Untitled", kind: "ai" })
      .select(SUMMARY)
      .single();
    if (error || !data) {
      toast.error("Couldn't create the note. Try again.");
      return;
    }
    changeNotes((all) => [...all, data]);
    router.push(`/projects/${projectId}/notes/${data.id}?new=1`);
  }, [projectId, router, supabase, changeNotes]);

  const renameNote = useCallback(
    async (id: string, title: string) => {
      const clean = title.trim().slice(0, 200) || "Untitled";
      const { data, error } = await supabase
        .from("notes")
        .update({ title: clean })
        .eq("id", id)
        .select("updated_at")
        .single();
      if (error || !data) {
        toast.error("Couldn't rename the note.");
        return;
      }
      updateLocal(id, { title: clean, updated_at: data.updated_at });
      // Let an open editor for this note pick up the new title.
      window.dispatchEvent(new CustomEvent("note-renamed", { detail: { id, title: clean } }));
    },
    [supabase, updateLocal],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      const doomed = subtreeIds(allNotes, id);
      const { error } = await supabase.from("notes").delete().eq("id", id);
      if (error) {
        toast.error("Couldn't delete the note.");
        return;
      }
      changeNotes((all) => all.filter((n) => !doomed.has(n.id)));
      forgetLastNote(projectId, doomed);
      // Tidy up pictures placed on those notes (best effort; the notes are already gone).
      void Promise.all(
        [...doomed].map(async (noteId) => {
          const folder = `${projectId}/note-images/${noteId}`;
          const { data } = await supabase.storage.from("project-files").list(folder);
          if (data?.length) await supabase.storage.from("project-files").remove(data.map((f) => `${folder}/${f.name}`));
        }),
      );
      toast.success(doomed.size > 1 ? `Deleted the note and ${doomed.size - 1} subpage(s)` : "Note deleted");
      if (activeId && doomed.has(activeId)) router.push(`/projects/${projectId}/notes`);
    },
    [activeId, allNotes, projectId, router, supabase, changeNotes],
  );

  const moveNote = useCallback(
    async (id: string, newParentId: string | null) => {
      const siblings = childrenOf(notes, newParentId).filter((n) => n.id !== id);
      const position = keyBetween(siblings.at(-1)?.position ?? null, null) ?? evenlySpacedKeys(1)[0];
      const { error } = await supabase
        .from("notes")
        .update({ parent_id: newParentId, position })
        .eq("id", id);
      if (error) {
        toast.error(error.message.includes("own subpages") ? "A page can't go inside its own subpage." : "Couldn't move the note.");
        return;
      }
      changeNotes((all) => all.map((n) => (n.id === id ? { ...n, parent_id: newParentId, position } : n)));
      toast.success("Note moved");
    },
    [notes, supabase, changeNotes],
  );

  // Drag-and-drop: put `id` before, after or inside `targetId`.
  const placeNote = useCallback(
    async (id: string, targetId: string, where: DropPosition) => {
      const plan = planPlacement(notes, id, targetId, where);
      if ("error" in plan) {
        toast.error(plan.error);
        return;
      }
      if (plan.updates.length === 0) return; // dropped where it already was

      const previous = allNotes;
      changeNotes((all) => applyPlacement(all, plan.updates));
      const results = await Promise.all(
        plan.updates.map(({ id: rowId, ...change }) => supabase.from("notes").update(change).eq("id", rowId)),
      );
      if (results.some((r) => r.error)) {
        changeNotes(previous);
        toast.error("Couldn't move the note. Try again.");
      }
    },
    [allNotes, notes, supabase, changeNotes],
  );

  // "Hide from others": your notes in this project disappear for everyone
  // else (the database enforces it) until you show them again.
  const [hidden, setHiddenState] = useState(initialHidden);
  const setHidden = useCallback(
    async (hide: boolean) => {
      const { error } = hide
        ? await supabase.from("hidden_note_writers").insert({ project_id: projectId, user_id: meId })
        : await supabase.from("hidden_note_writers").delete().eq("project_id", projectId).eq("user_id", meId);
      // Already hidden (a second click or another window) counts as done.
      if (error && !(hide && error.code === "23505")) {
        toast.error(hide ? "Couldn't hide your notes. Try again." : "Couldn't show your notes. Try again.");
        return;
      }
      setHiddenState(hide);
      toast.success(hide ? "Your notes here are now hidden from everyone else" : "Your notes are visible to the project again");
    },
    [meId, projectId, supabase],
  );

  const value = useMemo(
    () => ({
      projectId,
      meId,
      writerNames,
      expanded,
      toggleExpanded,
      notes,
      allNotes,
      others,
      aiNotes,
      activeId,
      createNote,
      createAiNote,
      renameNote,
      deleteNote,
      moveNote,
      placeNote,
      updateLocal,
      hidden,
      setHidden,
    }),
    [projectId, meId, writerNames, expanded, toggleExpanded, notes, allNotes, others, aiNotes, activeId, createNote, createAiNote, renameNote, deleteNote, moveNote, placeNote, updateLocal, hidden, setHidden],
  );

  return <NotesContext value={value}>{children}</NotesContext>;
}
