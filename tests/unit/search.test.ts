// Search results: where they lead, and highlighting without HTML.
import { describe, expect, it } from "vitest";
import { hrefFor, splitHighlights } from "@/lib/search";

const base = { id: "n1", project_id: "p1", detail: null, folder_id: null };

describe("search", () => {
  it("opens the right page for each kind of result", () => {
    expect(hrefFor({ ...base, kind: "project", id: "p1" })).toBe("/projects/p1");
    expect(hrefFor({ ...base, kind: "note" })).toBe("/projects/p1/notes/n1");
    expect(hrefFor({ ...base, kind: "task" })).toBe("/projects/p1/tasks");
    expect(hrefFor({ ...base, kind: "meeting", detail: "2026-12-03" })).toBe("/projects/p1/calendar?month=2026-12");
    expect(hrefFor({ ...base, kind: "file", folder_id: "f9" })).toBe("/projects/p1/files?folder=f9");
    expect(hrefFor({ ...base, kind: "file" })).toBe("/projects/p1/files");
  });

  it("splits out the matching words", () => {
    expect(splitHighlights("the ⟦budget⟧ and ⟦plan⟧")).toEqual([
      { text: "the ", match: false },
      { text: "budget", match: true },
      { text: " and ", match: false },
      { text: "plan", match: true },
    ]);
  });

  it("keeps markup as plain text", () => {
    const parts = splitHighlights("<img src=x onerror=alert(1)> ⟦hi⟧");
    expect(parts[0]).toEqual({ text: "<img src=x onerror=alert(1)> ", match: false });
  });
});
