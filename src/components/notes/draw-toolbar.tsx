"use client";

// The second row of the note toolbar: choose Type (write text) or a drawing
// tool, a colour and thickness, add a picture, undo/redo, and (with Select)
// act on what's picked. Every button says its shortcut in its tooltip; the
// keyboard button lists them all.
import {
  BringToFront,
  Copy,
  Eraser,
  Highlighter,
  ImagePlus,
  Keyboard,
  MousePointer2,
  PenLine,
  Redo2,
  SendToBack,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useRef } from "react";
import { HIGHLIGHT_COLORS, PEN_COLORS, PEN_SIZES } from "@/lib/drawing";
import { cn } from "@/lib/utils";
import type { DrawTool } from "@/components/notes/drawing-layer";
import { MOD } from "@/components/notes/drawing-help";
import { ScrollRow } from "@/components/notes/scroll-row";

const TOOLS: { id: DrawTool; label: string; key: string; icon: typeof Type }[] = [
  { id: "type", label: "Type text", key: "T", icon: Type },
  { id: "pen", label: "Pen", key: "P", icon: PenLine },
  { id: "highlighter", label: "Highlighter", key: "H", icon: Highlighter },
  { id: "eraser", label: "Eraser", key: "E", icon: Eraser },
  { id: "select", label: "Select and move", key: "S", icon: MousePointer2 },
];

const COLOUR_NAMES: Record<string, string> = {
  "#141414": "Black",
  "#1a5fb4": "Blue",
  "#c4312f": "Red",
  "#1f8a5f": "Green",
  "#d97757": "Orange",
  "#7719aa": "Purple",
  "#f7e05a": "Yellow",
  "#8ee28e": "Green",
  "#ff9ecb": "Pink",
  "#86d0ff": "Blue",
};
const SIZE_NAMES: Record<number, string> = { 2: "Thin", 4: "Medium", 8: "Thick" };

function Btn({
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-keyshortcuts={shortcut?.replace("Ctrl", "Control").replace("⌘", "Meta").replace(/ /g, "+")}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the text cursor where it was
      onClick={onClick}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-(--paper-soft) outline-none transition hover:bg-black/[0.07] hover:text-(--paper-ink) focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35",
        pressed && "bg-white text-primary shadow-sm ring-1 ring-(--paper-line)",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-(--paper-line)" />;

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
  onDuplicate,
  onFront,
  onBack,
  onHelp,
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
  onDuplicate: () => void;
  onFront: () => void;
  onBack: () => void;
  onHelp: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const colors = tool === "highlighter" ? HIGHLIGHT_COLORS : PEN_COLORS;

  return (
    <div className="mt-1 flex items-center gap-1 border-t border-(--paper-line) pt-1">
      <ScrollRow label="Drawing tools">
        <div role="group" aria-label="Tool" className="flex shrink-0 items-center gap-0.5 rounded-lg bg-black/[0.04] p-0.5">
          {TOOLS.map(({ id, label, key, icon: Icon }) => (
            <Btn key={id} label={label} shortcut={key} pressed={tool === id} onClick={() => onTool(id)}>
              <Icon className="size-4" />
            </Btn>
          ))}
        </div>

        {(tool === "pen" || tool === "highlighter") && (
          <>
            <Divider />
            <div role="radiogroup" aria-label="Colour" className="flex shrink-0 items-center gap-1">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={COLOUR_NAMES[c] ?? c}
                  title={COLOUR_NAMES[c] ?? c}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onColor(c)}
                  className={cn(
                    "size-6 shrink-0 rounded-full border border-black/15 outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
                    color === c && "ring-2 ring-primary ring-offset-1 ring-offset-(--paper-fill)",
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
            {tool === "pen" && (
              <div role="group" aria-label="Thickness" className="ml-1 flex shrink-0 items-center gap-0.5">
                {PEN_SIZES.map((s) => (
                  <Btn key={s} label={`${SIZE_NAMES[s]} line`} pressed={size === s} onClick={() => onSize(s)}>
                    <span aria-hidden className="rounded-full bg-(--paper-ink)" style={{ width: s + 3, height: s + 3 }} />
                  </Btn>
                ))}
              </div>
            )}
          </>
        )}

        {tool === "select" && selectedCount > 0 && (
          <>
            <Divider />
            <Btn label="Duplicate" shortcut={`${MOD} D`} onClick={onDuplicate}>
              <Copy className="size-4" />
            </Btn>
            <Btn label="Bring to front" shortcut="]" onClick={onFront}>
              <BringToFront className="size-4" />
            </Btn>
            <Btn label="Send to back" shortcut="[" onClick={onBack}>
              <SendToBack className="size-4" />
            </Btn>
            <Btn label={`Delete ${selectedCount === 1 ? "it" : `${selectedCount} items`}`} shortcut="Delete" onClick={onDeleteSelected}>
              <Trash2 className="size-4 text-[#c4312f]" />
            </Btn>
          </>
        )}

        <Divider />
        <Btn label="Add a picture (or paste a screenshot)" shortcut={`${MOD} V`} onClick={() => fileInput.current?.click()}>
          <ImagePlus className="size-4" />
        </Btn>
        <Btn label="Undo drawing" disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="size-4" />
        </Btn>
        <Btn label="Redo drawing" disabled={!canRedo} onClick={onRedo}>
          <Redo2 className="size-4" />
        </Btn>
      </ScrollRow>

      {/* Always visible, outside the scrolling part. */}
      <Btn label="Keyboard shortcuts" shortcut="?" onClick={onHelp}>
        <Keyboard className="size-4" />
      </Btn>

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPicture(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
