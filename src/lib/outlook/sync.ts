import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { seal, unseal } from "@/lib/outlook/crypto";
import { syncWindow, type OutlookRow } from "@/lib/outlook/events";
import { CalendarLinkError, fetchCalendarLink } from "@/lib/outlook/fetch-ics";
import { MicrosoftError, calendarEvents, microsoftConfigured, refreshTokens } from "@/lib/outlook/microsoft";

// Copies each person's Outlook events into outlook_events. Runs on the server
// with the secret key (the tokens and links are encrypted and nobody else can
// read them). Pages show the copy straight away and ask for a refresh in the
// background when it's more than a few minutes old, so pages never wait for
// Microsoft.

export const FRESH_FOR_MS = 5 * 60 * 1000;

type Connection = {
  id: string;
  user_id: string;
  kind: "microsoft" | "link";
  secret: string;
  last_synced_at: string | null;
};

class SyncProblem extends Error {}

function plainReason(err: unknown): string {
  if (err instanceof SyncProblem || err instanceof CalendarLinkError) return err.message;
  if (err instanceof MicrosoftError) {
    return err.needsReconnect
      ? "Microsoft asked you to sign in again. Press Reconnect."
      : "Microsoft didn't answer. ProjectHub will try again shortly.";
  }
  return "Couldn't update from Outlook. ProjectHub will try again shortly.";
}

async function saveEvents(conn: Connection, rows: OutlookRow[]) {
  const admin = createAdminClient();
  const run = randomUUID();
  const now = new Date().toISOString();
  // Keep each event once (the same meeting can appear twice in a calendar feed).
  const unique = [...new Map(rows.map((r) => [r.external_id, r])).values()];
  for (let i = 0; i < unique.length; i += 500) {
    const { error } = await admin.from("outlook_events").upsert(
      // project_id is left out, so links to projects stay as they are.
      unique.slice(i, i + 500).map((r) => ({ ...r, user_id: conn.user_id, connection_id: conn.id, sync_run: run, updated_at: now })),
      { onConflict: "connection_id,external_id" },
    );
    if (error) throw new Error(`saving events: ${error.message}`);
  }
  // Events that are gone from Outlook (deleted, cancelled or now too old).
  const { error } = await admin.from("outlook_events").delete().eq("connection_id", conn.id).neq("sync_run", run);
  if (error) throw new Error(`removing old events: ${error.message}`);
}

export async function syncConnection(conn: Connection): Promise<boolean> {
  const admin = createAdminClient();
  const { from, to } = syncWindow(new Date());
  try {
    const secret = unseal(conn.secret);
    if (!secret) throw new SyncProblem("Please connect your calendar again.");
    let rows: OutlookRow[];
    if (conn.kind === "microsoft") {
      if (!microsoftConfigured()) throw new SyncProblem("Sign in with Microsoft isn't set up on this site at the moment.");
      const tokens = await refreshTokens(secret);
      // Microsoft gives a new sign-in token each time: keep the newest.
      await admin.from("calendar_connections").update({ secret: seal(tokens.refresh) }).eq("id", conn.id);
      rows = await calendarEvents(tokens.access, from, to);
    } else {
      rows = await fetchCalendarLink(secret, from, to);
    }
    await saveEvents(conn, rows);
    await admin
      .from("calendar_connections")
      .update({ status: "ok", last_error: null, last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);
    return true;
  } catch (err) {
    console.error("Outlook sync failed:", err instanceof Error ? err.message : err);
    await admin
      .from("calendar_connections")
      .update({ status: "error", last_error: plainReason(err), last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);
    return false;
  }
}

/** Refreshes this person's calendars that are out of date (or all, if forced). */
export async function syncUser(userId: string, { force = false } = {}): Promise<{ checked: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("calendar_connections")
    .select("id, user_id, kind, secret, last_synced_at")
    .eq("user_id", userId);
  const due = ((data ?? []) as Connection[]).filter(
    (c) => force || !c.last_synced_at || Date.now() - new Date(c.last_synced_at).getTime() > FRESH_FOR_MS,
  );
  await Promise.all(due.map(syncConnection));
  return { checked: due.length };
}
