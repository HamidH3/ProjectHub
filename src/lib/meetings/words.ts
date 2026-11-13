// The meeting recorder's plain helpers (no network, no database), so they can
// be tested on their own: checking meeting links, following the bot's status,
// turning a transcript into text, and turning Claude's summary into a note.

// ---------------------------------------------------------------------------
// Meeting links
// ---------------------------------------------------------------------------
export type Platform = "Microsoft Teams" | "Zoom" | "Google Meet";

// Only links to these meeting services are accepted.
function platformOf(host: string): Platform | null {
  if (host === "teams.microsoft.com" || host === "teams.live.com" || host.endsWith(".teams.microsoft.com")) {
    return "Microsoft Teams";
  }
  if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Zoom";
  if (host === "meet.google.com") return "Google Meet";
  return null;
}

export function checkMeetingUrl(
  input: string,
): { ok: true; url: string; platform: Platform } | { ok: false; error: string } {
  const text = input.trim();
  if (!text) return { ok: false, error: "Paste the meeting link." };
  if (text.length > 2000) return { ok: false, error: "That link is too long." };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "That doesn't look like a link. Copy it from the meeting invite." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Meeting links start with https://" };
  if (url.username || url.password) return { ok: false, error: "That link isn't a normal meeting link." };
  const platform = platformOf(url.hostname.toLowerCase());
  if (!platform) return { ok: false, error: "Use a Microsoft Teams, Zoom or Google Meet link." };
  return { ok: true, url: url.toString(), platform };
}

// ---------------------------------------------------------------------------
// The bot's progress
// ---------------------------------------------------------------------------
export const STATUSES = [
  "joining",
  "waiting_room",
  "recording",
  "processing",
  "summarising",
  "ready",
  "filed",
  "failed",
] as const;
export type RecordingStatus = (typeof STATUSES)[number];

// Still in (or on its way to) the call, or being written up.
export const ACTIVE: RecordingStatus[] = ["joining", "waiting_room", "recording", "processing", "summarising"];
export const IN_CALL: RecordingStatus[] = ["joining", "waiting_room", "recording"];

export function isStatus(value: string): value is RecordingStatus {
  return (STATUSES as readonly string[]).includes(value);
}

// Recall.ai's status codes → ours. Codes we don't use are ignored (null).
export function statusFromRecall(code: string): RecordingStatus | null {
  switch (code) {
    case "joining_call":
    case "in_call_not_recording":
    case "recording_permission_allowed":
      return "joining";
    case "in_waiting_room":
      return "waiting_room";
    case "in_call_recording":
      return "recording";
    case "call_ended":
    case "done":
    case "analysis_done":
      return "processing";
    case "fatal":
    case "recording_permission_denied":
      return "failed";
    default:
      return null;
  }
}

// Updates can arrive out of order (and twice). Only ever move forwards, and
// leave finished recordings alone. The server itself moves things on from
// "processing" (writing the summary), so updates from Recall stop there.
export function nextStatus(current: RecordingStatus, incoming: RecordingStatus): RecordingStatus | null {
  if (current === "filed" || current === "ready" || current === "failed" || current === "summarising") return null;
  if (incoming === "failed") return "failed";
  const rank = (s: RecordingStatus) => STATUSES.indexOf(s);
  if (rank(incoming) > rank(current) && rank(incoming) <= rank("processing")) return incoming;
  return null;
}

