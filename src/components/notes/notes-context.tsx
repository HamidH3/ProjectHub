"use client";

// Shared state for a project's notes: the list (for the left-hand tree) and
// the actions that change it. Changes go straight to the database through the
// browser client; the database's security rules decide what is allowed.
import { createContext, use, useCallback, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  applyPlacement,
  childrenOf,
  evenlySpacedKeys,
  keyBetween,
  planPlacement,
  subtreeIds,
  type DropPosition,
  type NoteSummary,
} from "@/lib/note-tree";

const SUMMARY = "id, parent_id, title, preview, position, updated_at, created_at";

type NotesContextValue = {
  projectId: string;
  notes: NoteSummary[];
  activeId: string | null;
  createNote: (parentId: string | null) => Promise<void>;
  renameNote: (id: string, title: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  moveNote: (id: string, newParentId: string | null) => Promise<void>;
  placeNote: (id: string, targetId: string, where: DropPosition) => Promise<void>;
  updateLocal: (id: string, patch: Partial<NoteSummary>) => void;
};

const NotesContext = createContext<NotesContextValue | null>(null);

export function useNotes() {
  const value = use(NotesContext);
  if (!value) throw new Error("useNotes must be used inside NotesProvider");
  return value;
}

export function NotesProvider({
  projectId,
  initialNotes,
  children,
}: {
  projectId: string;
  initialNotes: NoteSummary[];
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useParams<{ noteId?: string }>();
  const activeId = params.noteId ?? null;

  const [notes, setNotes] = useState(initialNotes);
  // If the server sends a fresh list (e.g. after navigating back), use it.
  const [seen, setSeen] = useState(initialNotes);
  if (seen !== initialNotes) {
    setSeen(initialNotes);
    setNotes(initialNotes);
  }

  const updateLocal = useCallback((id: string, patch: Partial<NoteSummary>) => {
    setNotes((all) => all.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

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
      setNotes((all) => [...all, data]);
      router.push(`/projects/${projectId}/notes/${data.id}?new=1`);
    },
    [notes, projectId, router, supabase],
  );

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
      const doomed = subtreeIds(notes, id);
      const { error } = await supabase.from("notes").delete().eq("id", id);
      if (error) {
        toast.error("Couldn't delete the note.");
        return;
      }
      setNotes((all) => all.filter((n) => !doomed.has(n.id)));
      toast.success(doomed.size > 1 ? `Deleted the note and ${doomed.size - 1} subpage(s)` : "Note deleted");
      if (activeId && doomed.has(activeId)) router.push(`/projects/${projectId}/notes`);
    },
    [activeId, notes, projectId, router, supabase],
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
      setNotes((all) => all.map((n) => (n.id === id ? { ...n, parent_id: newParentId, position } : n)));
      toast.success("Note moved");
    },
    [notes, supabase],
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

      const previous = notes;
      setNotes((all) => applyPlacement(all, plan.updates));
      const results = await Promise.all(
        plan.updates.map(({ id: rowId, ...change }) => supabase.from("notes").update(change).eq("id", rowId)),
      );
      if (results.some((r) => r.error)) {
        setNotes(previous);
        toast.error("Couldn't move the note. Try again.");
      }
    },
    [notes, supabase],
  );

  const value = useMemo(
    () => ({ projectId, notes, activeId, createNote, renameNote, deleteNote, moveNote, placeNote, updateLocal }),
    [projectId, notes, activeId, createNote, renameNote, deleteNote, moveNote, placeNote, updateLocal],
  );

  return <NotesContext value={value}>{children}</NotesContext>;
}
