import { describe, expect, it } from "vitest";
import {
  checkCalendarLink,
  cleanText,
  compareOutlook,
  eventDays,
  fromGraph,
  safeHttps,
  syncWindow,
  toLocalEvent,
} from "@/lib/outlook/events";
import { parseIcs } from "@/lib/outlook/ics";

// A cut-down published Outlook calendar, as Outlook writes it (UK time zone).
const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:Microsoft Exchange Server 2010",
  "BEGIN:VTIMEZONE",
  "TZID:GMT Standard Time",
  "BEGIN:STANDARD",
  "DTSTART:16010101T020000",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0000",
  "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:16010101T010000",
  "TZOFFSETFROM:+0000",
  "TZOFFSETTO:+0100",
  "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
  // A weekly stand-up, Mondays 09:30 UK time, one week moved, one week off.
  "BEGIN:VEVENT",
  "UID:standup-1",
  "SUMMARY:Team stand-up",
  "LOCATION:Microsoft Teams Meeting",
  "X-MICROSOFT-SKYPETEAMSMEETINGURL:https://teams.microsoft.com/l/meetup-join/abc",
  "DTSTART;TZID=GMT Standard Time:20261102T093000",
  "DTEND;TZID=GMT Standard Time:20261102T100000",
  "RRULE:FREQ=WEEKLY;COUNT=6;BYDAY=MO",
  "EXDATE;TZID=GMT Standard Time:20261116T093000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:standup-1",
  "RECURRENCE-ID;TZID=GMT Standard Time:20261109T093000",
  "SUMMARY:Team stand-up (moved)",
  "DTSTART;TZID=GMT Standard Time:20261109T110000",
  "DTEND;TZID=GMT Standard Time:20261109T113000",
  "END:VEVENT",
  // A summer meeting (UK is an hour ahead of UTC then).
  "BEGIN:VEVENT",
  "UID:summer-1",
  "SUMMARY:Summer review",
  "DTSTART;TZID=GMT Standard Time:20270701T140000",
  "DTEND;TZID=GMT Standard Time:20270701T150000",
  "END:VEVENT",
  // Two days off (all-day, 3 Dec and 4 Dec).
  "BEGIN:VEVENT",
  "UID:leave-1",
  "SUMMARY:Annual leave",
  "DTSTART;VALUE=DATE:20261203",
  "DTEND;VALUE=DATE:20261205",
  "END:VEVENT",
  // Cancelled, and long ago: both left out.
  "BEGIN:VEVENT",
  "UID:cancelled-1",
  "SUMMARY:Cancelled thing",
  "STATUS:CANCELLED",
  "DTSTART:20261120T100000Z",
  "DTEND:20261120T110000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:old-1",
  "SUMMARY:Old meeting",
  "DTSTART:20200101T100000Z",
  "DTEND:20200101T110000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const from = new Date("2026-10-20T00:00:00Z");
const to = new Date("2027-12-31T00:00:00Z");

describe("parseIcs: a published Outlook calendar", () => {
  const rows = parseIcs(ICS, from, to);
  const standups = rows.filter((r) => r.title.startsWith("Team stand-up")).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  it("expands repeating meetings, minus the cancelled week", () => {
    expect(standups.map((r) => r.starts_at)).toEqual([
      "2026-11-02T09:30:00.000Z",
      "2026-11-09T11:00:00.000Z", // the moved one
      "2026-11-23T09:30:00.000Z",
      "2026-11-30T09:30:00.000Z",
      "2026-12-07T09:30:00.000Z",
    ]);
    expect(standups[1].title).toBe("Team stand-up (moved)");
    expect(new Set(standups.map((r) => r.external_id)).size).toBe(5);
  });
  it("keeps the Teams link and the place", () => {
    expect(standups[0].join_url).toBe("https://teams.microsoft.com/l/meetup-join/abc");
    expect(standups[0].location).toBe("Microsoft Teams Meeting");
  });
  it("uses the meeting's time zone (UK summer time is UTC+1)", () => {
    expect(rows.find((r) => r.title === "Summer review")?.starts_at).toBe("2027-07-01T13:00:00.000Z");
  });
  it("keeps all-day events as whole days", () => {
    const leave = rows.find((r) => r.title === "Annual leave")!;
    expect(leave).toMatchObject({ all_day: true, starts_at: "2026-12-03T00:00:00.000Z", ends_at: "2026-12-05T00:00:00.000Z" });
  });
  it("leaves out cancelled and out-of-range events", () => {
    expect(rows.some((r) => r.title === "Cancelled thing" || r.title === "Old meeting")).toBe(false);
  });
  it("stops at the limit", () => {
    expect(parseIcs(ICS, from, to, 2)).toHaveLength(2);
  });
});

