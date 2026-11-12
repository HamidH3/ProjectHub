"use client";

// The NOTES list on the left: pages and subpages you can expand, collapse,
// rename, move and delete, and drag:
//   * near the top/bottom edge of a note  -> the others slide apart; drop to place it there
//   * on the middle of a note, hold briefly -> "Move inside"; drop to make it a subpage
//   * drag left / right while placing     -> out of / into the note above (change level)
import Link from "next/link";
import { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  closestCenter,
  type CollisionDetection,
  useSensor,
  useSensors,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type SortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { ChevronRight, FilePlus2, FolderInput, GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ancestorIds,
  childrenOf,
  formatEdited,
  subtreeIds,
  type DropPosition,
  type NoteSummary,
} from "@/lib/note-tree";
import { cn } from "@/lib/utils";
import { useNotes } from "@/components/notes/notes-context";
import { DeleteNoteDialog, MoveNoteDialog } from "@/components/notes/note-dialogs";

// How far each level of subpages moves to the right, in pixels.
const INDENT = 10;
// How long to hold a dragged note on the middle of another before it goes inside.
const NEST_DELAY_MS = 250;
// How far to drag sideways to move one level in or out, in pixels.
const LEVEL_DRAG_PX = 32;

// One visible row: a note, how deep it is, and whether it has subpages.
type FlatItem = { note: NoteSummary; depth: number; hasChildren: boolean };

// What the current drag would do if you let go now.
type DragInfo = {
  activeId: string;
  overId: string | null;
  mode: "between" | "pending" | "inside"; // pending = on a note's middle, waiting for the hold
  newIndex: number; // where it would land in the visible list
  offsetX: number; // sideways drag distance, for changing level
  before: boolean; // top half of the note under the pointer
};

// Shift the floating card down and to the right of the cursor, so the note
// you're aiming at stays visible.
const besideCursor: Modifier = ({ transform }) => ({ ...transform, x: transform.x + 110, y: transform.y + 20 });

// The note under the pointer; when the pointer is outside the list, the nearest
// note instead, so the other notes stay slid apart rather than snapping back.
const pointerOrNearest: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

const RowState = createContext<{ drag: DragInfo | null; ghostDepth: number | null }>({ drag: null, ghostDepth: null });

// The pointer's height on screen during a drag (falls back to the middle of the
// dragged card for keyboard dragging).
function pointerY(event: DragMoveEvent): number | null {
  const start = event.activatorEvent;
  if (start instanceof MouseEvent) return start.clientY + event.delta.y;
  if (typeof TouchEvent !== "undefined" && start instanceof TouchEvent && start.touches[0]) {
    return start.touches[0].clientY + event.delta.y;
  }
  const r = event.active.rect.current.translated;
  return r ? r.top + r.height / 2 : null;
}

// The visible notes in order, top to bottom. While dragging a note, its own
// subpages are folded into it (they travel with it).
function flatten(notes: NoteSummary[], collapsed: Set<string>, foldId: string | null): FlatItem[] {
  const out: FlatItem[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const note of childrenOf(notes, parentId)) {
      const hasChildren = notes.some((n) => n.parent_id === note.id);
      out.push({ note, depth, hasChildren });
      if (hasChildren && !collapsed.has(note.id) && note.id !== foldId) walk(note.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function NoteTree() {
  const { notes, activeId, createNote, placeNote } = useNotes();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  // When you open a note, expand its parents once so you can see it.
  // After that, the arrows are free to collapse them again.
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  if (activeId !== revealedFor) {
    setRevealedFor(activeId);
    if (activeId) {
      const parents = ancestorIds(notes, activeId);
      if (parents.some((id) => collapsed.has(id))) {
        setCollapsed((c) => new Set([...c].filter((id) => !parents.includes(id))));
      }
    }
  }

  const toggle = useCallback(
    (id: string) =>
      setCollapsed((c) => {
        const next = new Set(c);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const expand = useCallback(
    (id: string) => setCollapsed((c) => (c.has(id) ? new Set([...c].filter((x) => x !== id)) : c)),
    [],
  );

  // ---- dragging -------------------------------------------------------------
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const nestTimer = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const flat = useMemo(() => flatten(notes, collapsed, drag?.activeId ?? null), [notes, collapsed, drag?.activeId]);
  const activeIndex = drag ? flat.findIndex((f) => f.note.id === drag.activeId) : -1;
  const dragNote = drag ? notes.find((n) => n.id === drag.activeId) : undefined;
  const dragSubpages = drag ? subtreeIds(notes, drag.activeId).size - 1 : 0;

  // Where the note would land and at what level (the outlined gap). Not used
  // when it's about to go inside another note.
  const projection = useMemo(() => {
    if (!drag || drag.mode === "inside" || activeIndex < 0) return null;
    const items = arrayMove(flat, activeIndex, drag.newIndex);
    const prev = items[drag.newIndex - 1];
    const next = items[drag.newIndex + 1];
    const maxDepth = prev ? prev.depth + 1 : 0; // at most one level under the note above
    const minDepth = next ? next.depth : 0; // can't leave the note below "orphaned"
    const wanted = flat[activeIndex].depth + Math.round(drag.offsetX / LEVEL_DRAG_PX);
    return { items, index: drag.newIndex, depth: Math.min(maxDepth, Math.max(minDepth, wanted)) };
  }, [drag, flat, activeIndex]);

  // The other notes stay slid apart around the gap the whole time. The gap only
  // moves when you reach the top or bottom edge of another note, so hovering a
  // note's middle, the gap itself, or outside the list leaves everything still.
  const landingIndex = drag?.newIndex ?? -1;
  const strategy = useCallback<SortingStrategy>(
    (args) => verticalListSortingStrategy({ ...args, overIndex: landingIndex }),
    [landingIndex],
  );

  // Each row's original position (relative to the list), measured once when a
  // drag starts, so we always know which note is under the pointer on screen.
  const listRef = useRef<HTMLUListElement>(null);
  const slots = useRef<{ tops: number[]; bottom: number } | null>(null);
  const draggingId = drag?.activeId ?? null;
  useLayoutEffect(() => {
    const ul = listRef.current;
    if (!draggingId || !ul) {
      slots.current = null;
      return;
    }
    const base = ul.getBoundingClientRect().top;
    const rows = Array.from(ul.children) as HTMLElement[];
    slots.current = rows.length
      ? {
          tops: rows.map((r) => r.getBoundingClientRect().top - base),
          bottom: rows[rows.length - 1].getBoundingClientRect().bottom - base,
        }
      : null;
  }, [draggingId]);

  const sensors = useSensors(
    // Mouse: drag from anywhere on the note once it moves 6px (so a click is still a click).
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch: press and hold for a moment, so normal scrolling still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    // Keyboard: focus the grip handle, press Space, use the arrow keys, Space again to drop.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function cancelNestTimer() {
    if (nestTimer.current) clearTimeout(nestTimer.current.timer);
    nestTimer.current = null;
  }
  useEffect(() => cancelNestTimer, []);

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    const index = flat.findIndex((f) => f.note.id === id);
    setDrag({ activeId: id, overId: null, mode: "between", newIndex: index, offsetX: 0, before: false });
  }

  function onDragMove(event: DragMoveEvent) {
    if (!drag) return;
    const offsetX = event.delta.x;
    const update = (next: DragInfo) => setDrag((d) => (d && sameDrag(d, next) ? d : next));
    // Keep the gap where it is (only the level can change).
    const hold = () => {
      cancelNestTimer();
      update({ ...drag, overId: null, mode: "between", offsetX });
    };

    const y = pointerY(event);
    const s = slots.current;
    const ul = listRef.current;
    if (y === null || !s || !ul) return hold();

    const rel = y - ul.getBoundingClientRect().top;
    // Above or below the list: leave things as they are.
    if (rel < s.tops[0] || rel >= s.bottom) return hold();

    // Which on-screen slot the pointer is in.
    let slot = s.tops.length - 1;
    for (let i = 1; i < s.tops.length; i++) {
      if (rel < s.tops[i]) {
        slot = i - 1;
        break;
      }
    }
    const gap = drag.newIndex;
    // On the gap itself: nothing to change.
    if (slot === gap) return hold();

    // The note shown in that slot (the slots after the gap hold the note one earlier).
    const others = flat.filter((f) => f.note.id !== drag.activeId);
    const j = slot < gap ? slot : slot - 1;
    const target = others[j];
    if (!target) return hold();
    const top = s.tops[slot];
    const height = (s.tops[slot + 1] ?? s.bottom) - top;
    const within = (rel - top) / height; // 0 = top edge, 1 = bottom edge
    const overId = target.note.id;

    if (within > 0.25 && within < 0.75) {
      // On the middle of a note: everything stays still; after a short hold, "Move inside".
      if (drag.mode === "inside" && drag.overId === overId) return;
      if (nestTimer.current?.id !== overId) {
        cancelNestTimer();
        nestTimer.current = {
          id: overId,
          timer: setTimeout(() => setDrag((d) => (d && d.overId === overId ? { ...d, mode: "inside" } : d)), NEST_DELAY_MS),
        };
      }
      update({ ...drag, overId, mode: "pending", offsetX, before: within < 0.5 });
      return;
    }

    // Top or bottom edge of a note: move the gap to just before / after it.
    cancelNestTimer();
    const newIndex = within <= 0.25 ? j : j + 1;
    update({ ...drag, overId: null, mode: "between", newIndex, offsetX, before: within <= 0.25 });
  }

  function finishDrag() {
    cancelNestTimer();
    setDrag(null);
  }

  function onDragEnd() {
    if (!drag) return finishDrag();
    const { activeId: id, overId, mode } = drag;

    if (mode === "inside" && overId) {
      void placeNote(id, overId, "inside");
      expand(overId);
    } else if (projection) {
      // Otherwise it drops into the outlined gap (also when let go before a hold finished).
      const target = placementFor(projection.items, projection.index, projection.depth);
      if (target) {
        void placeNote(id, target.id, target.where);
        if (target.where === "inside") expand(target.id);
      }
    }
    finishDrag();
  }

  async function addTopLevel() {
    setCreating(true);
    await createNote(null);
    setCreating(false);
  }

  const rowState = useMemo(() => ({ drag, ghostDepth: projection?.depth ?? null }), [drag, projection?.depth]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground">MY NOTES</h2>
        <button
          type="button"
          onClick={addTopLevel}
          disabled={creating}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-primary transition hover:bg-accent disabled:opacity-50"
        >
          <Plus className="size-4" /> Add note
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          You haven&apos;t written any notes here yet. Add your first one.
        </p>
      ) : (
        <DndContext
          // A fixed id, so the server and browser name its hidden labels the same way.
          id="note-tree"
          sensors={sensors}
          collisionDetection={pointerOrNearest}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={finishDrag}
        >
          <SortableContext items={flat.map((f) => f.note.id)} strategy={strategy}>
            <RowState value={rowState}>
              <ul ref={listRef}>
                {flat.map((item) => (
                  <Row key={item.note.id} item={item} collapsed={collapsed.has(item.note.id)} toggle={toggle} />
                ))}
              </ul>
            </RowState>
          </SortableContext>

          {/* The card that follows the pointer while dragging. */}
          <DragOverlay modifiers={[besideCursor, restrictToWindowEdges]} dropAnimation={null}>
            {dragNote ? (
              <div className="w-56 cursor-grabbing rounded-md bg-card/95 px-3 py-2 shadow-xl ring-1 ring-border">
                <p className="truncate text-sm font-medium">{dragNote.title || "Untitled"}</p>
                {dragSubpages > 0 && (
                  <p className="text-xs text-muted-foreground">
                    + {dragSubpages} subpage{dragSubpages === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {drag && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Hold on a note to put it inside · drag left or right to change level
        </p>
      )}
    </div>
  );
}

function sameDrag(a: DragInfo, b: DragInfo) {
  return (
    a.overId === b.overId &&
    a.mode === b.mode &&
    a.newIndex === b.newIndex &&
    a.before === b.before &&
    Math.round(a.offsetX / LEVEL_DRAG_PX) === Math.round(b.offsetX / LEVEL_DRAG_PX)
  );
}

// Turns "this position in the visible list, at this level" into
// "before / after / inside this note".
function placementFor(
  items: FlatItem[],
  index: number,
  depth: number,
): { id: string; where: DropPosition } | null {
  // A note at the same level just above it (skipping deeper subpages): go after it.
  for (let i = index - 1; i >= 0; i--) {
    if (items[i].depth < depth) break;
    if (items[i].depth === depth) return { id: items[i].note.id, where: "after" };
  }
  // A note at the same level just below it: go before it.
  for (let i = index + 1; i < items.length; i++) {
    if (items[i].depth < depth) break;
    if (items[i].depth === depth) return { id: items[i].note.id, where: "before" };
  }
  // No neighbours at this level: it becomes the first subpage of the note above.
  for (let i = index - 1; i >= 0; i--) {
    if (items[i].depth === depth - 1) return { id: items[i].note.id, where: "inside" };
  }
  return null;
}

function Row({ item, collapsed, toggle }: { item: FlatItem; collapsed: boolean; toggle: (id: string) => void }) {
  const { note, depth, hasChildren } = item;
  const { projectId, activeId, createNote, renameNote } = useNotes();
  const { drag, ghostDepth } = use(RowState);

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
  });

  const [renaming, setRenaming] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Where the mouse was pressed, to tell a drag from a click.
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  const open = hasChildren && !collapsed;
  const active = activeId === note.id;
  const nestHere = drag?.overId === note.id && drag.mode === "inside";
  // While dragging, this row's own spot shows where the note will land, at its new level.
  const shownDepth = isDragging && ghostDepth !== null ? ghostDepth : depth;

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  return (
    <li
      ref={setNodeRef}
      // Translate only (never scale), so text keeps its size while the notes slide.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="relative pb-0.5"
    >
      {/* Guide lines from each parent's arrow, so subpages read as "inside" it */}
      {!isDragging &&
        Array.from({ length: depth }, (_, level) => (
          <span
            key={level}
            aria-hidden
            className="absolute bottom-0 top-0 w-px bg-border"
            style={{ left: 4 + level * INDENT + 34 }}
          />
        ))}

      <div
        // Drag from anywhere on the note (not while renaming, so text can be selected).
        onMouseDown={(e) => {
          pressedAt.current = { x: e.clientX, y: e.clientY };
          if (!renaming) listeners?.onMouseDown?.(e);
        }}
        onTouchStart={(e) => {
          if (!renaming) listeners?.onTouchStart?.(e);
        }}
        // After a drag, the browser also sends a "click" that would open the note.
        // If the mouse moved more than a few pixels, it was a drag: ignore that click.
        onClickCapture={(e) => {
          const start = pressedAt.current;
          if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className={cn(
          // relative + solid colours: the highlight sits on top of the guide lines.
          "group relative flex cursor-grab select-none items-start gap-1 rounded-md py-1.5 pr-1 transition-[background-color,margin,box-shadow] active:cursor-grabbing",
          active ? "bg-accent" : "hover:bg-[#1f1f1f]",
          nestHere && "bg-primary/15 ring-2 ring-primary",
          // The spot where the dragged note will land: a faint outline.
          isDragging && "bg-primary/5 ring-1 ring-dashed ring-primary/60 [&>*]:opacity-40",
          // Going inside another note instead: fade the gap.
          isDragging && drag?.mode === "inside" && "opacity-30",
        )}
        // marginLeft moves the whole row (including its highlight) in for subpages.
        style={{ marginLeft: shownDepth * INDENT, paddingLeft: 4 }}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          onKeyDown={(e) => listeners?.onKeyDown?.(e)}
          {...attributes}
          aria-label={`Drag to move ${note.title}`}
          className="mt-0.5 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/0 transition group-hover:text-muted-foreground focus-visible:text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={() => toggle(note.id)}
          aria-label={open ? `Collapse ${note.title}` : `Expand ${note.title}`}
          aria-expanded={hasChildren ? open : undefined}
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground",
            !hasChildren && "invisible",
          )}
        >
          <ChevronRight className={cn("size-3.5 transition", open && "rotate-90")} />
        </button>

        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                renameNote(note.id, inputRef.current?.value ?? note.title);
                setRenaming(false);
              }}
            >
              <input
                ref={inputRef}
                defaultValue={note.title}
                maxLength={200}
                aria-label="Note title"
                onBlur={(e) => {
                  renameNote(note.id, e.target.value);
                  setRenaming(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="w-full rounded border border-ring bg-background px-1.5 py-0.5 text-sm outline-none"
              />
            </form>
          ) : (
            <Link
              href={`/projects/${projectId}/notes/${note.id}`}
              draggable={false}
              aria-current={active ? "page" : undefined}
              className="block rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn("block truncate text-sm", active ? "font-medium text-foreground" : "text-foreground/90")}>
                {note.title || "Untitled"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{note.preview || "Empty note"}</span>
              <span className="block text-[11px] text-muted-foreground/70">
                {nestHere ? "Move inside" : formatEdited(note.updated_at)}
              </span>
            </Link>
          )}
        </div>

        <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 max-lg:opacity-100">
          <button
            type="button"
            onClick={() => createNote(note.id)}
            aria-label={`Add a subpage to ${note.title}`}
            title="Add subpage"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              aria-label={`Options for ${note.title}`}
              className="flex size-6 items-center justify-center rounded text-muted-foreground outline-none hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil className="size-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => createNote(note.id)}>
                <FilePlus2 className="size-4" /> Add subpage
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setMoveOpen(true)}>
                <FolderInput className="size-4" /> Move to…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mounted only while open, so they start fresh each time. */}
      {moveOpen && <MoveNoteDialog note={note} open onOpenChange={setMoveOpen} />}
      {deleteOpen && <DeleteNoteDialog note={note} open onOpenChange={setDeleteOpen} />}
    </li>
  );
}
