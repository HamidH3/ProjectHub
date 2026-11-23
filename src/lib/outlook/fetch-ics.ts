import "server-only";
import { checkCalendarLink, isOutlookLinkHost, MAX_EVENTS, type OutlookRow } from "@/lib/outlook/events";
import { parseIcs } from "@/lib/outlook/ics";

// Downloads a published Outlook calendar. Only Outlook's own addresses are
// fetched (checked again after every redirect), with a time and size limit,
// so the server can't be pointed at anything else.

const MAX_BYTES = 8 * 1024 * 1024;

export class CalendarLinkError extends Error {}

// A stand-in calendar address for tests (never in production).
const TEST_LINK = process.env.NODE_ENV !== "production" ? process.env.OUTLOOK_TEST_ICS_URL : undefined;

/** The link to fetch, or why it can't be used. */
export function usableLink(link: string): { ok: true; url: string } | { ok: false; reason: string } {
  if (TEST_LINK && link.trim() === TEST_LINK) return { ok: true, url: TEST_LINK };
  return checkCalendarLink(link);
}

export async function fetchCalendarLink(link: string, from: Date, to: Date): Promise<OutlookRow[]> {
  const checked = usableLink(link);
  if (!checked.ok) throw new CalendarLinkError(checked.reason);

  let url = checked.url;
  let res: Response | null = null;
  for (let hops = 0; hops < 4; hops++) {
    res = await fetch(url, {
      redirect: "manual",
      headers: { accept: "text/calendar" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (res.status < 300 || res.status >= 400) break;
    const next = new URL(res.headers.get("location") ?? "", url);
    if (url !== TEST_LINK && (next.protocol !== "https:" || !isOutlookLinkHost(next.hostname))) {
      throw new CalendarLinkError("Outlook sent the link somewhere else. Copy the ICS link again.");
    }
    url = next.toString();
    res = null;
  }
  if (!res || res.status === 404 || res.status === 410) {
    throw new CalendarLinkError("Outlook says this link doesn't work any more. It may have been unpublished: publish the calendar again and paste the new ICS link.");
  }
  if (!res.ok) throw new CalendarLinkError("Outlook didn't send the calendar. Try again in a minute.");

  // Read it with a size limit.
  const reader = res.body?.getReader();
  if (!reader) throw new CalendarLinkError("Outlook sent an empty calendar.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new CalendarLinkError("That calendar is too big to copy.");
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.includes("BEGIN:VCALENDAR")) throw new CalendarLinkError("That link didn't send a calendar. Copy the ICS link (ending in .ics).");
  try {
    return parseIcs(text, from, to, MAX_EVENTS);
  } catch {
    throw new CalendarLinkError("Couldn't read that calendar.");
  }
}
