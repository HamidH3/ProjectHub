"use client";

// The second row of the note toolbar: choose Type (write text) or a drawing
// tool, a colour and thickness, add a picture, and undo/redo drawing.
import { useRef } from "react";
import { Eraser, Highlighter, ImagePlus, MousePointer2, PenLine, Redo2, Trash2, Type, Undo2 } from "lucide-react";
import { HIGHLIGHT_COLORS, PEN_COLORS, PEN_SIZES } from "@/lib/drawing";
import { cn } from "@/lib/utils";
import type { DrawTool } from "@/components/notes/drawing-layer";

const TOOLS: { id: DrawTool; label: string; icon: typeof Type }[] = [
  { id: "type", label: "Type text", icon: Type },
  { id: "pen", label: "Pen", icon: PenLine },
  { id: "highlighter", label: "Highlighter", icon: Highlighter },
  { id: "eraser", label: "Eraser (touch a line to remove it)", icon: Eraser },
  { id: "select", label: "Select and move (drag a box to pick several)", icon: MousePointer2 },
];

function Btn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-(--paper-soft) transition hover:bg-black/[0.07] hover:text-(--paper-ink) disabled:pointer-events-none disabled:opacity-35",
        active && "bg-white text-primary shadow-sm ring-1 ring-(--paper-line)",
      )}
    >
      {children}
    </button>
  );
}

export function DrawToolbar({
  tool,
  onTool,
  color,
  onColor,
  size,
  onSize,
  onPicture,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  selectedCount,
  onDeleteSelected,
}: {
  tool: DrawTool;
  onTool: (t: DrawTool) => void;
  color: string;
  onColor: (c: string) => void;
  size: number;
  onSize: (s: number) => void;
  onPicture: (file: File) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  selectedCount: number;
  onDeleteSelected: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const colors = tool === "highlighter" ? HIGHLIGHT_COLORS : PEN_COLORS;

  return (
    // One row that never changes height (it scrolls sideways on narrow screens),
    // so picking a tool doesn't move the page under your pen.
    <div
      role="toolbar"
      aria-label="Drawing"
      className="mt-1 flex h-10 flex-nowrap items-center gap-0.5 overflow-x-auto border-t border-(--paper-line) pt-1 [scrollbar-width:none]"
    >
      <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-black/[0.04] p-0.5">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <Btn key={id} label={label} active={tool === id} onClick={() => onTool(id)}>
            <Icon className="size-4" />
          </Btn>
        ))}
      </div>

      {(tool === "pen" || tool === "highlighter") && (
        <div className="ml-1 flex shrink-0 items-center gap-1">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              title="Colour"
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              onClick={() => onColor(c)}
              className={cn(
                "size-6 shrink-0 rounded-full border border-black/15 transition",
                color === c && "ring-2 ring-primary ring-offset-1 ring-offset-(--paper-fill)",
              )}
              style={{ background: c }}
            />
          ))}
          {tool === "pen" &&
            PEN_SIZES.map((s) => (
              <Btn key={s} label={`Thickness ${s}`} active={size === s} onClick={() => onSize(s)}>
                <span className="rounded-full bg-(--paper-ink)" style={{ width: s + 3, height: s + 3 }} />
              </Btn>
            ))}
        </div>
      )}

      {tool === "select" && selectedCount > 0 && (
        <Btn label={`Delete ${selectedCount} selected`} onClick={onDeleteSelected}>
          <Trash2 className="size-4 text-[#c4312f]" />
        </Btn>
      )}

      <span aria-hidden className="mx-1 h-5 w-px bg-(--paper-line)" />
      <Btn label="Add a picture (or paste a screenshot with Ctrl+V)" onClick={() => fileInput.current?.click()}>
        <ImagePlus className="size-4" />
      </Btn>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPicture(f);
          e.target.value = "";
        }}
      />
      <Btn label="Undo drawing" disabled={!canUndo} onClick={onUndo}>
        <Undo2 className="size-4" />
      </Btn>
      <Btn label="Redo drawing" disabled={!canRedo} onClick={onRedo}>
        <Redo2 className="size-4" />
      </Btn>

      {tool !== "type" && (
        <span className="ml-auto hidden shrink-0 px-1 text-xs whitespace-nowrap text-(--paper-soft) lg:inline">
          {tool === "select" ? "Drag to move · Delete to remove" : "Pick Type to write or scroll"}
        </span>
      )}
    </div>
  );
}
