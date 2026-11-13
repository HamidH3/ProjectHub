// Drawing on notes: reading saved drawings, smoothing, hit-testing, moving.
import { describe, expect, it } from "vitest";
import {
  boundsOf,
  boxFrom,
  drawingBottom,
  itemAt,
  itemsInBox,
  moveItems,
  parseDrawing,
  placePicture,
  resizePicture,
  simplify,
  strokePath,
  type Picture,
  type Stroke,
} from "@/lib/drawing";

const line: Stroke = { id: "s1", kind: "pen", color: "#141414", size: 4, points: [[10, 10], [110, 10]] };
const pic: Picture = { id: "p1", kind: "image", path: "proj/note-images/n/a.png", x: 200, y: 200, w: 100, h: 50 };

describe("parseDrawing", () => {
  it("keeps valid strokes and pictures", () => {
    expect(parseDrawing({ v: 1, items: [line, pic] }).items).toHaveLength(2);
  });

  it("drops anything broken or unsafe", () => {
    const bad = [
      { ...line, color: "red; background:url(x)" }, // not a #rrggbb colour
      { ...line, points: [["a", 1]] },
      { ...pic, w: -5 },
      { kind: "script", id: "x" },
      null,
    ];
    expect(parseDrawing({ items: bad }).items).toHaveLength(0);
    expect(parseDrawing("nonsense").items).toEqual([]);
  });

  it("limits line widths", () => {
    expect((parseDrawing({ items: [{ ...line, size: 999 }] }).items[0] as Stroke).size).toBe(40);
  });
});

describe("strokes", () => {
  it("drops points that are almost on top of each other, keeping the ends", () => {
    const pts = simplify([[0, 0], [0.2, 0], [0.4, 0], [5, 0], [5.1, 0]]);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts.at(-1)).toEqual([5.1, 0]);
    expect(pts.length).toBeLessThan(5);
  });

  it("makes a path even from a single dot", () => {
    expect(strokePath([[5, 5]])).toMatch(/^M5 5L/);
    expect(strokePath([[0, 0], [10, 0], [20, 10]])).toContain("Q");
  });
});

describe("finding and moving things", () => {
  it("finds a stroke near the pointer, not far away", () => {
    expect(itemAt([line], 60, 13)?.id).toBe("s1");
    expect(itemAt([line], 60, 40)).toBeUndefined();
  });

  it("finds the top-most item first", () => {
    const over: Picture = { ...pic, id: "p2", x: 0, y: 0, w: 200, h: 50 };
    expect(itemAt([line, over], 60, 10)?.id).toBe("p2");
  });

  it("selects everything a dragged box touches", () => {
    expect(itemsInBox([line, pic], boxFrom([0, 0], [150, 30]))).toEqual(["s1"]);
    expect(itemsInBox([line, pic], boxFrom([400, 400], [0, 0]))).toEqual(["s1", "p1"]);
  });

  it("moves only the selected items", () => {
    const moved = moveItems([line, pic], new Set(["p1"]), 10, -5);
    expect(moved[0]).toBe(line);
    expect(moved[1]).toMatchObject({ x: 210, y: 195 });
  });

  it("resizes a picture without stretching it", () => {
    expect(resizePicture(pic, 300)).toMatchObject({ w: 300, h: 150 });
    expect(resizePicture(pic, 1).w).toBe(24);
  });

  it("knows how far down the page the drawing goes", () => {
    expect(drawingBottom([line, pic])).toBe(250);
    expect(boundsOf(line)).toEqual({ x: 8, y: 8, w: 104, h: 4 });
  });

  it("places a new picture near the top of the screen, at a sensible size", () => {
    expect(placePicture(1600, 800, 300)).toEqual({ x: 40, y: 340, w: 600, h: 300 });
    expect(placePicture(200, 100, 0)).toEqual({ x: 40, y: 40, w: 200, h: 100 });
  });
});
