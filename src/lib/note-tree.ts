// Helpers for the notes tree (pages and subpages). Safe to use anywhere.
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

export type NoteSummary = {
  id: string;
  parent_id: string | null;
  title: string;
  preview: string | null;
  position: string;
  updated_at: string;
  created_at: string;
  created_by: string | null; // who wrote it; only they can change it
};

// Sort order: position key (compared character by character, like the
// database does), then creation time.
export function byPosition(a: NoteSummary, b: NoteSummary) {
  if (a.position < b.position) return -1;
  if (a.position > b.position) return 1;
  return a.created_at.localeCompare(b.created_at);
}

export function childrenOf(notes: NoteSummary[], parentId: string | null) {
  return notes.filter((n) => n.parent_id === parentId).sort(byPosition);
}

// The note and every subpage beneath it.
export function subtreeIds(notes: NoteSummary[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of notes) {
      if (n.parent_id && ids.has(n.parent_id) && !ids.has(n.id)) {
        ids.add(n.id);
        grew = true;
      }
    }
  }
  return ids;
}

// The chain of parents above a note (nearest first).
export function ancestorIds(notes: NoteSummary[], id: string): string[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const out: string[] = [];
  let current = byId.get(id)?.parent_id ?? null;
  while (current && !out.includes(current)) {
    out.push(current);
    current = byId.get(current)?.parent_id ?? null;
  }
  return out;
}

// A sort key that places an item between two neighbours. Returns null when
// the neighbours have the same key (older data), in which case the caller
// renumbers the whole sibling list with evenlySpacedKeys().
export function keyBetween(before: string | null, after: string | null): string | null {
  try {
    return generateKeyBetween(before, after);
  } catch {
    return null;
  }
}

export function evenlySpacedKeys(count: number): string[] {
  return generateNKeysBetween(null, null, count);
}

// "Today 23:41", "Yesterday", "11 Nov" or "11 Nov 2025".
export function formatEdited(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) {
    return `Today ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

// ---------------------------------------------------------------------------
// Drag-and-drop placement
// ---------------------------------------------------------------------------
export type DropPosition = "before" | "after" | "inside";

export type PlacementUpdate = { id: string; position: string; parent_id?: string | null };

/**
 * Works out what has to change to put note `id` before, after or inside
 * `targetId`. Returns the rows to update (usually just one), an empty list if
 * nothing would change, or an error if the move isn't allowed.
 */
export function planPlacement(
  notes: NoteSummary[],
  id: string,
  targetId: string,
  where: DropPosition,
): { updates: PlacementUpdate[] } | { error: string } {
  const moving = notes.find((n) => n.id === id);
  const target = notes.find((n) => n.id === targetId);
  if (!moving || !target) return { error: "That note no longer exists." };
  if (id === targetId) return { updates: [] };
  if (subtreeIds(notes, id).has(targetId)) {
    return { error: "A page can't go inside one of its own subpages." };
  }

  const newParent = where === "inside" ? targetId : target.parent_id;
  const siblings = childrenOf(notes, newParent).filter((n) => n.id !== id);

  let index: number;
  if (where === "inside") {
    index = siblings.length; // last subpage
  } else {
    const t = siblings.findIndex((n) => n.id === targetId);
    index = where === "before" ? t : t + 1;
  }

  // Dropped where it already is? Then nothing to save.
  if (moving.parent_id === newParent) {
    const current = childrenOf(notes, newParent).findIndex((n) => n.id === id);
    if (current === index) return { updates: [] };
  }

  const key = keyBetween(siblings[index - 1]?.position ?? null, siblings[index]?.position ?? null);
  if (key) return { updates: [{ id, parent_id: newParent, position: key }] };

  // Neighbours share a key (older data): renumber the new sibling list.
  const ordered = [...siblings];
  ordered.splice(index, 0, moving);
  const keys = evenlySpacedKeys(ordered.length);
  return {
    updates: ordered.map((n, i) => ({
      id: n.id,
      position: keys[i],
      ...(n.id === id ? { parent_id: newParent } : {}),
    })),
  };
}

export function applyPlacement(notes: NoteSummary[], updates: PlacementUpdate[]): NoteSummary[] {
  const byId = new Map(updates.map((u) => [u.id, u]));
  return notes.map((n) => {
    const u = byId.get(n.id);
    if (!u) return n;
    return { ...n, position: u.position, ...(u.parent_id !== undefined ? { parent_id: u.parent_id } : {}) };
  });
}

// One person's notes (writer null = notes whose writer's account is gone).
// A subpage whose parent page belongs to someone else (only possible for notes
// made before everyone had their own section) is shown at the top level.
export function notesBy(all: NoteSummary[], writer: string | null): NoteSummary[] {
  const mine = all.filter((n) => n.created_by === writer);
  const ids = new Set(mine.map((n) => n.id));
  return mine.map((n) => (n.parent_id && !ids.has(n.parent_id) ? { ...n, parent_id: null } : n));
}

// Everyone else who has written notes in the project, in name order.
export function otherWriters(
  all: NoteSummary[],
  meId: string,
  nameOf: (id: string) => string | undefined,
): { writer: string | null; name: string }[] {
  const writers = [...new Set(all.map((n) => n.created_by))].filter((w) => w !== meId);
  return writers
    .map((writer) => ({
      writer,
      name: writer === null ? "Earlier notes" : `${nameOf(writer) ?? "A former member"}'s notes`,
    }))
    .sort((a, b) => Number(a.writer === null) - Number(b.writer === null) || a.name.localeCompare(b.name));
}
