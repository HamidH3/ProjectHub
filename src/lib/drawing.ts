// Drawing on notes: pen and highlighter strokes, and pictures, placed on the
// page. Pure helpers, safe anywhere (unit-tested in tests/unit/drawing.test.ts).
//
// Positions are in "page units": the page is always DRAW_WIDTH units across,
// whatever the screen size, so a drawing lines up on a phone and on a PC.

export const DRAW_WIDTH = 800;
const MAX_ITEMS = 5000;
const MAX_POINTS = 4000; // per stroke

export type Point = [x: number, y: number];

export type Stroke = {
  id: string;
  kind: "pen" | "highlighter";
  color: string;
  size: number; // line width in page units
  points: Point[];
};

export type Picture = {
  id: string;
  kind: "image";
  path: string; // in the project-files bucket
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DrawItem = Stroke | Picture;
export type Drawing = { v: 1; items: DrawItem[] };
export type Box = { x: number; y: number; w: number; h: number };

export const EMPTY_DRAWING: Drawing = { v: 1, items: [] };

export const PEN_COLORS = ["#141414", "#1a5fb4", "#c4312f", "#1f8a5f", "#d97757", "#7719aa"] as const;
export const HIGHLIGHT_COLORS = ["#f7e05a", "#8ee28e", "#ff9ecb", "#86d0ff"] as const;
export const PEN_SIZES = [2, 4, 8] as const;
export const HIGHLIGHT_SIZE = 18;

const COLOR = /^#[0-9a-f]{6}$/i;
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 10) / 10;

// Reads a saved drawing, dropping anything that isn't a valid stroke or picture.
export function parseDrawing(raw: unknown): Drawing {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { items?: unknown }).items)) return EMPTY_DRAWING;
  const items: DrawItem[] = [];
  for (const it of (raw as { items: unknown[] }).items.slice(0, MAX_ITEMS)) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (typeof o.id !== "string") continue;
    if ((o.kind === "pen" || o.kind === "highlighter") && Array.isArray(o.points)) {
      const points = o.points
        .filter((p): p is Point => Array.isArray(p) && num(p[0]) && num(p[1]))
        .slice(0, MAX_POINTS)
        .map(([x, y]) => [x, y] as Point);
      if (points.length === 0 || typeof o.color !== "string" || !COLOR.test(o.color) || !num(o.size)) continue;
      items.push({ id: o.id, kind: o.kind, color: o.color, size: clamp(o.size as number, 1, 40), points });
    } else if (o.kind === "image" && typeof o.path === "string" && [o.x, o.y, o.w, o.h].every(num)) {
      if ((o.w as number) <= 0 || (o.h as number) <= 0) continue;
      items.push({ id: o.id, kind: "image", path: o.path, x: o.x as number, y: o.y as number, w: o.w as number, h: o.h as number });
    }
  }
  return { v: 1, items };
}

// Drops points closer together than `minGap` (keeps saved notes small) and
// rounds to one decimal place.
export function simplify(points: Point[], minGap = 1.2): Point[] {
  if (points.length === 0) return [];
  const out: Point[] = [[round(points[0][0]), round(points[0][1])]];
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    const [px, py] = out[out.length - 1];
    if (Math.hypot(x - px, y - py) >= minGap || i === points.length - 1) out.push([round(x), round(y)]);
  }
  return out.slice(0, MAX_POINTS);
}

// A smooth SVG path through the points (curves between midpoints).
export function strokePath(points: Point[]): string {
  if (points.length === 0) return "";
  const [x0, y0] = points[0];
  if (points.length === 1) return `M${x0} ${y0}L${x0 + 0.1} ${y0}`;
  if (points.length === 2) return `M${x0} ${y0}L${points[1][0]} ${points[1][1]}`;
  let d = `M${x0} ${y0}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += `Q${x} ${y} ${round((x + nx) / 2)} ${round((y + ny) / 2)}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d}L${lx} ${ly}`;
}

function distanceToSegment(px: number, py: number, [ax, ay]: Point, [bx, by]: Point) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Is (x, y) on this item? `slack` is extra room in page units (fingers are big).
export function hits(item: DrawItem, x: number, y: number, slack = 6): boolean {
  if (item.kind === "image") {
    return x >= item.x - slack && x <= item.x + item.w + slack && y >= item.y - slack && y <= item.y + item.h + slack;
  }
  const reach = item.size / 2 + slack;
  const pts = item.points;
  if (pts.length === 1) return Math.hypot(x - pts[0][0], y - pts[0][1]) <= reach;
  for (let i = 1; i < pts.length; i++) if (distanceToSegment(x, y, pts[i - 1], pts[i]) <= reach) return true;
  return false;
}

// The top-most item under (x, y), if any (later items are drawn on top).
export function itemAt(items: DrawItem[], x: number, y: number, slack = 6): DrawItem | undefined {
  for (let i = items.length - 1; i >= 0; i--) if (hits(items[i], x, y, slack)) return items[i];
  return undefined;
}

export function boundsOf(item: DrawItem): Box {
  if (item.kind === "image") return { x: item.x, y: item.y, w: item.w, h: item.h };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of item.points) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const pad = item.size / 2;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + item.size, h: maxY - minY + item.size };
}

// A rectangle from two corners, in any order.
export function boxFrom(a: Point, b: Point): Box {
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}

// Items that touch the box (for drag-to-select).
export function itemsInBox(items: DrawItem[], box: Box): string[] {
  return items
    .filter((it) => {
      const b = boundsOf(it);
      return b.x <= box.x + box.w && b.x + b.w >= box.x && b.y <= box.y + box.h && b.y + b.h >= box.y;
    })
    .map((it) => it.id);
}

export function moveItems(items: DrawItem[], ids: Set<string>, dx: number, dy: number): DrawItem[] {
  if (dx === 0 && dy === 0) return items;
  return items.map((it) => {
    if (!ids.has(it.id)) return it;
    if (it.kind === "image") return { ...it, x: round(it.x + dx), y: round(it.y + dy) };
    return { ...it, points: it.points.map(([x, y]) => [round(x + dx), round(y + dy)] as Point) };
  });
}

// Resizes a picture from its bottom-right corner, keeping its shape.
export function resizePicture(pic: Picture, newWidth: number): Picture {
  const w = clamp(round(newWidth), 24, DRAW_WIDTH * 2);
  return { ...pic, w, h: round((pic.h / pic.w) * w) };
}

// How far down the page the drawing reaches (so the page can grow to fit).
export function drawingBottom(items: DrawItem[]): number {
  return items.reduce((max, it) => {
    const b = boundsOf(it);
    return Math.max(max, b.y + b.h);
  }, 0);
}

// Where a new picture goes: near the top of what you can see, at most 600
// units wide (or its own size if smaller), keeping its shape.
export function placePicture(naturalW: number, naturalH: number, visibleTop: number): Box {
  const w = Math.min(600, Math.max(24, naturalW));
  const h = naturalW > 0 ? (naturalH / naturalW) * w : w;
  return { x: 40, y: Math.max(0, round(visibleTop + 40)), w: round(w), h: round(h) };
}
