// What happens after the bot's meeting: get the transcript from Recall.ai,
// have Claude summarise it, and (once a project has been picked) save it as an
// AI note. Runs on the server with the secret key, because it's triggered by
// Recall's webhook rather than by someone signed in; every step only touches
// the one recording it was asked about.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { deleteMedia, fetchTranscript, getBot, latestStatus, RecallError } from "@/lib/meetings/recall";
import { summarise } from "@/lib/meetings/summarise";
import {
  failureMessage,
  isStatus,
  linesFromText,
  nextStatus,
  speakers,
  statusFromRecall,
  summaryToNote,
  transcriptLines,
  transcriptText,
  type RecordingStatus,
} from "@/lib/meetings/words";

// Someone working on a recording for longer than this is assumed to have
// crashed, so it can be picked up again.
const STALE_MINUTES = 10;
const MAX_TRANSCRIPT_BYTES = 1_400_000;

type Row = { id: string; bot_id: string | null; status: string };

const BEFORE_SUMMARY = ["joining", "waiting_room", "recording", "processing"];

async function setStatus(id: string, status: RecordingStatus, detail: string | null = null, extra: Record<string, unknown> = {}) {
  const admin = createAdminClient();
  await admin
    .from("meeting_recordings")
    .update({ status, status_detail: detail ? detail.slice(0, 500) : null, ...extra })
    .eq("id", id);
}

// A status from Recall (webhook or check): move the recording on if it's newer.
// Returns true when the meeting is over and the transcript can be fetched.
export async function applyRecallStatus(row: Row, code: string, subCode: string | null): Promise<boolean> {
  const incoming = statusFromRecall(code);
  const current = isStatus(row.status) ? row.status : "joining";
  if (incoming) {
    const next = nextStatus(current, incoming);
    if (next === "failed") {
      await setStatus(row.id, "failed", failureMessage(code === "recording_permission_denied" ? code : subCode));
      return false;
    }
    if (next) {
      await setStatus(row.id, next, null, next === "processing" ? { ended_at: new Date().toISOString() } : {});
      row.status = next;
    }
  }
  return code === "done" && BEFORE_SUMMARY.includes(row.status);
}

// Asks Recall how the bot is doing (used when the webhook can't reach this
// site, e.g. on your own computer, and by the "Check now" button).
export async function syncRecording(row: Row): Promise<"process" | "ok"> {
  if (!row.bot_id) return "ok";
  const bot = await getBot(row.bot_id);
  const latest = latestStatus(bot);
  if (!latest) return "ok";
  return (await applyRecallStatus(row, latest.code, latest.subCode)) ? "process" : "ok";
}

function formatWhen(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(iso).toUTCString();
  }
}

export async function processRecording(recordingId: string, { force = false } = {}): Promise<void> {
  const admin = createAdminClient();

  // 1. Claim the recording, so two webhooks arriving together don't both do
  //    the work (and pay for two summaries). Each update only succeeds for
  //    one caller, because the database checks the status as it changes it.
  const claim = () =>
    admin
      .from("meeting_recordings")
      .update({ status: "summarising", claimed_at: new Date().toISOString(), status_detail: null })
      .eq("id", recordingId);
  const columns = "id, bot_id, title, transcript_text, created_at, created_by";
  let { data: row } = await claim()
    .in("status", force ? [...BEFORE_SUMMARY, "failed"] : BEFORE_SUMMARY)
    .select(columns)
    .maybeSingle();
  if (!row) {
    // Or pick it up again if whoever was writing it stopped part-way.
    const stale = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
    ({ data: row } = await claim().eq("status", "summarising").lt("claimed_at", stale).select(columns).maybeSingle());
  }
  if (!row) return; // someone else has it, or it's already done

  try {
    // 2. The transcript (kept from an earlier try if there was one).
    let transcript = row.transcript_text;
    if (!transcript) {
      if (!row.bot_id) throw new Error("The bot never joined, so there's no transcript.");
      const result = await fetchTranscript(await getBot(row.bot_id));
      if (result.state === "waiting") {
        // Not written yet: Recall sends another webhook when it is.
        await setStatus(row.id, "processing", "Waiting for Recall.ai to finish the transcript.", { claimed_at: null });
        return;
      }
      if (result.state !== "done") throw new Error("Recall.ai couldn't make a transcript of this meeting.");
      const lines = transcriptLines(result.parts);
      if (lines.length === 0) throw new Error("Nobody spoke while the bot was in the meeting, so there's nothing to summarise.");
      transcript = transcriptText(lines);
      while (Buffer.byteLength(transcript) > MAX_TRANSCRIPT_BYTES) transcript = transcript.slice(0, Math.floor(transcript.length * 0.9));
      await admin.from("meeting_recordings").update({ transcript_text: transcript }).eq("id", row.id);

      // ProjectHub has its own copy now, so the recording is removed from
      // Recall's servers (set RECALL_KEEP_MEDIA=true to keep it there).
      if (process.env.RECALL_KEEP_MEDIA !== "true") {
        await deleteMedia(row.bot_id).catch((err) =>
          console.error("Couldn't delete the media at Recall.ai:", err instanceof Error ? err.message : err),
        );
      }
    }

    // 3. The summary.
    const lines = linesFromText(transcript);
    const { data: owner } = await admin.from("profiles").select("timezone").eq("id", row.created_by).maybeSingle();
    const summary = await summarise(transcript, row.title);
    const note = summaryToNote(summary, {
      meetingTitle: row.title,
      when: formatWhen(row.created_at, owner?.timezone ?? "Europe/London"),
      people: speakers(lines),
      lines,
    });

    // 4. Ready. If a project was picked already, it goes straight in.
    await admin
      .from("meeting_recordings")
      .update({
        status: "ready",
        status_detail: null,
        claimed_at: null,
        summary_title: note.title,
        summary_doc: note.doc as unknown as Json,
        summary_text: note.text,
      })
      .eq("id", row.id);
    const { error: fileError } = await admin.rpc("file_recording_note", { p_recording_id: row.id });
    if (fileError) {
      // e.g. they were taken off that project meanwhile: ask again.
      await admin
        .from("meeting_recordings")
        .update({ project_id: null, status_detail: "Couldn't add it to that project. Pick another one." })
        .eq("id", row.id)
        .eq("status", "ready");
    }
  } catch (err) {
    const message =
      err instanceof RecallError
        ? "Couldn't reach Recall.ai. Press Try again in a minute."
        : err instanceof Error
          ? err.message
          : "Something went wrong.";
    console.error(`Meeting ${row.id} failed:`, err instanceof Error ? err.message : err);
    await setStatus(row.id, "failed", message, { claimed_at: null });
  }
}
