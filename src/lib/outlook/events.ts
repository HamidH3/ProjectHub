// Outlook calendar events: turning what Microsoft sends into ProjectHub's
// events, and showing them in each person's own time zone. (Reading ICS
// links is in ics.ts.) No database or network here, so it's all tested
// (tests/unit/outlook.test.ts). Safe to use in the browser.
import type { Day } from "@/lib/days";

/** One event as stored (all times in UTC). */
export type OutlookRow = {
  external_id: string;
  title: string;
  location: string | null;
  join_url: string | null;
  web_link: string | null;
  starts_at: string; // ISO, UTC
  ends_at: string;
  all_day: boolean;
};

/** One event as shown on a page, in the viewer's time zone. */
export type OutlookEvent = {
  id: string;
  title: string;
  location: string | null;
  join_url: string | null;
  web_link: string | null;
  date: Day; // the day it starts
  end_date: Day; // the day it ends (same as date for most)
  start_time: string | null; // "HH:MM", null for all-day
  end_time: string | null;
  all_day: boolean;
  project_id: string | null;
};

/** How much of the calendar is copied: a month back, six months ahead. */
export const DAYS_BACK = 31;
export const DAYS_AHEAD = 183;
export const MAX_EVENTS = 2500;

export function syncWindow(now: Date): { from: Date; to: Date } {
  const day = 86_400_000;
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { from: new Date(start - DAYS_BACK * day), to: new Date(start + DAYS_AHEAD * day) };
}

/** Plain one-line text: no control characters, spaces tidied, cut to size. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

/** Only https links are kept (for "Join" and "Open in Outlook"). */
export function safeHttps(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pasted calendar links. Only Outlook's own addresses are accepted, so the
// server can't be used to fetch anything else.
// ---------------------------------------------------------------------------
export const OUTLOOK_LINK_HOSTS = ["outlook.office365.com", "outlook.office.com", "outlook.live.com"];

export function isOutlookLinkHost(host: string): boolean {
  return OUTLOOK_LINK_HOSTS.includes(host.toLowerCase());
}

export type LinkCheck = { ok: true; url: string } | { ok: false; reason: string };
export function checkCalendarLink(input: string): LinkCheck {
  const raw = input.trim().replace(/^webcals?:\/\//i, "https://");
  if (!raw) return { ok: false, reason: "Paste your calendar's ICS link." };
  if (raw.length > 2000) return { ok: false, reason: "That link is too long." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "That isn't a web link. Copy the ICS link from Outlook and paste it here." };
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    return { ok: false, reason: "The link should start with https://outlook…" };
  }
  if (!isOutlookLinkHost(url.hostname)) {
    return { ok: false, reason: "That isn't an Outlook calendar link. It should start with https://outlook.office365.com/" };
  }
  if (!url.pathname.toLowerCase().endsWith(".ics")) {
    return { ok: false, reason: "That's the HTML link. Copy the ICS link instead (the one ending in .ics)." };
  }
  url.hash = "";
  return { ok: true, url: url.toString() };
}

// ---------------------------------------------------------------------------
// Microsoft Graph (calendarView, asked for in UTC).
// ---------------------------------------------------------------------------
type GraphTime = { dateTime?: string; timeZone?: string } | null | undefined;
export type GraphEvent = {
  id?: string;
  subject?: string | null;
  isCancelled?: boolean;
  isAllDay?: boolean;
  start?: GraphTime;
  end?: GraphTime;
  location?: { displayName?: string | null } | null;
  onlineMeeting?: { joinUrl?: string | null } | null;
  webLink?: string | null;
};

function graphTime(t: GraphTime): Date | null {
  if (!t?.dateTime) return null;
  // "2026-11-23T09:00:00.0000000" in UTC (we ask for UTC).
  const iso = t.dateTime.replace(/(\.\d{3})\d*$/, "$1").replace(/Z$/, "");
  const d = new Date(`${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fromGraph(ev: GraphEvent): OutlookRow | null {
  if (!ev?.id || ev.isCancelled) return null;
  const start = graphTime(ev.start);
  const end = graphTime(ev.end) ?? start;
  if (!start || !end) return null;
  return {
    external_id: ev.id.slice(0, 1024),
    title: cleanText(ev.subject, 300) ?? "(No title)",
    location: cleanText(ev.location?.displayName, 500),
    join_url: safeHttps(ev.onlineMeeting?.joinUrl),
    web_link: safeHttps(ev.webLink),
    starts_at: start.toISOString(),
    ends_at: (end < start ? start : end).toISOString(),
    all_day: Boolean(ev.isAllDay),
  };
}

// ---------------------------------------------------------------------------
// Showing events in the viewer's time zone.
// ---------------------------------------------------------------------------
function localParts(d: Date, tz: string): { day: Day; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { day: `${get("year")}-${get("month")}-${get("day")}` as Day, time: `${get("hour")}:${get("minute")}` };
}

type StoredEvent = OutlookRow & { id: string; project_id: string | null };

export function toLocalEvent(row: StoredEvent, tz: string): OutlookEvent {
  const start = new Date(row.starts_at);
  const end = new Date(row.ends_at);
  const base = {
    id: row.id,
    title: row.title,
    location: row.location,
    join_url: row.join_url,
    web_link: row.web_link,
    all_day: row.all_day,
    project_id: row.project_id,
  };
  if (row.all_day) {
    const date = row.starts_at.slice(0, 10) as Day;
    // The end is the morning after the last day.
    const last = new Date(Math.max(start.getTime(), end.getTime() - 1)).toISOString().slice(0, 10) as Day;
    return { ...base, date, end_date: last < date ? date : last, start_time: null, end_time: null };
  }
  const s = localParts(start, tz);
  const e = localParts(new Date(Math.max(start.getTime(), end.getTime() - 1)), tz);
  const endTime = localParts(end, tz).time;
  return { ...base, date: s.day, end_date: e.day < s.day ? s.day : e.day, start_time: s.time, end_time: endTime };
}

/** Days an event shows on (all-day events on every day they cover, up to 2 weeks). */
export function eventDays(ev: Pick<OutlookEvent, "date" | "end_date" | "all_day">): Day[] {
  if (!ev.all_day || ev.end_date <= ev.date) return [ev.date];
  const days: Day[] = [];
  const t = new Date(`${ev.date}T00:00:00Z`);
  for (let i = 0; i < 14; i++) {
    const d = t.toISOString().slice(0, 10) as Day;
    if (d > ev.end_date) break;
    days.push(d);
    t.setUTCDate(t.getUTCDate() + 1);
  }
  return days;
}

/** Earliest first; all-day events before timed ones. */
export function compareOutlook(a: OutlookEvent, b: OutlookEvent): number {
  return (
    a.date.localeCompare(b.date) ||
    Number(!a.all_day) - Number(!b.all_day) ||
    (a.start_time ?? "").localeCompare(b.start_time ?? "") ||
    a.title.localeCompare(b.title)
  );
}
