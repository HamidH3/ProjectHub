import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { exportFileName, noteToDocx, noteToDocxFiles, noteToMarkdown, zip, type DocNode } from "@/lib/note-export";
import { noteListKey } from "@/lib/note-tree";

const doc: DocNode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Goals" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Ship " },
        { type: "text", text: "fast", marks: [{ type: "bold" }] },
        { type: "text", text: " & safe" },
      ],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
      ],
    },
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "done" }] }] },
      ],
    },
  ],
};

// Reads a "stored" zip back so we can check what's inside.
function unzip(bytes: Uint8Array): Record<string, string> {
  const buf = Buffer.from(bytes);
  const out: Record<string, string> = {};
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const size = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extra = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const start = i + 30 + nameLen + extra;
    const data = buf.subarray(start, start + size);
    out[name] = (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    i = start + size;
  }
  expect(buf.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBeGreaterThan(0);
  return out;
}

describe("exportFileName", () => {
  it("removes characters Windows won't allow", () => {
    expect(exportFileName('Plan: Q1/Q2 "final"?', "md")).toBe("Plan Q1 Q2 final.md");
    expect(exportFileName("", "docx")).toBe("Untitled.docx");
  });
});

describe("noteToMarkdown", () => {
  const md = noteToMarkdown("Launch plan", doc);
  it("puts the title first and moves headings down a level", () => {
    expect(md.startsWith("# Launch plan\n")).toBe(true);
    expect(md).toContain("## Goals");
  });
  it("keeps bold, lists and tick boxes", () => {
    expect(md).toContain("Ship **fast** & safe");
    expect(md).toContain("- one");
    expect(md).toContain("- two");
    expect(md).toContain("- [x] done");
  });
  it("says when a drawing was left out", () => {
    expect(noteToMarkdown("x", doc, { hasDrawing: true }).toLowerCase()).toContain("drawing");
  });
  it("copes with an empty note", () => {
    expect(noteToMarkdown("Empty", { type: "doc" })).toContain("# Empty");
  });
});

describe("noteToDocx", () => {
  it("has the parts Word needs", () => {
    const files = noteToDocxFiles("Launch plan", doc);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]),
    );
    expect(files["word/document.xml"]).toContain("Launch plan");
    expect(files["word/document.xml"]).toContain("&amp; safe");
  });
  it("makes a readable zip", () => {
    const files = unzip(noteToDocx("Launch plan", doc));
    expect(files["word/document.xml"]).toContain("Goals");
  });
  it("zip round-trips any text", () => {
    expect(unzip(zip({ "a.txt": "héllo", "b/c.txt": "" }))).toEqual({ "a.txt": "héllo", "b/c.txt": "" });
  });
});

describe("noteListKey", () => {
  const a = { id: "1", updated_at: "t1", title: "A", parent_id: null, position: "a", preview: "" };
  it("changes when a note changes, not when the order of the list does", () => {
    const b = { ...a, id: "2", title: "B" };
    expect(noteListKey([a, b])).toBe(noteListKey([b, a]));
    expect(noteListKey([a, b])).not.toBe(noteListKey([{ ...a, updated_at: "t2" }, b]));
    expect(noteListKey([a])).not.toBe(noteListKey([a, b]));
  });
});

describe("pictures in the text", () => {
  const withPicture: DocNode = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Before" }] },
      { type: "picture", attrs: { path: "x", width: 0.5, ratio: 0.6 } },
      { type: "paragraph", content: [{ type: "text", text: "After" }] },
    ],
  };
  it("Markdown marks where a picture was", () => {
    expect(noteToMarkdown("P", withPicture)).toMatch(/Before\n\n_\[Picture\]_\n\nAfter/);
  });
  it("Word marks where a picture was", () => {
    expect(noteToDocxFiles("P", withPicture)["word/document.xml"]).toContain("[Picture]");
  });
});
