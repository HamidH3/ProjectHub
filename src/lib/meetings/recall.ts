// Talking to Recall.ai, the service whose bot joins the meeting, records it and
// writes the transcript. Server only: the API key never reaches the browser.
//
// Settings (in .env.local and in Vercel → Settings → Environment Variables):
//   RECALL_API_KEY         your Recall.ai API key
//   RECALL_REGION          the region your Recall account is in, e.g. eu-central-1
//   RECALL_WEBHOOK_SECRET  the workspace verification secret (starts whsec_)
import "server-only";

const REGIONS = ["us-west-2", "us-east-1", "eu-central-1", "ap-northeast-1"];

export const BOT_NAME = "ProjectHub Notetaker";

export function recallConfigured(): boolean {
  return Boolean(process.env.RECALL_API_KEY && REGIONS.includes(process.env.RECALL_REGION ?? ""));
}

function baseUrl(): string {
  // RECALL_API_URL is only for automated tests (a stand-in for Recall).
  const override = process.env.NODE_ENV !== "production" ? process.env.RECALL_API_URL : undefined;
  if (override) return override.replace(/\/+$/, "");
  const region = process.env.RECALL_REGION ?? "";
  if (!REGIONS.includes(region)) throw new Error(`RECALL_REGION must be one of ${REGIONS.join(", ")}.`);
  return `https://${region}.recall.ai`;
}

export class RecallError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = process.env.RECALL_API_KEY;
  if (!key) throw new RecallError("RECALL_API_KEY isn't set.", 0);
  const res = await fetch(`${baseUrl()}/api/v1/${path}`, {
    method,
    headers: {
      Authorization: `Token ${key}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const textBody = await res.text();
  if (!res.ok) {
    // Recall's error text can be useful in the server log, but never contains our key.
    console.error(`Recall.ai ${method} ${path.split("/")[0]} failed: ${res.status} ${textBody.slice(0, 300)}`);
    throw new RecallError(`Recall.ai said ${res.status}`, res.status);
  }
  return (textBody ? JSON.parse(textBody) : {}) as T;
}

export type RecallBot = {
  id: string;
  status_changes?: { code?: string; sub_code?: string | null; created_at?: string }[];
  recordings?: {
    id?: string;
    media_shortcuts?: {
      transcript?: { status?: { code?: string }; data?: { download_url?: string | null } } | null;
    } | null;
  }[];
};

export async function createBot(meetingUrl: string, recordingId: string): Promise<RecallBot> {
  return call<RecallBot>("POST", "bot/", {
    meeting_url: meetingUrl,
    bot_name: BOT_NAME,
    metadata: { projecthub_recording: recordingId },
    recording_config: {
      transcript: { provider: { recallai_streaming: { mode: "prioritize_accuracy", language_code: "auto" } } },
    },
    // Everyone in the meeting is told it's being recorded.
    chat: {
      on_bot_join: {
        send_to: "everyone",
        message: `Hi, I'm ${BOT_NAME}. I'm recording and transcribing this meeting so it can be written up as notes in ProjectHub. Remove me from the meeting if you'd rather not be recorded.`,
      },
    },
    // Don't wait forever (costs are per hour): leave after 10 minutes in the
    // lobby or alone, and shortly after everyone else has left.
    automatic_leave: {
      waiting_room_timeout: 600,
      noone_joined_timeout: 600,
    },
  });
}

export function getBot(botId: string): Promise<RecallBot> {
  return call<RecallBot>("GET", `bot/${encodeURIComponent(botId)}/`);
}

export async function leaveCall(botId: string): Promise<void> {
  await call("POST", `bot/${encodeURIComponent(botId)}/leave_call/`);
}

// Deletes the recording and transcript from Recall's servers once ProjectHub
// has its own copy of the transcript.
export async function deleteMedia(botId: string): Promise<void> {
  await call("POST", `bot/${encodeURIComponent(botId)}/delete_media/`);
}

// The bot's latest status code (and reason, if it failed).
export function latestStatus(bot: RecallBot): { code: string; subCode: string | null } | null {
  const last = bot.status_changes?.at(-1);
  return last?.code ? { code: last.code, subCode: last.sub_code ?? null } : null;
}

// "done" with the parts, "waiting" if not written yet, "failed" or "none".
export async function fetchTranscript(
  bot: RecallBot,
): Promise<{ state: "done"; parts: unknown } | { state: "waiting" | "failed" | "none" }> {
  const recording = bot.recordings?.find((r) => r.media_shortcuts?.transcript) ?? bot.recordings?.[0];
  const transcript = recording?.media_shortcuts?.transcript;
  if (!recording) return { state: "none" };
  if (!transcript) return { state: "waiting" };
  const code = transcript.status?.code;
  if (code === "failed") return { state: "failed" };
  const url = transcript.data?.download_url;
  if (code !== "done" || !url) return { state: "waiting" };

  const target = new URL(url);
  if (target.protocol !== "https:" && !(process.env.RECALL_API_URL && process.env.NODE_ENV !== "production")) {
    throw new RecallError("Unexpected transcript link.", 0);
  }
  // Download links are signed; only send our key back to Recall itself.
  const sameHost = target.host === new URL(baseUrl()).host;
  const res = await fetch(target, {
    headers: sameHost ? { Authorization: `Token ${process.env.RECALL_API_KEY}` } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new RecallError(`Transcript download said ${res.status}`, res.status);
  return { state: "done", parts: await res.json() };
}
