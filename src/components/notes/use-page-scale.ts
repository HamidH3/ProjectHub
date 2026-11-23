"use client";

// Watches a note page's width. Drawings are placed in "page units" (the page
// is always DRAW_WIDTH units across) and the text size follows the width too
// (lib/page-scale.ts), so everything keeps its place when the window changes.
import { useEffect, useState } from "react";
import { DRAW_WIDTH } from "@/lib/drawing";
import { BASE_FONT_PX, pageFontPx } from "@/lib/page-scale";

export function usePageScale(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return {
    drawScale: width ? width / DRAW_WIDTH : 1,
    fontPx: width ? pageFontPx(width) : BASE_FONT_PX,
  };
}
