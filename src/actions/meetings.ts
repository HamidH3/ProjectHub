"use server";

// The meeting recorder's buttons: send the bot, pick a project for the notes,
// stop the bot, try again, check now, delete.
//
// Sending the bot costs money (Recall.ai bills per hour), so only admins can do
// it, and only 10 times an hour. Picking a project goes through the database
// function assign_recording(), which checks you can open that project.
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/audit";
import { rateLimit, UNAVAILABLE_MESSAGE } from "@/lib/rate-limit";
import { createBot, deleteMedia, leaveCall } from "@/lib/meetings/recall";
import { missingSettings } from "@/lib/meetings/data";
import { processRecording, syncRecording } from "@/lib/meetings/process";
import { checkMeetingUrl, IN_CALL, isStatus } from "@/lib/meetings/words";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const idSchema = z.uuid();
const RECORDER = "/recorder";

function refresh() {
  revalidatePath(RECORDER);
  revalidatePath("/", "layout"); // the sidebar's badge
}

async function myRecording(id: string) {
  if (!idSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("meeting_recordings")
    .select("id, bot_id, status, transcript_text, updated_at")
    .eq("id", id)
    .maybeSingle(); // only your own come back
  return data;
}

const sendSchema = z.object({
  url: z.string(),
  title: z.string().trim().max(200, "Keep the name under 200 characters."),
  projectId: z.union([z.uuid(), z.literal("")]),
});

export async function sendBot(formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (user.role !== "admin") return { ok: false, error: "Only an administrator can send the meeting bot." };
  const missing = missingSettings();
  if (missing.length) return { ok: false, error: `The meeting bot isn't set up yet (missing ${missing.join(", ")}).` };

  const parsed = sendSchema.safeParse({
    url: formData.get("url") ?? "",
    title: formData.get("title") ?? "",
    projectId: formData.get("projectId") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const link = checkMeetingUrl(parsed.data.url);
  if (!link.ok) return link;

  // A project picked now: check you can open it (the database answers as you).
  let projectId: string | null = null;
  if (parsed.data.projectId) {
    const supabase = await createClient();
    const { data } = await supabase.from("projects").select("id").eq("id", parsed.data.projectId).maybeSingle();
    if (!data) return { ok: false, error: "That project wasn't found." };
    projectId = data.id;
  }

  const limit = await rateLimit(`meeting-bot:${user.id}`, 10, 3600);
  if (limit === "unavailable") return { ok: false, error: UNAVAILABLE_MESSAGE };
  if (limit === "limited") return { ok: false, error: "That's 10 bots in the last hour. Try again later." };

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("meeting_recordings")
    .insert({
      created_by: user.id,
      meeting_url: link.url,
      title: parsed.data.title || `${link.platform} meeting`,
      project_id: projectId,
      status: "joining",
    })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: "Couldn't start the recording. Try again." };

  let botId: string;
  try {
    botId = (await createBot(link.url, row.id)).id;
  } catch {
    await admin.from("meeting_recordings").delete().eq("id", row.id);
    return { ok: false, error: "Recall.ai couldn't send the bot. Check the link, and the Recall settings, then try again." };
  }
  // The webhook may have filled this in already (it can arrive very fast).
  const { error: saveError } = await admin
    .from("meeting_recordings")
    .update({ bot_id: botId })
    .eq("id", row.id)
    .is("bot_id", null);
  if (saveError) {
    console.error("Couldn't save the bot's id:", saveError.message);
    await leaveCall(botId).catch(() => undefined);
    await admin.from("meeting_recordings").delete().eq("id", row.id);
    return { ok: false, error: "Couldn't start the recording. Try again." };
  }

  await logActivity({
    actorId: user.id,
    action: "meeting.bot_sent",
    projectId,
    entityType: "meeting_recording",
    entityId: row.id,
    metadata: { platform: link.platform },
  });
  refresh();
  return { ok: true, message: "The bot is on its way. Let it in from the lobby if the meeting asks." };
}

export async function assignRecording(id: string, projectId: string): Promise<Result> {
  await getCurrentUser();
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(projectId).success) {
    return { ok: false, error: "Pick a project." };
  }
  const supabase = await createClient();
  const { data: noteId, error } = await supabase.rpc("assign_recording", {
    p_recording_id: id,
    p_project_id: projectId,
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("already") ? "That meeting has already been added to a project." : "You can't add notes to that project.",
    };
  }
  refresh();
  revalidatePath(`/projects/${projectId}/notes`, "layout");
  return {
    ok: true,
    message: noteId ? "Added to the project's AI notes." : "Saved. The notes will appear in that project as soon as the summary is written.",
  };
}

export async function stopBot(id: string): Promise<Result> {
  await getCurrentUser();
  const row = await myRecording(id);
  if (!row?.bot_id || !isStatus(row.status) || !IN_CALL.includes(row.status)) {
    return { ok: false, error: "The bot isn't in a meeting." };
  }
  try {
    await leaveCall(row.bot_id);
  } catch {
    return { ok: false, error: "Couldn't reach Recall.ai. Try again, or remove the bot from the meeting yourself." };
  }
  return { ok: true, message: "The bot is leaving. The notes will follow shortly." };
}

export async function retryRecording(id: string): Promise<Result> {
  await getCurrentUser();
  const row = await myRecording(id);
  if (!row || row.status !== "failed") return { ok: false, error: "Only meetings that didn't work can be tried again." };
  if (!row.transcript_text && !row.bot_id) return { ok: false, error: "The bot never joined that meeting. Send it again." };
  after(() => processRecording(row.id, { force: true }));
  return { ok: true, message: "Trying again…" };
}

// Asks Recall.ai about your meetings in progress. The page calls this every few
// seconds while one is running, so it keeps moving even when the webhook can't
// reach this site (for example while you run ProjectHub on your own computer).
export async function checkRecordings(): Promise<void> {
  const user = await getCurrentUser();
  const limit = await rateLimit(`meeting-check:${user.id}`, 40, 600);
  if (limit !== "allowed") return;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("meeting_recordings")
    .select("id, bot_id, status, updated_at, claimed_at")
    .in("status", ["joining", "waiting_room", "recording", "processing", "summarising"])
    .limit(10);
  const now = Date.now();
  for (const row of rows ?? []) {
    try {
      if (row.status === "summarising") {
        // Picked up again if whoever was writing it stopped (processRecording
        // only takes it if it has been stuck for 10 minutes).
        after(() => processRecording(row.id));
        continue;
      }
      if (now - new Date(row.updated_at).getTime() < 10_000) continue; // just changed
      if ((await syncRecording(row)) === "process" || row.status === "processing") {
        after(() => processRecording(row.id));
      }
    } catch (err) {
      console.error("Meeting check failed:", err instanceof Error ? err.message : err);
    }
  }
}

export async function deleteRecording(id: string): Promise<Result> {
  await getCurrentUser();
  const row = await myRecording(id);
  if (!row) return { ok: false, error: "That meeting wasn't found." };
  if (row.bot_id) {
    // Best effort: take the bot out of the call and clear Recall's copy.
    if (isStatus(row.status) && IN_CALL.includes(row.status)) await leaveCall(row.bot_id).catch(() => undefined);
    await deleteMedia(row.bot_id).catch(() => undefined);
  }
  const supabase = await createClient();
  const { error } = await supabase.from("meeting_recordings").delete().eq("id", row.id);
  if (error) return { ok: false, error: "Couldn't delete it. Try again." };
  refresh();
  return { ok: true, message: "Deleted. Any AI notes already added to a project stay there." };
}