describe("fromGraph: events from Microsoft", () => {
  it("reads a normal meeting", () => {
    expect(
      fromGraph({
        id: "AAMk1",
        subject: "  Budget\nreview ",
        start: { dateTime: "2026-11-23T14:00:00.0000000", timeZone: "UTC" },
        end: { dateTime: "2026-11-23T15:00:00.0000000", timeZone: "UTC" },
        location: { displayName: "Room 2" },
        onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/x" },
        webLink: "https://outlook.office365.com/owa/?itemid=1",
      }),
    ).toEqual({
      external_id: "AAMk1",
      title: "Budget review",
      location: "Room 2",
      join_url: "https://teams.microsoft.com/l/x",
      web_link: "https://outlook.office365.com/owa/?itemid=1",
      starts_at: "2026-11-23T14:00:00.000Z",
      ends_at: "2026-11-23T15:00:00.000Z",
      all_day: false,
    });
  });
  it("skips cancelled events and odd data, and never keeps unsafe links", () => {
    expect(fromGraph({ id: "x", isCancelled: true, start: { dateTime: "2026-11-23T14:00:00" } })).toBeNull();
    expect(fromGraph({ id: "x" })).toBeNull();
    const ev = fromGraph({
      id: "y",
      subject: "",
      start: { dateTime: "2026-11-23T14:00:00" },
      onlineMeeting: { joinUrl: "javascript:alert(1)" },
      webLink: "http://insecure.example",
    })!;
    expect(ev.title).toBe("(No title)");
    expect(ev.join_url).toBeNull();
    expect(ev.web_link).toBeNull();
  });
});

describe("toLocalEvent: shown in your own time zone", () => {
  const row = {
    id: "1",
    project_id: null,
    external_id: "e",
    title: "Call",
    location: null,
    join_url: null,
    web_link: null,
    starts_at: "2026-07-01T23:30:00.000Z",
    ends_at: "2026-07-02T00:30:00.000Z",
    all_day: false,
  };
  it("London in summer: the next day, 00:30", () => {
    expect(toLocalEvent(row, "Europe/London")).toMatchObject({ date: "2026-07-02", start_time: "00:30", end_time: "01:30" });
  });
  it("New York: the same evening", () => {
    expect(toLocalEvent(row, "America/New_York")).toMatchObject({ date: "2026-07-01", start_time: "19:30", end_time: "20:30" });
  });
  it("all-day events keep their days in every time zone", () => {
    const leave = { ...row, all_day: true, starts_at: "2026-12-03T00:00:00.000Z", ends_at: "2026-12-05T00:00:00.000Z" };
    for (const tz of ["Europe/London", "America/Los_Angeles", "Asia/Tokyo"]) {
      expect(toLocalEvent(leave, tz)).toMatchObject({ date: "2026-12-03", end_date: "2026-12-04", start_time: null });
    }
    expect(eventDays(toLocalEvent(leave, "Europe/London"))).toEqual(["2026-12-03", "2026-12-04"]);
  });
  it("a meeting ending at midnight stays on its day", () => {
    const late = { ...row, starts_at: "2026-11-23T23:00:00.000Z", ends_at: "2026-11-24T00:00:00.000Z" };
    expect(toLocalEvent(late, "Europe/London")).toMatchObject({ date: "2026-11-23", end_date: "2026-11-23", end_time: "00:00" });
  });
  it("sorts all-day first, then by time", () => {
    const a = toLocalEvent({ ...row, starts_at: "2026-11-23T09:00:00Z", ends_at: "2026-11-23T10:00:00Z" }, "UTC");
    const b = toLocalEvent({ ...row, starts_at: "2026-11-23T00:00:00Z", ends_at: "2026-11-24T00:00:00Z", all_day: true }, "UTC");
    expect([a, b].sort(compareOutlook)[0]).toBe(b);
  });
});

describe("pasted calendar links", () => {
  const good = "https://outlook.office365.com/owa/calendar/abc@example.co.uk/xyz/calendar.ics";
  it("accepts Outlook's ICS link (and webcal://)", () => {
    expect(checkCalendarLink(` ${good} `)).toEqual({ ok: true, url: good });
    expect(checkCalendarLink(good.replace("https://", "webcal://"))).toEqual({ ok: true, url: good });
  });
  it("refuses anything that isn't Outlook's ICS link", () => {
    for (const bad of [
      "",
      "not a link",
      "http://outlook.office365.com/owa/calendar/a/b/calendar.ics",
      "https://evil.example/calendar.ics",
      "https://outlook.office365.com.evil.example/calendar.ics",
      "https://outlook.office365.com/owa/calendar/a/b/calendar.html",
      "https://user:pw@outlook.office365.com/owa/calendar/a/b/calendar.ics",
      "https://outlook.office365.com:8443/owa/calendar/a/b/calendar.ics",
      "https://169.254.169.254/calendar.ics",
    ]) {
      expect(checkCalendarLink(bad).ok, bad).toBe(false);
    }
  });
});

describe("small helpers", () => {
  it("cleanText and safeHttps", () => {
    expect(cleanText("a\u0000b\n\tc", 10)).toBe("a b c");
    expect(cleanText("   ", 10)).toBeNull();
    expect(cleanText("abcdef", 3)).toBe("abc");
    expect(safeHttps("https://a.example/x")).toBe("https://a.example/x");
    expect(safeHttps("data:text/html,x")).toBeNull();
  });
  it("copies a month back and six months ahead", () => {
    const w = syncWindow(new Date("2026-11-23T15:00:00Z"));
    expect(w.from.toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect(w.to.toISOString()).toBe("2027-05-25T00:00:00.000Z");
  });
});
