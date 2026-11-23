"use server";

// Outlook calendar buttons: refresh, connect with a calendar link, disconnect.
// ("Sign in with Microsoft" goes through /api/outlook/connect instead.)
// Everyone can connect their own calendar; what they connect is only ever
// shown to them.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/audit";
import { rateLimit, UNAVAILABLE_MESSAGE } from "@/lib/rate-limit";
import { seal } from "@/lib/outlook/crypto";
import { syncWindow } from "@/lib/outlook/events";
import { CalendarLinkError, fetchCalendarLink, usableLink } from "@/lib/outlook/fetch-ics";
import { syncConnection, syncUser } from "@/lib/outlook/sync";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function refreshPages() {
  revalidatePath("/", "layout");
}

/**
 * Brings your Outlook events up to date. Pages call it quietly when they open
 * (it does nothing if they were updated in the last few minutes); "Refresh"
 * forces it. Says whether anything was checked, so the page knows to reload.
 */
export async function refreshOutlook(force = false): Promise<{ ok: boolean; checked: number; error?: string }> {
  const user = await getCurrentUser();
  if (force) {
    const limit = await rateLimit(`outlook-refresh:${user.id}`, 15, 600);
    if (limit !== "allowed") {
      return { ok: false, checked: 0, error: limit === "limited" ? "That's a lot of refreshing. Try again in a few minutes." : UNAVAILABLE_MESSAGE };
    }
  }
  const { checked } = await syncUser(user.id, { force });
  if (checked) refreshPages();
  return { ok: true, checked };
}

const linkSchema = z.string().trim().min(1).max(2000);

/** Connects a calendar by its published ICS link (if Sign in with Microsoft isn't possible). */
export async function addCalendarLink(input: string): Promise<Result> {
  const user = await getCurrentUser();
  const parsed = linkSchema.safeParse(input);
  const checked = parsed.success ? usableLink(parsed.data) : null;
  if (!checked?.ok) return { ok: false, error: checked?.reason ?? "Paste your calendar's ICS link." };

  const limit = await rateLimit(`outlook-link:${user.id}`, 10, 3600);
  if (limit !== "allowed") {
    return { ok: false, error: limit === "limited" ? "Too many tries. Wait a little and try again." : UNAVAILABLE_MESSAGE };
  }

  // Make sure it really is a calendar before saving it.
  const { from, to } = syncWindow(new Date());
  let count: number;
  try {
    count = (await fetchCalendarLink(checked.url, from, to)).length;
  } catch (err) {
    return { ok: false, error: err instanceof CalendarLinkError ? err.message : "Couldn't open that calendar link. Check it and try again." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("calendar_connections")
    .upsert(
      {
        user_id: user.id,
        kind: "link",
        label: "Published calendar link",
        secret: seal(checked.url),
        status: "ok",
        last_error: null,
        last_synced_at: null,
      },
      { onConflict: "user_id,kind" },
    )
    .select("id, user_id, kind, secret, last_synced_at")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't save the calendar link. Try again." };
  await syncConnection(data as Parameters<typeof syncConnection>[0]);
  await logActivity({ actorId: user.id, action: "outlook.connected", entityType: "calendar", metadata: { kind: "link" } });
  refreshPages();
  return { ok: true, message: `Connected. ${count} event${count === 1 ? "" : "s"} from your Outlook calendar.` };
}

const kindSchema = z.enum(["microsoft", "link"]);

/** Disconnects: the link or sign-in is deleted, and so are the copied events. */
export async function disconnectOutlook(kind: string): Promise<Result> {
  const user = await getCurrentUser();
  const parsed = kindSchema.safeParse(kind);
  if (!parsed.success) return { ok: false, error: "Something went wrong." };
  const supabase = await createClient();
  // Only your own connection can be deleted (database rule).
  const { error } = await supabase.from("calendar_connections").delete().eq("kind", parsed.data);
  if (error) return { ok: false, error: "Couldn't disconnect. Try again." };
  await logActivity({ actorId: user.id, action: "outlook.disconnected", entityType: "calendar", metadata: { kind: parsed.data } });
  refreshPages();
  return { ok: true, message: "Disconnected. Your Outlook events have been removed from ProjectHub." };
}
