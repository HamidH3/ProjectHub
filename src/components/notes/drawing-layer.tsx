"use client";

// The see-through layer over a note's text where you draw and place pictures,
// like OneNote. With the "Type" tool it lets clicks through to the text; with
// the other tools it takes the pen, mouse or finger.
//
//   Pen / Highlighter  draw
//   Eraser             touch a stroke to remove it
//   Select             click to pick something, drag to move it, drag on an
//                      empty spot to pick everything in a box; Delete removes;
//                      drag a picture's corner to resize it
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DRAW_WIDTH,
  boundsOf,
  boxFrom,
  itemAt,
  itemsInBox,
  moveItems,
  resizePicture,
  simplify,
  strokePath,
  type Box,
  type DrawItem,
  type Drawing,
  type Picture,
  type Point,
  type Stroke,
} from "@/lib/drawing";

export type DrawTool = "type" | "pen" | "highlighter" | "eraser" | "select";

type Gesture =
  | { kind: "stroke"; stroke: Stroke }
  | { kind: "erase" }
  | { kind: "move"; from: Point; dx: number; dy: number }
  | { kind: "box"; from: Point; to: Point }
  | { kind: "resize"; id: string; startWidth: number; width: number; startX: number };

// Signed links to the pictures (the bucket is private), refreshed every hour.
function usePictureLinks(paths: string[], local: Record<string, string>) {
  const supabase = useMemo(() => createClient(), []);
  const [links, setLinks] = useState<Record<string, string>>({});
  const key = paths.join("|");
  useEffect(() => {
    const wanted = key ? key.split("|") : [];
    const missing = wanted.filter((p) => !links[p] && !local[p]);
    if (missing.length === 0) return;
    let cancelled = false;
    void supabase.storage
      .from("project-files")
      .createSignedUrls(missing, 3600)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setLinks((all) => {
          const next = { ...all };
          for (const d of data) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [key, links, local, supabase]);
  return (path: string) => local[path] ?? links[path];
}

export function DrawingLayer({
  drawing,
  onChange,
  tool = "type",
  color = "#141414",
  size = 4,
  selected = [],
  onSelect,
  localPictures = {},
}: {
  drawing: Drawing;
  onChange?: (next: Drawing) => void; // missing = read only
  tool?: DrawTool;
  color?: string;
  size?: number;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  localPictures?: Record<string, string>; // just-added pictures, shown before upload finishes
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const readOnly = !onChange;
  const active = !readOnly && tool !== "type";

  const items = drawing.items;
  const pictures = items.filter((i): i is Picture => i.kind === "image").map((i) => i.path);
  const linkFor = usePictureLinks(pictures, localPictures);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Page units ↔ screen pixels: the page is always DRAW_WIDTH units across.
  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / DRAW_WIDTH || 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function at(e: React.PointerEvent): Point {
    const r = layer.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  }
  function update(g: Gesture | null) {
    gestureRef.current = g;
    setGesture(g);
  }
  function erase(p: Point) {
    const hit = itemAt(items.filter((i) => i.kind !== "image"), p[0], p[1], 8);
    if (hit) onChange?.({ ...drawing, items: items.filter((i) => i.id !== hit.id) });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!active || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    if (tool === "pen" || tool === "highlighter") {
      update({
        kind: "stroke",
        stroke: { id: crypto.randomUUID(), kind: tool, color, size, points: [p] },
      });
    } else if (tool === "eraser") {
      update({ kind: "erase" });
      erase(p);
    } else if (tool === "select") {
      const hit = itemAt(items, p[0], p[1], 6 / scale);
      if (hit) {
        const next = selectedSet.has(hit.id) ? selected : e.shiftKey ? [...selected, hit.id] : [hit.id];
        onSelect?.(next);
        update({ kind: "move", from: p, dx: 0, dy: 0 });
      } else {
        onSelect?.([]);
        update({ kind: "box", from: p, to: p });
      }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gestureRef.current;
    if (!g) return;
    // Use every point the pen reported since the last frame, for smooth lines.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    if (g.kind === "stroke") {
      const r = layer.current!.getBoundingClientRect();
      const added = events.map((ev) => [(ev.clientX - r.left) / scale, (ev.clientY - r.top) / scale] as Point);
      update({ ...g, stroke: { ...g.stroke, points: [...g.stroke.points, ...added] } });
    } else if (g.kind === "erase") {
      erase(at(e));
    } else if (g.kind === "move") {
      const p = at(e);
      update({ ...g, dx: p[0] - g.from[0], dy: p[1] - g.from[1] });
    } else if (g.kind === "box") {
      update({ ...g, to: at(e) });
    } else if (g.kind === "resize") {
      update({ ...g, width: g.startWidth + (at(e)[0] - g.startX) });
    }
  }

  function onPointerUp() {
    const g = gestureRef.current;
    update(null);
    if (!g || !onChange) return;
    if (g.kind === "stroke") {
      onChange({ ...drawing, items: [...items, { ...g.stroke, points: simplify(g.stroke.points) }] });
    } else if (g.kind === "move" && (Math.abs(g.dx) > 0.5 || Math.abs(g.dy) > 0.5)) {
      onChange({ ...drawing, items: moveItems(items, selectedSet, g.dx, g.dy) });
    } else if (g.kind === "box") {
      onSelect?.(itemsInBox(items, boxFrom(g.from, g.to)));
    }
  }

  function startResize(e: React.PointerEvent, pic: Picture) {
    e.stopPropagation();
    e.preventDefault();
    layer.current?.setPointerCapture(e.pointerId);
    update({ kind: "resize", id: pic.id, startWidth: pic.w, width: pic.w, startX: at(e)[0] });
  }
  // Resizing ends on the layer's pointerup; apply the new size there.
  function onResizeEnd() {
    const g = gestureRef.current;
    if (g?.kind !== "resize" || !onChange) return onPointerUp();
    update(null);
    onChange({
      ...drawing,
      items: items.map((i) => (i.id === g.id && i.kind === "image" ? resizePicture(i, g.width) : i)),
    });
  }

  // What to draw right now, including a move or resize in progress.
  let shown: DrawItem[] = items;
  if (gesture?.kind === "move") shown = moveItems(items, selectedSet, gesture.dx, gesture.dy);
  if (gesture?.kind === "resize") {
    shown = items.map((i) => (i.id === gesture.id && i.kind === "image" ? resizePicture(i, gesture.width) : i));
  }
  if (gesture?.kind === "stroke") shown = [...items, gesture.stroke];

  const box: Box | null = gesture?.kind === "box" ? boxFrom(gesture.from, gesture.to) : null;
  const onlyPicture =
    selected.length === 1 ? shown.find((i): i is Picture => i.id === selected[0] && i.kind === "image") : undefined;
  const cursor = { pen: "crosshair", highlighter: "crosshair", eraser: "cell", select: "default", type: "auto" }[tool];

  return (
    <div
      ref={layer}
      aria-hidden={items.length === 0}
      className="absolute inset-0 z-[5]"
      style={{
        pointerEvents: active ? "auto" : "none",
        // While drawing, a finger draws instead of scrolling the page.
        touchAction: active ? "none" : "auto",
        cursor,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onResizeEnd}
      onPointerCancel={() => update(null)}
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label="Drawing on this note">
        <g transform={`scale(${scale})`}>
          {shown.map((it) =>
            it.kind === "image" ? (
              linkFor(it.path) ? (
                <image key={it.id} href={linkFor(it.path)} x={it.x} y={it.y} width={it.w} height={it.h} preserveAspectRatio="none" />
              ) : (
                <rect key={it.id} x={it.x} y={it.y} width={it.w} height={it.h} rx={6} fill="#e6e6e1" />
              )
            ) : (
              <path
                key={it.id}
                d={strokePath(it.points)}
                fill="none"
                stroke={it.color}
                strokeWidth={it.size}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={it.kind === "highlighter" ? 0.4 : 1}
                style={it.kind === "highlighter" ? { mixBlendMode: "multiply" } : undefined}
              />
            ),
          )}

          {/* Outlines around what's selected */}
          {!readOnly &&
            shown
              .filter((it) => selectedSet.has(it.id))
              .map((it) => {
                const b = boundsOf(it);
                return (
                  <rect
                    key={`sel-${it.id}`}
                    x={b.x - 4}
                    y={b.y - 4}
                    width={b.w + 8}
                    height={b.h + 8}
                    fill="rgb(26 95 180 / 0.06)"
                    stroke="#1a5fb4"
                    strokeWidth={1.5 / scale}
                    strokeDasharray={`${5 / scale} ${4 / scale}`}
                  />
                );
              })}

          {box && (
            <rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              fill="rgb(26 95 180 / 0.08)"
              stroke="#1a5fb4"
              strokeWidth={1 / scale}
            />
          )}
        </g>
      </svg>

      {/* Drag this corner to resize the one selected picture. */}
      {onlyPicture && tool === "select" && (
        <span
          role="presentation"
          title="Drag to resize"
          onPointerDown={(e) => startResize(e, onlyPicture)}
          className="absolute size-4 cursor-nwse-resize rounded-sm border-2 border-white bg-[#1a5fb4] shadow"
          style={{
            left: (onlyPicture.x + onlyPicture.w) * scale - 6,
            top: (onlyPicture.y + onlyPicture.h) * scale - 6,
            touchAction: "none",
          }}
        />
      )}
    </div>
  );
}
