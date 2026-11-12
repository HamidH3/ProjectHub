"use client";

// Search everything: press Ctrl+K (⌘K on a Mac) or "/" anywhere, or click
// Search in the sidebar. Finds projects, notes, to-dos, meetings and files in
// every project you can open (the database decides what that is).
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  CornerDownLeft,
  File as FileIcon,
  FileText,
  FolderKanban,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { colorOf } from "@/lib/project-colors";
import { dayShort } from "@/lib/days";
import { cn } from "@/lib/utils";

type Kind = "project" | "note" | "task" | "meeting" | "file";
export type SearchHit = {
  kind: Kind;
  id: string;
  project_id: string;
  project_name: string;
  project_color: string;
  title: string;
  snippet: string | null;
  detail: string | null;
  folder_id: string | null;
  done: boolean | null;
};
type QuickProject = { id: string; name: string; color: string };

const GROUPS: { kind: Kind; label: string }[] = [
  { kind: "project", label: "Projects" },
  { kind: "note", label: "Notes" },
  { kind: "task", label: "To-dos" },
  { kind: "meeting", label: "Meetings" },
  { kind: "file", label: "Files" },
];
const MIN_CHARS = 2;
const WAIT_MS = 180;

// Where each result takes you.
export function hrefFor(hit: SearchHit): string {
  const base = `/projects/${hit.project_id}`;
  switch (hit.kind) {
    case "project":
      return base;
    case "note":
      return `${base}/notes/${hit.id}`;
    case "task":
      return `${base}/tasks`;
    case "meeting":
      return `${base}/calendar${hit.detail ? `?month=${hit.detail.slice(0, 7)}` : ""}`;
    case "file":
      return `${base}/files${hit.folder_id ? `?folder=${hit.folder_id}` : ""}`;
  }
}

// "…agreed the ⟦budget⟧ for…" → text with the matching words highlighted.
// Built from plain text pieces, never as HTML, so a note can't inject markup.
export function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(⟦[^⟧]*⟧)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("⟦") && part.endsWith("⟧") ? (
          <mark key={i} className="rounded-sm bg-primary/25 px-0.5 text-foreground">
            {part.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

type SearchValue = { openSearch: () => void };
const SearchContext = createContext<SearchValue | null>(null);

export function useSearch() {
  const value = use(SearchContext);
  if (!value) throw new Error("useSearch must be used inside SearchProvider");
  return value;
}

// A magnifying-glass button that opens search (used in the phone's top bar).
export function SearchButton({ className }: { className?: string }) {
  const { openSearch } = useSearch();
  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label="Search everything"
      className={cn("inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground", className)}
    >
      <Search className="size-5" />
    </button>
  );
}

export function SearchProvider({ projects, children }: { projects: QuickProject[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openSearch = useCallback(() => setOpen(true), []);

  // Ctrl+K / ⌘K anywhere; "/" when you're not typing in a box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing =
        e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ openSearch }), [openSearch]);
  return (
    <SearchContext value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Mounted only while open, so it starts empty each time. */}
        {open && <SearchPanel projects={projects} onClose={() => setOpen(false)} />}
      </Dialog>
    </SearchContext>
  );
}

