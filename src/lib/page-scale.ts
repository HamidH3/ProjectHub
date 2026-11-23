// How a note's page is laid out, so nothing moves around when the window
// changes size. The text grows and shrinks with the page (like zooming a
// Word page) instead of re-wrapping, so pictures, drawings and the words next
// to them stay exactly where they were. On phones the text keeps its normal
// size and wraps, so it stays readable.

/** At this text-column width (the usual note page) the text is 16px. */
export const TEXT_BASE_WIDTH = 672;
export const BASE_FONT_PX = 16;
/** Pages narrower than this (phones) keep 16px text and let it wrap. */
export const PHONE_PAGE_WIDTH = 480;
/** How wide the page gets with Expand (the text grows with it, like zooming in). */
export const EXPANDED_PAGE = "max-w-[60rem]";

/** The note text's size (px) for a text column this wide. */
export function pageFontPx(width: number): number {
  if (!Number.isFinite(width) || width < PHONE_PAGE_WIDTH) return BASE_FONT_PX;
  return Math.round(((BASE_FONT_PX * width) / TEXT_BASE_WIDTH) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Pictures in the text. Their width is kept as a share of the page's width
// (0.08–1) and their shape as height ÷ width, so they look the same on every
// screen and keep their room while they load.
// ---------------------------------------------------------------------------
export const PICTURE_MIN_WIDTH = 0.08;
export const PICTURE_SIZES = { small: 0.25, medium: 0.5, large: 0.75, full: 1 } as const;

export function clampPictureWidth(width: unknown): number {
  const w = typeof width === "number" ? width : Number(width);
  if (!Number.isFinite(w)) return PICTURE_SIZES.medium;
  return Math.round(Math.min(1, Math.max(PICTURE_MIN_WIDTH, w)) * 1000) / 1000;
}

export function clampPictureRatio(ratio: unknown): number | null {
  const r = typeof ratio === "number" ? ratio : Number(ratio);
  if (!Number.isFinite(r) || r <= 0) return null;
  return Math.round(Math.min(20, Math.max(0.05, r)) * 10000) / 10000;
}

/** A new picture's width: its own on-screen size, but never wider than the page. */
export function firstPictureWidth(pictureCssWidth: number, pageWidth: number): number {
  if (!(pictureCssWidth > 0) || !(pageWidth > 0)) return PICTURE_SIZES.medium;
  return clampPictureWidth(pictureCssWidth / pageWidth);
}

/** Only pictures stored with notes ({project}/note-images/{note}/{id}.png|jpg). */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PICTURE_PATH = new RegExp(`^${UUID}/note-images/${UUID}/${UUID}\\.(png|jpg)$`);
export function isNotePicturePath(path: unknown): path is string {
  return typeof path === "string" && PICTURE_PATH.test(path);
}

// ---------------------------------------------------------------------------
// Double-click on the page to start typing there.
// ---------------------------------------------------------------------------
/** How far in a line starts, in em (half-em steps, 0–40). */
export const MAX_INDENT_EM = 40;
export function clampIndent(value: unknown): number {
  const v = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(MAX_INDENT_EM, Math.round(v * 2) / 2);
}
/** Indent for a click this many px from the text's left edge (none near the edge). */
export function indentFor(xPx: number, fontPx: number): number {
  if (!(fontPx > 0) || xPx < fontPx) return 0;
  return clampIndent(xPx / fontPx);
}

/** One empty line in a note: 1.75em of text plus 0.75em between paragraphs. */
export const LINE_EM = 2.5;
/** Empty lines to add so typing starts at a point this far below the text. */
export function linesToReach(gapPx: number, fontPx: number, max = 60): number {
  if (!(fontPx > 0) || !(gapPx > 0)) return 1;
  return Math.min(max, Math.max(1, Math.floor(gapPx / (LINE_EM * fontPx)) + 1));
}
