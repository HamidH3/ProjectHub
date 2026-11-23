"use client";

// Pictures inside a note's text (pasted screenshots, dropped or added
// pictures). They sit in the text like in Word: the writing carries on below
// them, and they keep their shape and place whatever the window size.
//
//   click          picks it (blue outline)
//   drag it        moves it to another place in the text
//   corner handle  resizes it (keeps its shape)
//   Delete         removes it (or the bin button)
//
// The picture itself is in the project's private storage; the note only keeps
// its path, its width (share of the page) and its shape (height ÷ width).
import { useEffect, useRef, useState } from "react";
import { Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes, type NodeViewProps } from "@tiptap/react";
import { ImageOff, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clampPictureRatio, clampPictureWidth, isNotePicturePath } from "@/lib/page-scale";

// ---------------------------------------------------------------------------
// Links to the pictures. The bucket is private, so each picture needs a signed
// link (valid for an hour). Pictures that appear together are asked for in one
// request, and links are reused while they're fresh.
// ---------------------------------------------------------------------------
const LINK_SECONDS = 3600;
const REUSE_MS = 50 * 60 * 1000;
const previews = new Map<string, string>(); // just-pasted pictures, shown before the upload finishes
const links = new Map<string, { url: string | null; at: number }>();
const waiting = new Map<string, ((url: string | null) => void)[]>();
let batch: ReturnType<typeof setTimeout> | null = null;

export function rememberPreview(path: string, url: string) {
  previews.set(path, url);
}

function knownLink(path: string): string | null | undefined {
  const preview = previews.get(path);
  if (preview) return preview;
  const hit = links.get(path);
  if (hit && Date.now() - hit.at < REUSE_MS) return hit.url;
  return undefined;
}

function askForLink(path: string): Promise<string | null> {
  return new Promise((resolve) => {
    waiting.set(path, [...(waiting.get(path) ?? []), resolve]);
    if (batch) return;
    batch = setTimeout(async () => {
      batch = null;
      const paths = [...waiting.keys()];
      const callbacks = new Map(waiting);
      waiting.clear();
      const { data } = await createClient().storage.from("project-files").createSignedUrls(paths, LINK_SECONDS);
      const found = new Map((data ?? []).map((d) => [d.path, d.signedUrl || null]));
      for (const p of paths) {
        const url = found.get(p) ?? null;
        links.set(p, { url, at: Date.now() });
        for (const done of callbacks.get(p) ?? []) done(url);
      }
    }, 10);
  });
}

function usePictureLink(path: string) {
  const [state, setState] = useState<{ path: string; url: string | null | undefined }>(() => ({
    path,
    url: knownLink(path),
  }));
  const url = state.path === path ? state.url : knownLink(path);
  useEffect(() => {
    if (url !== undefined) return;
    let live = true;
    void askForLink(path).then((u) => {
      if (live) setState({ path, url: u });
    });
    return () => {
      live = false;
    };
  }, [path, url]);
  return url; // undefined = loading, null = not available
}

// ---------------------------------------------------------------------------
// How a picture looks in the note.
// ---------------------------------------------------------------------------
function PictureView({ node, updateAttributes, deleteNode, selected, editor }: NodeViewProps) {
  const path = String(node.attrs.path);
  const width = clampPictureWidth(node.attrs.width);
  const ratio = clampPictureRatio(node.attrs.ratio);
  const url = usePictureLink(path);
  const editable = editor.isEditable;
  const box = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState<number | null>(null);
  const shown = resizing ?? width;

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const page = box.current?.parentElement?.closest(".note-content") as HTMLElement | null;
    const pageWidth = page?.clientWidth || 1;
    const startX = e.clientX;
    const start = width;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let latest = start;
    const move = (ev: PointerEvent) => {
      latest = clampPictureWidth(start + (ev.clientX - startX) / pageWidth);
      setResizing(latest);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      setResizing(null);
      if (latest !== start) updateAttributes({ width: latest });
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  return (
    <NodeViewWrapper className="note-picture" data-selected={selected && editable ? "" : undefined}>
      <div
        ref={box}
        data-drag-handle={editable ? "" : undefined}
        draggable={editable}
        className="relative max-w-full"
        style={{ width: `${shown * 100}%` }}
        title={editable ? "Click to pick, drag to move" : undefined}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived links
          <img
            src={url}
            alt="Picture"
            draggable={false}
            className="block h-auto w-full rounded-md"
            style={ratio ? { aspectRatio: `${1 / ratio}` } : undefined}
          />
        ) : (
          <div
            className="flex w-full items-center justify-center gap-2 rounded-md bg-black/[0.05] text-xs text-(--paper-soft)"
            style={{ aspectRatio: ratio ? `${1 / ratio}` : "3 / 2" }}
          >
            {url === null && (
              <>
                <ImageOff className="size-4" /> Picture not available
              </>
            )}
          </div>
        )}
        {editable && selected && (
          <>
            <button
              type="button"
              aria-label="Delete picture"
              title="Delete picture"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => deleteNode()}
              className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-md bg-white/95 text-[#c4312f] shadow hover:bg-white"
            >
              <Trash2 className="size-4" />
            </button>
            <span
              role="presentation"
              title="Drag to resize"
              data-picture-resize=""
              onPointerDown={startResize}
              className="absolute -bottom-1.5 -right-1.5 size-4 cursor-nwse-resize rounded-sm border-2 border-white bg-[#1a5fb4] shadow"
              style={{ touchAction: "none" }}
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const NotePicture = Node.create({
  name: "picture",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      path: { default: null },
      width: { default: 0.5 },
      ratio: { default: null },
    };
  },

  // Only our own pictures are kept when pasting (never pictures from other
  // websites, which would load from outside).
  parseHTML() {
    return [
      {
        tag: "img[data-note-picture]",
        getAttrs: (el) => {
          const path = (el as HTMLElement).getAttribute("data-path");
          if (!isNotePicturePath(path)) return false;
          return {
            path,
            width: clampPictureWidth(Number((el as HTMLElement).getAttribute("data-width"))),
            ratio: clampPictureRatio(Number((el as HTMLElement).getAttribute("data-ratio"))),
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(
        { alt: "Picture" },
        {
          "data-note-picture": "",
          "data-path": isNotePicturePath(node.attrs.path) ? node.attrs.path : "",
          "data-width": String(clampPictureWidth(node.attrs.width)),
          "data-ratio": String(clampPictureRatio(node.attrs.ratio) ?? ""),
          style: `width:${clampPictureWidth(node.attrs.width) * 100}%`,
        },
        HTMLAttributes.class ? { class: HTMLAttributes.class } : {},
      ),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PictureView);
  },
});
