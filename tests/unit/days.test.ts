// Calendar days: adding days, the month grid, and labels like "Tomorrow".
import { describe, expect, it } from "vitest";
import { addDays, dayInZone, dayLabel, isDay, isMonth, monthGrid, monthLabel, shiftMonth, shortTime, startOfWeek, weekdayIndex } from "@/lib/days";

describe("days", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30"); // clocks change in the UK that day: still one day
  });

  it("knows the weekday (Monday first)", () => {
    expect(weekdayIndex("2026-11-09")).toBe(0); // Monday
    expect(weekdayIndex("2026-11-15")).toBe(6); // Sunday
    expect(startOfWeek("2026-11-12")).toBe("2026-11-09");
  });

  it("builds a month calendar of whole Monday–Sunday weeks", () => {
    const grid = monthGrid("2026-11");
    expect(grid[0]).toBe("2026-10-26");
    expect(grid.at(-1)).toBe("2026-12-06");
    expect(grid.length % 7).toBe(0);
    expect(grid).toContain("2026-11-01");
    expect(grid).toContain("2026-11-30");
  });

  it("moves between months", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-11")).toBe("November 2026");
  });

  it("labels days relative to today", () => {
    const today = "2026-11-12"; // a Thursday
    expect(dayLabel(today, today)).toBe("Today");
    expect(dayLabel("2026-11-13", today)).toBe("Tomorrow");
    expect(dayLabel("2026-11-11", today)).toBe("Yesterday");
    expect(dayLabel("2026-11-16", today)).toBe("Monday");
    expect(dayLabel("2026-11-25", today)).toBe("Wed 25 Nov");
    expect(dayLabel("2027-01-05", today)).toBe("Tue 5 Jan 2027");
  });

  it("checks dates and months people send", () => {
    expect(isDay("2026-11-12")).toBe(true);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("12/11/2026")).toBe(false);
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-00")).toBe(false);
    expect(isMonth("drop table")).toBe(false);
  });

  it("works out the day in a time zone", () => {
    expect(dayInZone("2026-07-01T23:30:00Z", "Europe/London")).toBe("2026-07-02"); // summer time: 00:30 next day
    expect(dayInZone("2026-12-01T23:30:00Z", "Europe/London")).toBe("2026-12-01");
    expect(shortTime("14:30:00")).toBe("14:30");
    expect(shortTime(null)).toBeNull();
  });
});
