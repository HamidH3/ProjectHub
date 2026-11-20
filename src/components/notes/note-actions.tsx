"use client";

// The buttons above a note: Expand (hide the notes list and widen the page)
// and Download (PDF with drawings, Word, Markdown).
import { Download, FileDown, FileText, FileType, Maximize2, Minimize2, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotes } from "@/components/notes/notes-context";
import { exportFileName, noteToDocx, noteToMarkdown, type DocNode } from "@/lib/note-export";

const buttonClass =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground/90 outline-none transition hover:bg-(--hover) focus-visible:ring-2 focus-visible:ring-ring";

function save(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// PDF: opens just the note page (text, drawings and pictures) in a print
// window, where "Save as PDF" is one of the printers.
function printNote(article: HTMLElement, title: string) {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    toast.error("Your browser blocked the print window. Allow pop-ups for this site and try again.");
    return;
  }
  const width = article.getBoundingClientRect().width;
  const copy = article.cloneNode(true) as HTMLElement;
  // The title box is a text field: show its words instead.
  const titleField = article.querySelector("input");
  copy.querySelectorAll("input").forEach((input, i) => {
    const h = win.document.createElement("h1");
    h.textContent = i === 0 ? titleField?.value || title : (input as HTMLInputElement).value;
    h.className = "print-title";
    input.replaceWith(h);
  });
  copy.querySelectorAll("[data-print-hide]").forEach((el) => el.remove());
  copy.querySelectorAll("[contenteditable]").forEach((el) => el.setAttribute("contenteditable", "false"));

  const doc = win.document;
  doc.title = title || "Note";
  const root = document.documentElement;
  for (const attr of Array.from(root.attributes)) doc.documentElement.setAttribute(attr.name, attr.value);
  doc.head.innerHTML = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => el.outerHTML)
    .join("");
  const style = doc.createElement("style");
  // A4 with 14 mm margins is about 700 px wide: shrink wide pages to fit.
  const zoom = Math.min(1, 700 / Math.max(width, 1));
  style.textContent = `
    @page { size: A4; margin: 14mm; }
    html, body { background: #fff !important; margin: 0; color-scheme: light !important; }
    .print-root, .print-root * { min-height: 0 !important; }
    .print-root { width: ${Math.round(width)}px; zoom: ${zoom.toFixed(3)}; margin: 0 auto; }
    .print-root article { box-shadow: none !important; border: none !important; background: #fff !important; }
    .print-title { font-size: 1.75rem; font-weight: 600; margin: 0 0 1rem; color: inherit; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  `;
  doc.head.append(style);
  doc.body.innerHTML = "";
  const wrap = doc.createElement("div");
  wrap.className = "print-root";
  wrap.append(doc.importNode(copy, true));
  doc.body.append(wrap);

  // Print once the styles and pictures have loaded.
  const ready = () => {
    win.focus();
    win.print();
  };
  const images = Array.from(doc.images).filter((img) => !img.complete);
  const sheets = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
  let waiting = images.length + sheets.length;
  if (!waiting) setTimeout(ready, 300);
  const done = () => {
    waiting -= 1;
    if (waiting === 0) setTimeout(ready, 150);
  };
  images.forEach((img) => img.addEventListener("load", done, { once: true }));
  images.forEach((img) => img.addEventListener("error", done, { once: true }));
  sheets.forEach((link) => link.addEventListener("load", done, { once: true }));
  sheets.forEach((link) => link.addEventListener("error", done, { once: true }));
  setTimeout(() => waiting > 0 && ready(), 4000); // don't wait forever
}

export function NoteActions({
  title,
  content,
  hasDrawing,
  article,
}: {
  title: () => string;
  content: () => DocNode;
  hasDrawing: () => boolean;
  article: () => HTMLElement | null;
}) {
  const { expanded, toggleExpanded } = useNotes();

  return (
    <div className="flex items-center gap-1.5" data-print-hide>
      <button
        type="button"
        onClick={toggleExpanded}
        aria-pressed={expanded}
        className={`${buttonClass} hidden lg:inline-flex`}
        title={expanded ? "Show the notes list again" : "Hide the notes list and widen the page"}
      >
        {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        {expanded ? "Narrow" : "Expand"}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger className={buttonClass} aria-label="Download this note">
          <Download className="size-3.5" /> Download
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Download this note as</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => {
              const el = article();
              if (el) printNote(el, title());
            }}
          >
            <Printer className="size-4" /> PDF (print or save as PDF)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              save(
                exportFileName(title(), "docx"),
                noteToDocx(title(), content(), { hasDrawing: hasDrawing() }) as BlobPart,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              )
            }
          >
            <FileType className="size-4" /> Word (.docx)
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              save(exportFileName(title(), "md"), noteToMarkdown(title(), content(), { hasDrawing: hasDrawing() }), "text/markdown;charset=utf-8")
            }
          >
            <FileText className="size-4" /> Markdown (.md)
          </DropdownMenuItem>
          {hasDrawing() && (
            <DropdownMenuLabel className="max-w-64 text-xs font-normal text-muted-foreground">
              <FileDown className="mr-1 inline size-3" /> Drawings and pictures are only in the PDF.
            </DropdownMenuLabel>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
