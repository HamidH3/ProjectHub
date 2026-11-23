import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Day } from "@/lib/days";
import { compareOutlook, eventDays, toLocalEvent, type OutlookEvent } from "@/lib/outlook/events";
import { microsoftConfigured } from "@/lib/outlook/microsoft";

// Loading the signed-in person's Outlook events for a page (their own only:
// the database's rules make sure of that).

export type OutlookConnection = {
  kind: "microsoft" | "link";
  label: string | null;
  status: "ok" | "error";
  last_error: string | null;
  last_synced_at: string | null;
};

export type OutlookData = {
  connections: OutlookConnection[];
  events: OutlookEvent[];
  microsoftAvailable: boolean; // "Sign in with Microsoft" is set up on this site
};

function shiftDay(day: Day, by: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString();
}

export async function getOutlook(
  timezone: string,
  range: { from: Day; to: Day; projectId?: string },
): Promise<OutlookData> {
  const supabase = await createClient();
  const microsoftAvailable = microsoftConfigured();
  // A day either side, then exact days in the person's own time zone.
  let events = supabase
    .from("outlook_events")
    .select("id, external_id, title, location, join_url, web_link, starts_at, ends_at, all_day, project_id")
    .lt("starts_at", shiftDay(range.to, 2))
    .gt("ends_at", shiftDay(range.from, -1))
    .order("starts_at")
    .limit(2000);
  if (range.projectId) events = events.eq("project_id", range.projectId);
  const [conn, ev] = await Promise.all([
    supabase.from("calendar_connections").select("kind, label, status, last_error, last_synced_at").order("created_at"),
    events,
  ]);
  if (conn.error || ev.error) {
    // Never let Outlook stop the calendar from opening.
    console.error("Couldn't load Outlook events:", conn.error?.message ?? ev.error?.message);
    return { connections: [], events: [], microsoftAvailable };
  }
  const shown = (ev.data ?? [])
    .map((row) => toLocalEvent(row, timezone))
    .filter((e) => eventDays(e).some((d) => d >= range.from && d <= range.to))
    .sort(compareOutlook);
  return { connections: (conn.data ?? []) as OutlookConnection[], events: shown, microsoftAvailable };
}

/** Just your connections (for Settings). */
export async function getOutlookConnections(): Promise<{ connections: OutlookConnection[]; microsoftAvailable: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_connections")
    .select("kind, label, status, last_error, last_synced_at")
    .order("created_at");
  if (error) console.error("Couldn't load Outlook connections:", error.message);
  return { connections: (data ?? []) as OutlookConnection[], microsoftAvailable: microsoftConfigured() };
}
