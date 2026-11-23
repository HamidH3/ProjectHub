// The editor's building blocks (headings, lists, tick lists, tables, links,
// pictures), shared by the note editor and the read-only view of someone
// else's note.
import { Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { NotePicture } from "@/components/notes/note-picture";
import { clampIndent } from "@/lib/page-scale";

// A line can start further in (set by double-clicking on the page to type
// there). Kept in em, so it scales with the text.
const LineIndent = Extension.create({
  name: "lineIndent",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => clampIndent(Number(el.getAttribute("data-indent"))),
            renderHTML: (attrs) => {
              const indent = clampIndent(attrs.indent);
              return indent ? { "data-indent": String(indent), style: `margin-left:${indent}em` } : {};
            },
          },
        },
      },
    ];
  },
});

export function noteExtensions({ readOnly = false }: { readOnly?: boolean } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        // While editing, a click puts the cursor in the link; when reading, it opens it.
        openOnClick: readOnly,
        autolink: true,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto"],
        // Never allow links like javascript: or data:
        isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && !/^\s*(javascript|data|vbscript):/i.test(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
      // The line shown where a dragged picture will land.
      dropcursor: { color: "#1a5fb4", width: 2 },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder: readOnly ? "This note is empty." : "Start writing…" }),
    NotePicture,
    LineIndent,
  ];
}
