import { describe, expect, it } from "vitest";
import {
  BASE_FONT_PX,
  PHONE_PAGE_WIDTH,
  TEXT_BASE_WIDTH,
  clampIndent,
  clampPictureRatio,
  clampPictureWidth,
  firstPictureWidth,
  indentFor,
  isNotePicturePath,
  linesToReach,
  pageFontPx,
} from "@/lib/page-scale";

describe("pageFontPx: the text scales with the page instead of re-wrapping", () => {
  it("is 16px at the usual page width", () => {
    expect(pageFontPx(TEXT_BASE_WIDTH)).toBe(16);
  });
  it("grows and shrinks in step with the page", () => {
    expect(pageFontPx(TEXT_BASE_WIDTH * 1.25)).toBe(20);
    expect(pageFontPx(TEXT_BASE_WIDTH * 0.75)).toBe(12);
    // Same words per line at any width: font ÷ width stays the same.
    for (const w of [500, 600, 672, 800, 864]) expect(pageFontPx(w) / w).toBeCloseTo(16 / 672, 4);
  });
  it("stays at 16px on phones, and for odd values", () => {
    expect(pageFontPx(PHONE_PAGE_WIDTH - 1)).toBe(BASE_FONT_PX);
    expect(pageFontPx(320)).toBe(BASE_FONT_PX);
    expect(pageFontPx(Number.NaN)).toBe(BASE_FONT_PX);
  });
});

describe("pictures", () => {
  it("are kept between 8% and 100% of the page's width", () => {
    expect(clampPictureWidth(2)).toBe(1);
    expect(clampPictureWidth(0)).toBe(0.08);
    expect(clampPictureWidth("0.4")).toBe(0.4);
    expect(clampPictureWidth("junk")).toBe(0.5);
  });
  it("start at their own size, but never wider than the page", () => {
    expect(firstPictureWidth(336, 672)).toBe(0.5);
    expect(firstPictureWidth(3000, 672)).toBe(1);
    expect(firstPictureWidth(0, 672)).toBe(0.5);
  });
  it("keep a sensible shape", () => {
    expect(clampPictureRatio(0.5625)).toBe(0.5625);
    expect(clampPictureRatio(-1)).toBeNull();
    expect(clampPictureRatio("x")).toBeNull();
    expect(clampPictureRatio(1000)).toBe(20);
  });
  it("only load from the note's own picture folder", () => {
    const id = "b0000000-0000-4000-8000-0000000000a0";
    expect(isNotePicturePath(`${id}/note-images/${id}/${id}.png`)).toBe(true);
    expect(isNotePicturePath(`${id}/note-images/${id}/${id}.jpg`)).toBe(true);
    expect(isNotePicturePath(`${id}/${id}/report.pdf`)).toBe(false);
    expect(isNotePicturePath(`https://example.com/x.png`)).toBe(false);
    expect(isNotePicturePath(`../${id}/note-images/${id}/${id}.png`)).toBe(false);
    expect(isNotePicturePath(null)).toBe(false);
  });
});

describe("double-click to type", () => {
  it("starts the line where you clicked, in half-em steps", () => {
    expect(indentFor(160, 16)).toBe(10);
    expect(indentFor(170, 16)).toBe(10.5);
    expect(indentFor(8, 16)).toBe(0); // right at the edge: no indent
    expect(clampIndent(500)).toBe(40);
    expect(clampIndent("junk")).toBe(0);
  });
  it("adds enough empty lines to reach the click", () => {
    expect(linesToReach(10, 16)).toBe(1);
    expect(linesToReach(40 * 3 + 5, 16)).toBe(4);
    expect(linesToReach(1e6, 16)).toBe(60);
    expect(linesToReach(-5, 16)).toBe(1);
  });
});
