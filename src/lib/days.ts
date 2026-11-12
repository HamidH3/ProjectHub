// Working with plain calendar days written as "2026-11-12" (no time zones:
// "today" is worked out once, in the user's time zone, by the server).
// Safe to use on the server and in the browser.

export type Day = string; // YYYY-MM-DD
export type Month = string; // YYYY-MM

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const toDate = (day: Day) => new Date(`${day}T00:00:00Z`);
const fromDate = (date: Date): Day => date.toISOString().slice(0, 10);
const fmt = (day: Day, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(toDate(day));

export function isDay(value: unknown): value is Day {
  return typeof value === "string" && DAY_RE.test(value) && !Number.isNaN(toDate(value).getTime());
}

export function isMonth(value: unknown): value is Month {
  return typeof value === "string" && MONTH_RE.test(value);
}

export function addDays(day: Day, n: number): Day {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}

// 0 = Monday … 6 = Sunday
export function weekdayIndex(day: Day): number {
  return (toDate(day).getUTCDay() + 6) % 7;
}

export function startOfWeek(day: Day): Day {
  return addDays(day, -weekdayIndex(day));
}

export function monthOf(day: Day): Month {
  return day.slice(0, 7);
}

export function shiftMonth(month: Month, n: number): Month {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return fromDate(d).slice(0, 7);
}

// Every day shown on a month calendar: whole weeks, Monday to Sunday, from the
// week containing the 1st to the week containing the last day.
export function monthGrid(month: Month): Day[] {
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);
  const days: Day[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

export function monthLabel(month: Month): string {
  return fmt(`${month}-01`, { month: "long", year: "numeric" });
}

export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// "Today", "Tomorrow", "Yesterday", "Friday", or "Fri 21 Nov" further out.
export function dayLabel(day: Day, today: Day): string {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  if (day > today && day <= addDays(today, 6)) return fmt(day, { weekday: "long" });
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return fmt(day, { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

// "Friday 14 November"
export function dayLong(day: Day): string {
  return fmt(day, { weekday: "long", day: "numeric", month: "long" });
}

// "14 Nov"
export function dayShort(day: Day): string {
  return fmt(day, { day: "numeric", month: "short" });
}

// "14:30:00" → "14:30"
export function shortTime(time: string | null | undefined): string | null {
  return time ? time.slice(0, 5) : null;
}

// The calendar day a moment fell on, in the given time zone ("2026-11-12").
export function dayInZone(moment: string, timezone: string): Day {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(moment));
  } catch {
    return moment.slice(0, 10);
  }
}
