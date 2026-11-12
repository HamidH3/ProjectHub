// Moving notes around the tree (drag and drop, "Move to…").
import { describe, expect, it } from "vitest";
import { applyPlacement, childrenOf, notesBy, otherWriters, planPlacement, type DropPosition, type NoteSummary } from "@/lib/note-tree";

const t = "2026-11-12T00:00:00Z";
const n = (id: string, parent: string | null, position: string): NoteSummary => ({
  id, parent_id: parent, title: id, preview: null, position, updated_at: t, created_at: t, created_by: "me",
});
// A, B (B1, B2 (B2a)), C
const notes = [n("A", null, "a0"), n("B", null, "a1"), n("B1", "B", "a0"), n("B2", "B", "a1"), n("B2a", "B2", "a0"), n("C", null, "a2")];
const order = (list: NoteSummary[], parent: string | null) => childrenOf(list, parent).map((x) => x.id).join(",");

function move(id: string, target: string, where: DropPosition, list = notes) {
  const plan = planPlacement(list, id, target, where);
  if ("error" in plan) return { error: plan.error, list, updates: [] };
  return { error: null, updates: plan.updates, list: applyPlacement(list, plan.updates) };
}

describe("planPlacement", () => {
  it("puts a note inside another", () => {
    const r = move("C", "B1", "inside");
    expect(order(r.list, "B1")).toBe("C");
    expect(order(r.list, null)).toBe("A,B");
  });

  it("takes a subpage out to the top level", () => {
    const r = move("B1", "A", "before");
    expect(order(r.list, null)).toBe("B1,A,B,C");
    expect(order(r.list, "B")).toBe("B2");
  });

  it("takes a note out two levels at once", () => {
    expect(order(move("B2a", "C", "after").list, null)).toBe("A,B,C,B2a");
  });

  it("reorders at the top level and inside a parent", () => {
    expect(order(move("A", "C", "after").list, null)).toBe("B,C,A");
    expect(order(move("B2", "B1", "before").list, "B")).toBe("B2,B1");
  });

  it("adds to the end when nesting into a note that already has subpages", () => {
    expect(order(move("C", "B2", "inside").list, "B2")).toBe("B2a,C");
  });

  it("refuses to put a note inside its own subpages", () => {
    expect(move("B", "B2a", "inside").error).toBeTruthy();
    expect(move("B", "B1", "after").error).toBeTruthy();
  });

  it("changes nothing when dropped where it already is", () => {
    expect(move("A", "B", "before").updates).toHaveLength(0);
    expect(move("B1", "B2", "before").updates).toHaveLength(0);
  });

  it("copes with older notes that all share the same position", () => {
    const flat = [n("X", null, "a0"), n("Y", null, "a0"), n("Z", null, "a0")].map((x, i) => ({ ...x, created_at: `2026-11-12T00:00:0${i}Z` }));
    expect(order(move("Z", "Y", "before", flat).list, null)).toBe("X,Z,Y");
  });
});

describe("everyone's own notes", () => {
  const by = (id: string, parent: string | null, writer: string | null) => ({ ...n(id, parent, "a0"), created_by: writer });
  const all = [by("M1", null, "me"), by("M2", "M1", "me"), by("S1", null, "sanna"), by("S2", "M1", "sanna"), by("Old", null, null)];

  it("splits notes by who wrote them", () => {
    expect(notesBy(all, "me").map((x) => x.id)).toEqual(["M1", "M2"]);
    expect(notesBy(all, null).map((x) => x.id)).toEqual(["Old"]);
  });

  it("shows a subpage at the top when its parent is someone else's", () => {
    const sanna = notesBy(all, "sanna");
    expect(childrenOf(sanna, null).map((x) => x.id)).toEqual(["S1", "S2"]);
    expect(all.find((x) => x.id === "S2")!.parent_id).toBe("M1"); // the original isn't changed
  });

  it("lists the other people by name, earlier notes last", () => {
    const names: Record<string, string> = { sanna: "Sanna" };
    expect(otherWriters(all, "me", (id) => names[id])).toEqual([
      { writer: "sanna", name: "Sanna's notes" },
      { writer: null, name: "Earlier notes" },
    ]);
  });
});