// Why the bot couldn't join or record, in plain words.
export function failureMessage(subCode: string | null | undefined): string {
  switch (subCode) {
    case "meeting_not_found":
    case "meeting_link_invalid":
      return "The meeting link didn't work. Check it and send the bot again.";
    case "meeting_link_expired":
      return "That meeting link has expired.";
    case "timeout_exceeded_waiting_room":
    case "bot_kicked_from_waiting_room":
      return "Nobody let the bot in from the lobby.";
    case "bot_kicked_from_call":
    case "bot_removed_from_call":
      return "The bot was removed from the meeting.";
    case "meeting_requires_sign_in":
    case "teams_sign_in_required":
      return "This meeting only lets signed-in people join. Ask the organiser to allow guests.";
    case "timeout_exceeded_noone_joined":
      return "Nobody joined the meeting, so the bot left.";
    case "recording_permission_denied":
      return "The host didn't allow the bot to record.";
    default:
      return subCode ? `The bot couldn't record the meeting (${subCode.slice(0, 80)}).` : "The bot couldn't record the meeting.";
  }
}

export const STATUS_LABEL: Record<RecordingStatus, string> = {
  joining: "Joining the meeting",
  waiting_room: "Waiting in the lobby",
  recording: "Recording",
  processing: "Meeting over, getting the transcript",
  summarising: "Writing the summary",
  ready: "Ready: pick a project",
  filed: "Added to the project",
  failed: "Didn't work",
};

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------
// One piece of Recall.ai's transcript: who spoke, and what they said.
export type TranscriptPart = {
  participant?: { name?: string | null } | null;
  words?: { text?: string | null; start_timestamp?: { relative?: number | null } | null }[] | null;
};

export type TranscriptLine = { speaker: string; at: number; text: string };

export function transcriptLines(parts: unknown): TranscriptLine[] {
  if (!Array.isArray(parts)) return [];
  const lines: TranscriptLine[] = [];
  for (const part of parts as TranscriptPart[]) {
    const words = Array.isArray(part?.words) ? part.words : [];
    const text = words
      .map((w) => (typeof w?.text === "string" ? w.text.trim() : ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+([,.!?;:])/g, "$1");
    if (!text) continue;
    const speaker = (typeof part.participant?.name === "string" && part.participant.name.trim()) || "Someone";
    const at = Number(words[0]?.start_timestamp?.relative ?? 0) || 0;
    const last = lines.at(-1);
    // The same person still talking: one line.
    if (last && last.speaker === speaker) last.text += ` ${text}`;
    else lines.push({ speaker: speaker.slice(0, 100), at, text });
  }
  return lines;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export function transcriptText(lines: TranscriptLine[]): string {
  return lines.map((l) => `[${clock(l.at)}] ${l.speaker}: ${l.text}`).join("\n");
}

// Back from stored text (so a retry doesn't need Recall.ai again).
export function linesFromText(text: string): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const raw of text.split("\n")) {
    const m = /^\[(\d+(?::\d+){1,2})\] ([^:]{1,100}): (.*)$/.exec(raw);
    if (!m) continue;
    const secs = m[1].split(":").reduce((acc, n) => acc * 60 + Number(n), 0);
    out.push({ speaker: m[2], at: secs, text: m[3] });
  }
  return out;
}

export function speakers(lines: TranscriptLine[]): string[] {
  return [...new Set(lines.map((l) => l.speaker))];
}

// ---------------------------------------------------------------------------
// Claude's summary
// ---------------------------------------------------------------------------
export type ActionItem = { task: string; owner: string | null; due: string | null };
export type Summary = {
  title: string;
  overview: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  openQuestions: string[];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max = 40) =>
  (Array.isArray(v) ? v : []).map((x) => str(x, 1000)).filter(Boolean).slice(0, max);

// Claude is asked for JSON. Anything odd in it is dropped rather than trusted;
// if there's no JSON at all, the reply is kept as the overview.
export function parseSummary(reply: string): Summary {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  let data: Record<string, unknown> | null = null;
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(reply.slice(start, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
    } catch {
      data = null;
    }
  }
  if (!data) {
    return { title: "", overview: reply.trim().slice(0, 4000), keyPoints: [], decisions: [], actionItems: [], openQuestions: [] };
  }
  const items = (Array.isArray(data.action_items) ? data.action_items : [])
    .map((x): ActionItem | null => {
      if (typeof x === "string") return x.trim() ? { task: x.trim().slice(0, 500), owner: null, due: null } : null;
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const task = str(o.task, 500);
      return task ? { task, owner: str(o.owner, 100) || null, due: str(o.due, 100) || null } : null;
    })
    .filter((x): x is ActionItem => x !== null)
    .slice(0, 40);
  return {
    title: str(data.title, 120),
    overview: str(data.overview, 4000),
    keyPoints: list(data.key_points),
    decisions: list(data.decisions),
    actionItems: items,
    openQuestions: list(data.open_questions),
  };
}

