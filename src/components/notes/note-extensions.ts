// The editor's building blocks (headings, lists, tick lists, tables, links),
// shared by the note editor and the read-only view of someone else's note.
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";

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
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder: readOnly ? "This note is empty." : "Start writing…" }),
  ];
}
