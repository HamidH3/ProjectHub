// Reading a published Outlook calendar (ICS), with repeating meetings
// expanded. Server side only in practice (the library is large); tested in
// tests/unit/outlook.test.ts.
import ICAL from "ical.js";
import { MAX_EVENTS, cleanText, safeHttps, type OutlookRow } from "@/lib/outlook/events";

function icsTime(t: ICAL.Time): Date {
  // All-day dates mean that calendar day wherever you are: kept as UTC midnight.
  if (t.isDate) return new Date(Date.UTC(t.year, t.month - 1, t.day));
  return t.toJSDate();
}

function icsRow(item: ICAL.Event, id: string, start: ICAL.Time, end: ICAL.Time): OutlookRow | null {
  const status = String(item.component.getFirstPropertyValue("status") ?? "").toUpperCase();
  if (status === "CANCELLED") return null;
  const s = icsTime(start);
  let e = icsTime(end);
  if (Number.isNaN(s.getTime())) return null;
  if (Number.isNaN(e.getTime()) || e < s) e = s;
  const join =
    item.component.getFirstPropertyValue("x-microsoft-skypeteamsmeetingurl") ??
    item.component.getFirstPropertyValue("x-microsoft-onlinemeetingexternallink");
  return {
    external_id: id.slice(0, 1024),
    title: cleanText(item.summary, 300) ?? "(No title)",
    location: cleanText(item.location, 500),
    join_url: safeHttps(join),
    web_link: null,
    starts_at: s.toISOString(),
    ends_at: e.toISOString(),
    all_day: start.isDate,
  };
}

export function parseIcs(text: string, from: Date, to: Date, max = MAX_EVENTS): OutlookRow[] {
  const calendar = new ICAL.Component(ICAL.parse(text));
  // Outlook includes its time zones (e.g. "GMT Standard Time"); register them
  // so times come out right.
  for (const tz of calendar.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      // an odd time zone: those events fall back to UTC
    }
  }
  const all = calendar.getAllSubcomponents("vevent");
  const changed = new Map<string, ICAL.Component[]>();
  for (const v of all) {
    if (!v.hasProperty("recurrence-id")) continue;
    const uid = String(v.getFirstPropertyValue("uid") ?? "");
    changed.set(uid, [...(changed.get(uid) ?? []), v]);
  }

  const rows: OutlookRow[] = [];
  for (const v of all) {
    if (rows.length >= max) break;
    if (v.hasProperty("recurrence-id")) continue;
    const event = new ICAL.Event(v);
    const uid = event.uid || String(rows.length);
    for (const ex of changed.get(uid) ?? []) event.relateException(ex);

    if (!event.isRecurring()) {
      const row = icsRow(event, uid, event.startDate, event.endDate ?? event.startDate);
      if (row && new Date(row.ends_at) >= from && new Date(row.starts_at) <= to) rows.push(row);
      continue;
    }
    const it = event.iterator();
    for (let n = 0, next = it.next(); next && n < 20_000 && rows.length < max; n++, next = it.next()) {
      if (icsTime(next) > to) break;
      const d = event.getOccurrenceDetails(next);
      const row = icsRow(d.item, `${uid}@${d.recurrenceId.toString()}`, d.startDate, d.endDate);
      if (row && new Date(row.ends_at) >= from) rows.push(row);
    }
  }
  return rows;
}

