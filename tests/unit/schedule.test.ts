// The Tasks tab's day groups, the order of to-dos, and the checks on names and times.
import { describe, expect, it } from "vitest";
import { checkMeeting, checkTaskTitle, compareTasks, groupUpcoming, type Task } from "@/lib/schedule";

const today = "2026-11-12";
let i = 0;
const task = (title: string, extra: Partial<Task> = {}): Task => ({
  id: title, project_id: "p", title, description: null, scheduled_date: today, due_time: null, priority: null,
  completed_at: null, position: "a0", created_at: `2026-11-01T00:00:${String(i++).padStart(2, "0")}Z`, ...extra,
});

describe("groupUpcoming", () => {
  const tasks = [
    task("late", { scheduled_date: "2026-11-10" }),
    task("today"),
    task("tomorrow", { scheduled_date: "2026-11-13" }),
    task("next week", { scheduled_date: "2026-11-25" }),
    task("someday", { scheduled_date: null }),
    task("done", { completed_at: "2026-11-12T09:00:00Z" }),
  ];
  const groups = groupUpcoming(tasks, today);
  const titles = (key: string) => groups.find((g) => g.key === key)?.tasks.map((t) => t.title);

  it("puts each to-do in the right group", () => {
    expect(titles("overdue")).toEqual(["late"]);
    expect(titles(today)).toEqual(["today"]);
    expect(titles("2026-11-13")).toEqual(["tomorrow"]);
    expect(titles("later")).toEqual(["next week"]);
    expect(titles("undated")).toEqual(["someday"]);
  });

  it("always shows the next seven days, and leaves finished to-dos out", () => {
    expect(groups.filter((g) => g.kind === "day")).toHaveLength(7);
    expect(groups.flatMap((g) => g.tasks).some((t) => t.title === "done")).toBe(false);
  });

  it("hides Overdue, Later and No day when they're empty", () => {
    const keys = groupUpcoming([task("only today")], today).map((g) => g.key);
    expect(keys).not.toContain("overdue");
    expect(keys).not.toContain("later");
    expect(keys).not.toContain("undated");
  });
});

describe("compareTasks", () => {
  it("puts timed to-dos first, then by priority, then oldest first", () => {
    const list = [
      task("plain"),
      task("low", { priority: "low" }),
      task("at 3pm", { due_time: "15:00:00" }),
      task("high", { priority: "high" }),
      task("at 9am", { due_time: "09:00:00" }),
    ].sort(compareTasks);
    expect(list.map((t) => t.title)).toEqual(["at 9am", "at 3pm", "high", "low", "plain"]);
  });
});

describe("checks", () => {
  it("needs a to-do name of a sensible length", () => {
    expect(checkTaskTitle("   ")).toBeTruthy();
    expect(checkTaskTitle("x".repeat(301))).toBeTruthy();
    expect(checkTaskTitle("Send the proposal")).toBeNull();
  });

  it("needs meetings to end after they start", () => {
    expect(checkMeeting({ title: "Call", start_time: "15:00", end_time: "14:00" })).toBeTruthy();
    expect(checkMeeting({ title: "Call", start_time: null, end_time: "14:00" })).toBeTruthy();
    expect(checkMeeting({ title: "", start_time: null, end_time: null })).toBeTruthy();
    expect(checkMeeting({ title: "Call", start_time: "14:00", end_time: "15:00" })).toBeNull();
    expect(checkMeeting({ title: "All-day thing", start_time: null, end_time: null })).toBeNull();
  });
});