// ---------------------------------------------------------------------------
// The AI note
// ---------------------------------------------------------------------------
type DocNode = { type: string; attrs?: Record<string, unknown>; content?: DocNode[]; text?: string; marks?: { type: string }[] };

const text = (t: string, bold = false): DocNode => (bold ? { type: "text", text: t, marks: [{ type: "bold" }] } : { type: "text", text: t });
const para = (...parts: DocNode[]): DocNode => (parts.length ? { type: "paragraph", content: parts } : { type: "paragraph" });
const heading = (t: string): DocNode => ({ type: "heading", attrs: { level: 2 }, content: [text(t)] });
const bullets = (items: string[]): DocNode => ({
  type: "bulletList",
  content: items.map((i) => ({ type: "listItem", content: [para(text(i))] })),
});

export const MAX_TRANSCRIPT_IN_NOTE = 600_000; // characters

export function summaryToNote(
  summary: Summary,
  meta: { meetingTitle: string; when: string; people: string[]; lines: TranscriptLine[] },
): { title: string; doc: { type: "doc"; content: DocNode[] }; text: string } {
  const title = (summary.title || meta.meetingTitle || "Meeting notes").slice(0, 200);
  const blocks: DocNode[] = [];
  const plain: string[] = [];
  const add = (node: DocNode, words: string) => {
    blocks.push(node);
    plain.push(words);
  };

  const facts = [`Recorded ${meta.when}`];
  if (meta.lines.length) facts.push(`length about ${clock(meta.lines.at(-1)!.at)}`);
  if (meta.people.length) facts.push(`people: ${meta.people.join(", ")}`);
  add(para(text(`🤖 AI notes · ${facts.join(" · ")}`)), facts.join(" · "));

  if (summary.overview) {
    add(heading("Summary"), "Summary");
    for (const p of summary.overview.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)) add(para(text(p)), p);
  }
  const section = (name: string, items: string[]) => {
    if (!items.length) return;
    add(heading(name), name);
    add(bullets(items), items.join("\n"));
  };
  section("Key points", summary.keyPoints);
  section("Decisions", summary.decisions);
  if (summary.actionItems.length) {
    add(heading("Action items"), "Action items");
    const ticks = summary.actionItems.map((a) => {
      const extra = [a.owner, a.due && `by ${a.due}`].filter(Boolean).join(", ");
      return { label: a.task, extra };
    });
    add(
      {
        type: "taskList",
        content: ticks.map((t) => ({
          type: "taskItem",
          attrs: { checked: false },
          content: [para(text(t.label), ...(t.extra ? [text(` (${t.extra})`)] : []))],
        })),
      },
      ticks.map((t) => (t.extra ? `${t.label} (${t.extra})` : t.label)).join("\n"),
    );
  }
  section("Open questions", summary.openQuestions);

  if (meta.lines.length) {
    add(heading("Full transcript"), "Full transcript");
    let used = 0;
    for (const line of meta.lines) {
      if (used > MAX_TRANSCRIPT_IN_NOTE) {
        add(para(text("… the rest of the transcript was too long to include.")), "");
        break;
      }
      used += line.text.length;
      add(para(text(`${line.speaker} (${clock(line.at)}): `, true), text(line.text)), `${line.speaker}: ${line.text}`);
    }
  }

  return { title, doc: { type: "doc", content: blocks }, text: plain.join("\n").slice(0, 900_000) };
}
