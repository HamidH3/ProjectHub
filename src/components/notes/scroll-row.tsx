"use client";

// A row of toolbar buttons that never wraps or changes height. When there
// isn't room for all of them (a narrow window or a phone), small arrow buttons
// appear at the ends, the edges fade, and the mouse wheel scrolls it sideways,
// like the toolbars in Office apps. Tabbing to a hidden button also scrolls it
// into view.
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ScrollRow({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const left = el.scrollLeft > 2;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
    };
    // Turn the mouse wheel into sideways scrolling while over the row.
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(measure); // buttons appear and disappear with the tool
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener("scroll", measure, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("scroll", measure);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const nudge = (dir: -1 | 1) => row.current?.scrollBy({ left: dir * 180, behavior: "smooth" });

  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <div
        ref={row}
        role="group"
        aria-label={label}
        className="flex h-9 items-center gap-0.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {more.left && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          title="Show more tools"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => nudge(-1)}
          className="absolute inset-y-0 left-0 flex w-9 items-center justify-start bg-linear-to-r from-(--paper-fill) from-55% to-transparent pl-0.5 text-(--paper-soft) hover:text-(--paper-ink)"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}
      {more.right && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          title="Show more tools"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => nudge(1)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-end bg-linear-to-l from-(--paper-fill) from-55% to-transparent pr-0.5 text-(--paper-soft) hover:text-(--paper-ink)"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
}
