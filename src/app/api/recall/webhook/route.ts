// Recall.ai calls this address whenever a bot's status changes (joining, in
// the lobby, recording, finished…) and when a transcript is ready. Set it up in
// the Recall dashboard → Webhooks → Add Endpoint:
//   https://<your site>/api/recall/webhook
// Every request must carry a valid signature made with RECALL_WEBHOOK_SECRET;
// anything else is refused before it's even read.
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRecallSignature } from "@/lib/meetings/signature";
import { applyRecallStatus, processRecording } from "@/lib/meetings/process";
import { failureMessage } from "@/lib/meetings/words";

// Writing the summary can take a minute or two; it runs after Recall has had
// its reply (Recall gives up waiting after 15 seconds).
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Payload = {
  event?: string;
  data?: {
    bot?: { id?: string; metadata?: Record<string, unknown> | null } | null;
    bot_id?: string;
    data?: { code?: string; sub_code?: string | null } | null;
    status?: { code?: string; sub_code?: string | null } | null;
  };
};

const ok = () => Response.json({ ok: true });

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 200_000) return Response.json({ error: "Too large" }, { status: 413 });
  if (!verifyRecallSignature(process.env.RECALL_WEBHOOK_SECRET, request.headers, raw)) {
    return Response.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  const event = typeof payload.event === "string" ? payload.event : "";
  const botId = payload.data?.bot?.id ?? payload.data?.bot_id;
  if (typeof botId !== "string" || !botId || botId.length > 100) return ok(); // not about a bot

  // Find the recording: by the bot's id, or (if the webhook arrived before
  // the id was saved) by the recording id we gave the bot when creating it.
  const admin = createAdminClient();
  let { data: row } = await admin
    .from("meeting_recordings")
    .select("id, bot_id, status")
    .eq("bot_id", botId)
    .maybeSingle();
  if (!row) {
    const ours = payload.data?.bot?.metadata?.projecthub_recording;
    if (typeof ours === "string" && UUID.test(ours)) {
      const { data } = await admin
        .from("meeting_recordings")
        .update({ bot_id: botId })
        .eq("id", ours)
        .is("bot_id", null)
        .select("id, bot_id, status")
        .maybeSingle();
      row = data;
    }
  }
  if (!row) return ok(); // not one of ours (or deleted): nothing to do, and no retries

  if (event === "transcript.done") {
    after(() => processRecording(row.id));
    return ok();
  }
  if (event === "transcript.failed") {
    await admin
      .from("meeting_recordings")
      .update({ status: "failed", status_detail: "Recall.ai couldn't make a transcript of this meeting." })
      .eq("id", row.id)
      .in("status", ["joining", "waiting_room", "recording", "processing"]);
    return ok();
  }

  // Bot status changes: "bot.in_call_recording" (newer) or "bot.status_change" (older).
  let code = payload.data?.data?.code ?? payload.data?.status?.code ?? "";
  if (!code && event.startsWith("bot.")) code = event.slice(4);
  const subCode = payload.data?.data?.sub_code ?? payload.data?.status?.sub_code ?? null;
  if (!code) return ok();

  if (code === "fatal" && subCode) console.info(`Meeting bot ${row.id} stopped: ${subCode} (${failureMessage(subCode)})`);
  const over = await applyRecallStatus(row, code, subCode);
  if (over) after(() => processRecording(row.id));
  return ok();
}
