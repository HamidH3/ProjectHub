"use client";

// Help for drawing on notes: the keyboard shortcuts window (press ? or click
// the keyboard button) and the small status bar that says which tool is on.
import { Keyboard } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DrawTool } from "@/components/notes/drawing-layer";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl";

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Tools (when you're not typing in the text)",
    keys: [
      ["T", "Type text"],
      ["P", "Pen"],
      ["H", "Highlighter"],
      ["E", "Eraser"],
      ["S", "Select and move"],
      ["Esc", "Leave the text, or go back to typing"],
    ],
  },
  {
    title: "Anywhere in the note",
    keys: [
      [`${MOD} Z`, "Undo (text or drawing, whichever you did last)"],
      [`${MOD} Y`, "Redo"],
      [`${MOD} V`, "Paste a screenshot onto the page"],
      [`${MOD} S`, "Save now"],
      ["?", "Show these shortcuts"],
    ],
  },
  {
    title: "With Select",
    keys: [
      ["Click", "Pick a drawing or picture"],
      ["Shift + click", "Add to what's picked"],
      ["Drag on empty paper", "Pick everything in a box"],
      [`${MOD} A`, "Pick everything"],
      ["Arrow keys", "Nudge (hold Shift for bigger steps)"],
      ["Delete", "Remove what's picked"],
      [`${MOD} C / ${MOD} X / ${MOD} V`, "Copy / cut / paste drawings"],
      [`${MOD} D`, "Duplicate"],
      ["] / [", "Bring to front / send to back"],
    ],
  },
];

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
      {children}
    </kbd>
  );
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-4" /> Keyboard shortcuts for notes
          </DialogTitle>
          <DialogDescription>Draw with a mouse, a pen or your finger. These work on a PC keyboard.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.title}</h3>
              <dl className="space-y-1.5">
                {g.keys.map(([k, what]) => (
                  <div key={k} className="flex items-center justify-between gap-4 text-sm">
                    <dt className="flex flex-wrap gap-1">
                      {k.split(" / ").map((part) => (
                        <Key key={part}>{part}</Key>
                      ))}
                    </dt>
                    <dd className="text-right text-muted-foreground">{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const TIPS: Record<Exclude<DrawTool, "type">, string> = {
  pen: "Draw with your mouse, pen or finger",
  highlighter: "Highlight over your writing",
  eraser: "Touch a line to remove it",
  select: "Click to pick · drag to move · Delete to remove",
};
const NAMES: Record<Exclude<DrawTool, "type">, string> = {
  pen: "Pen",
  highlighter: "Highlighter",
  eraser: "Eraser",
  select: "Select",
};

// A small bar at the bottom of the screen while a drawing tool is on, so it's
// always clear what clicks will do and how to get back to typing.
export function DrawingStatus({
  tool,
  selectedCount,
  onType,
  onHelp,
}: {
  tool: DrawTool;
  selectedCount: number;
  onType: () => void;
  onHelp: () => void;
}) {
  if (tool === "type") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border bg-popover/95 py-1.5 pr-1.5 pl-4 text-sm text-popover-foreground shadow-lg backdrop-blur">
        <span className="font-medium whitespace-nowrap">{NAMES[tool]}</span>
        <span className="hidden truncate text-muted-foreground sm:inline">
          {tool === "select" && selectedCount > 0 ? `${selectedCount} picked · drag to move · Delete to remove` : TIPS[tool]}
        </span>
        <button
          type="button"
          onClick={onType}
          className="rounded-full bg-primary px-3 py-1 text-xs font-medium whitespace-nowrap text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Back to typing <span className="hidden opacity-80 sm:inline">(Esc)</span>
        </button>
        <button
          type="button"
          onClick={onHelp}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          className="hidden size-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-(--hover) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
        >
          <Keyboard className="size-4" />
        </button>
      </div>
    </div>
  );
}