function SearchPanel({ projects, onClose }: { projects: QuickProject[]; onClose: () => void }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchedFor, setSearchedFor] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const latest = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query.trim();
  const searching = q.length >= MIN_CHARS;

  // Ask the database a moment after typing stops; ignore answers to older searches.
  useEffect(() => {
    if (!searching) return;
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("search_everything", { p_query: q, p_limit: 6 });
      if (ticket !== latest.current) return;
      setLoading(false);
      setFailed(Boolean(error));
      setHits((data as SearchHit[] | null) ?? []);
      setSearchedFor(q);
      setActive(0);
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [q, searching, supabase]);

  // What's listed, in order (so the arrow keys follow what you see).
  const items = useMemo(() => {
    if (!searching) {
      return projects.slice(0, 8).map<SearchHit>((p) => ({
        kind: "project",
        id: p.id,
        project_id: p.id,
        project_name: p.name,
        project_color: p.color,
        title: p.name,
        snippet: null,
        detail: null,
        folder_id: null,
        done: null,
      }));
    }
    return GROUPS.flatMap((g) => hits.filter((h) => h.kind === g.kind));
  }, [hits, projects, searching]);

  const go = (hit: SearchHit | undefined) => {
    if (!hit) return;
    onClose();
    router.push(hrefFor(hit));
  };

  // Keep the highlighted row in view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const stale = searching && (loading || searchedFor !== q);
  let index = -1;

  return (
    <DialogContent
      showCloseButton={false}
      className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-2xl"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive((a) => Math.min(a + 1, items.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive((a) => Math.max(a - 1, 0));
        } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          go(items[active]);
        }
      }}
    >
      <DialogTitle className="sr-only">Search</DialogTitle>
      <DialogDescription className="sr-only">Search projects, notes, to-dos, meetings and files.</DialogDescription>
      <div className="flex items-center gap-3 border-b border-border px-4">
        {stale ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" />
        )}
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Search notes, to-dos, meetings, files and projects…"
          aria-label="Search"
          aria-controls="search-results"
          aria-activedescendant={items[active] ? `search-item-${active}` : undefined}
          role="combobox"
          aria-expanded
          maxLength={200}
          className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">Esc</kbd>
      </div>

      <div ref={listRef} id="search-results" role="listbox" aria-label="Results" className="max-h-[60vh] overflow-y-auto p-2">
        {!searching ? (
          <>
            <p className="px-2 pb-1 pt-1 text-[11px] font-semibold tracking-wider text-muted-foreground">JUMP TO A PROJECT</p>
            {items.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No projects yet.</p>}
            {items.map((hit) => {
              index++;
              return <ResultRow key={hit.id} hit={hit} index={index} active={index === active} onHover={setActive} onPick={go} />;
            })}
            <p className="px-2 pb-1 pt-3 text-xs text-muted-foreground">Type at least {MIN_CHARS} letters to search everything.</p>
          </>
        ) : failed ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Search isn&apos;t working right now. Try again in a moment.</p>
        ) : !stale && items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing found for “{searchedFor}”.</p>
        ) : (
          GROUPS.map((g) => {
            const group = items.filter((h) => h.kind === g.kind);
            if (!group.length) return null;
            return (
              <div key={g.kind} role="group" aria-label={g.label} className={cn("pb-1", stale && "opacity-60")}>
                <p className="px-2 pb-1 pt-2 text-[11px] font-semibold tracking-wider text-muted-foreground">{g.label.toUpperCase()}</p>
                {group.map((hit) => {
                  index++;
                  return <ResultRow key={`${hit.kind}-${hit.id}`} hit={hit} index={index} active={index === active} onHover={setActive} onPick={go} />;
                })}
              </div>
            );
          })
        )}
      </div>

      <div className="hidden items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground sm:flex">
        <span>↑ ↓ to move</span>
        <span className="inline-flex items-center gap-1">
          <CornerDownLeft className="size-3" /> to open
        </span>
        <span className="ml-auto">Ctrl K to open search from anywhere</span>
      </div>
    </DialogContent>
  );
}

const KIND_ICON = { project: FolderKanban, note: FileText, task: Circle, meeting: Users, file: FileIcon } as const;

function ResultRow({
  hit,
  index,
  active,
  onHover,
  onPick,
}: {
  hit: SearchHit;
  index: number;
  active: boolean;
  onHover: (i: number) => void;
  onPick: (hit: SearchHit) => void;
}) {
  const Icon = hit.kind === "task" && hit.done ? CheckCircle2 : KIND_ICON[hit.kind];
  const dot = colorOf(hit.project_color).dot;
  const where =
    hit.kind === "project"
      ? hit.detail === "archived"
        ? "Archived"
        : null
      : [hit.project_name, (hit.kind === "task" || hit.kind === "meeting") && hit.detail ? dayShort(hit.detail) : null]
          .filter(Boolean)
          .join(" · ");

  return (
    <div
      id={`search-item-${index}`}
      data-index={index}
      role="option"
      aria-selected={active}
      onMouseMove={() => !active && onHover(index)}
      onClick={() => onPick(hit)}
      className={cn("flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2", active && "bg-accent")}
    >
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${dot}26`, color: dot }}>
        {hit.kind === "meeting" ? <CalendarDays className="size-3.5" /> : <Icon className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm", hit.kind === "task" && hit.done && "text-muted-foreground line-through")}>{hit.title}</span>
        {hit.snippet && (
          <span className="line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            <Highlighted text={hit.snippet} />
          </span>
        )}
      </span>
      {where && <span className="max-w-[40%] shrink-0 truncate pt-0.5 text-xs text-muted-foreground">{where}</span>}
    </div>
  );
}
