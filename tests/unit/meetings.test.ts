// The meeting recorder's helpers: links, bot status, transcripts, summaries
// and Recall.ai's webhook signatures.
import { describe, expect, it } from "vitest";
import {
  checkMeetingUrl,
  failureMessage,
  linesFromText,
  nextStatus,
  parseSummary,
  speakers,
  statusFromRecall,
  summaryToNote,
  transcriptLines,
  transcriptText,
} from "@/lib/meetings/words";
import { signForTest, verifyRecallSignature } from "@/lib/meetings/signature";

describe("meeting links", () => {
  it("accepts Teams, Zoom and Meet links", () => {
    expect(checkMeetingUrl("https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=x")).toMatchObject({
      ok: true,
      platform: "Microsoft Teams",
    });
    expect(checkMeetingUrl(" https://teams.live.com/meet/9876543 ")).toMatchObject({ ok: true, platform: "Microsoft Teams" });
    expect(checkMeetingUrl("https://us02web.zoom.us/j/123456789?pwd=abc")).toMatchObject({ ok: true, platform: "Zoom" });
    expect(checkMeetingUrl("https://meet.google.com/abc-defg-hij")).toMatchObject({ ok: true, platform: "Google Meet" });
  });

  it("refuses anything else", () => {
    expect(checkMeetingUrl("")).toMatchObject({ ok: false });
    expect(checkMeetingUrl("not a link")).toMatchObject({ ok: false });
    expect(checkMeetingUrl("http://teams.microsoft.com/l/meetup-join/x")).toMatchObject({ ok: false });
    expect(checkMeetingUrl("https://teams.microsoft.com.evil.example/x")).toMatchObject({ ok: false });
    expect(checkMeetingUrl("https://evilzoom.us/j/1")).toMatchObject({ ok: false });
    expect(checkMeetingUrl("https://user:pw@meet.google.com/abc")).toMatchObject({ ok: false });
    expect(checkMeetingUrl("javascript:alert(1)")).toMatchObject({ ok: false });
  });
});

describe("the bot's status", () => {
  it("maps Recall's codes", () => {
    expect(statusFromRecall("joining_call")).toBe("joining");
    expect(statusFromRecall("in_waiting_room")).toBe("waiting_room");
    expect(statusFromRecall("in_call_recording")).toBe("recording");
    expect(statusFromRecall("call_ended")).toBe("processing");
    expect(statusFromRecall("done")).toBe("processing");
    expect(statusFromRecall("fatal")).toBe("failed");
    expect(statusFromRecall("something_new")).toBeNull();
  });

  it("only moves forwards, and never undoes a finished meeting", () => {
    expect(nextStatus("joining", "recording")).toBe("recording");
    expect(nextStatus("recording", "waiting_room")).toBeNull(); // late, out of order
    expect(nextStatus("recording", "recording")).toBeNull();
    expect(nextStatus("recording", "failed")).toBe("failed");
    expect(nextStatus("summarising", "processing")).toBeNull();
    expect(nextStatus("ready", "failed")).toBeNull();
    expect(nextStatus("filed", "recording")).toBeNull();
  });

  it("explains failures in plain words", () => {
    expect(failureMessage("timeout_exceeded_waiting_room")).toMatch(/lobby/);
    expect(failureMessage("weird_code")).toMatch(/weird_code/);
    expect(failureMessage(null)).toMatch(/couldn't record/);
  });
});

describe("transcripts", () => {
  const parts = [
    { participant: { name: "Hamid" }, words: [{ text: "Morning all", start_timestamp: { relative: 3.2 } }, { text: "." }] },
    { participant: { name: "Hamid" }, words: [{ text: "Shall we start?", start_timestamp: { relative: 5 } }] },
    { participant: { name: "Sanna" }, words: [{ text: "Yes, the launch is Friday.", start_timestamp: { relative: 65 } }] },
    { participant: { name: null }, words: [{ text: "Hello?", start_timestamp: { relative: 3700 } }] },
    { participant: { name: "Empty" }, words: [] },
    "rubbish",
  ];

  it("joins words, merges the same speaker and keeps the time", () => {
    const lines = transcriptLines(parts);
    expect(lines).toEqual([
      { speaker: "Hamid", at: 3.2, text: "Morning all. Shall we start?" },
      { speaker: "Sanna", at: 65, text: "Yes, the launch is Friday." },
      { speaker: "Someone", at: 3700, text: "Hello?" },
    ]);
    expect(speakers(lines)).toEqual(["Hamid", "Sanna", "Someone"]);
  });

  it("turns into text and back", () => {
    const lines = transcriptLines(parts);
    const text = transcriptText(lines);
    expect(text).toBe("[00:03] Hamid: Morning all. Shall we start?\n[01:05] Sanna: Yes, the launch is Friday.\n[1:01:40] Someone: Hello?");
    expect(linesFromText(text)).toEqual([
      { speaker: "Hamid", at: 3, text: "Morning all. Shall we start?" },
      { speaker: "Sanna", at: 65, text: "Yes, the launch is Friday." },
      { speaker: "Someone", at: 3700, text: "Hello?" },
    ]);
  });

  it("copes with nothing", () => {
    expect(transcriptLines(null)).toEqual([]);
    expect(transcriptLines([])).toEqual([]);
  });
});

describe("Claude's summary", () => {
  it("reads the JSON, even with text around it", () => {
    const s = parseSummary(
      'Here you go:\n```json\n{"title":"Launch plan","overview":"We planned the launch.","key_points":["Friday launch", 3],"decisions":["Ship Friday"],"action_items":[{"task":"Write release notes","owner":"Sanna","due":"Thursday"},"Book the room",{"owner":"x"}],"open_questions":[]}\n```',
    );
    expect(s).toEqual({
      title: "Launch plan",
      overview: "We planned the launch.",
      keyPoints: ["Friday launch"],
      decisions: ["Ship Friday"],
      actionItems: [
        { task: "Write release notes", owner: "Sanna", due: "Thursday" },
        { task: "Book the room", owner: null, due: null },
      ],
      openQuestions: [],
    });
  });

  it("keeps a reply that isn't JSON as the overview", () => {
    expect(parseSummary("Just some prose.")).toMatchObject({ title: "", overview: "Just some prose.", keyPoints: [] });
    expect(parseSummary("{broken").overview).toBe("{broken");
  });

  it("becomes a note with sections, tick boxes and the transcript", () => {
    const lines = transcriptLines([
      { participant: { name: "Hamid" }, words: [{ text: "Hi", start_timestamp: { relative: 0 } }] },
      { participant: { name: "Sanna" }, words: [{ text: "Bye", start_timestamp: { relative: 90 } }] },
    ]);
    const note = summaryToNote(
      {
        title: "Launch plan",
        overview: "One.\n\nTwo.",
        keyPoints: ["A"],
        decisions: [],
        actionItems: [{ task: "Write notes", owner: "Sanna", due: "Friday" }],
        openQuestions: ["When?"],
      },
      { meetingTitle: "Weekly", when: "Fri 13 Nov 2026, 10:00", people: speakers(lines), lines },
    );
    expect(note.title).toBe("Launch plan");
    const types = note.doc.content.map((b) => b.type);
    expect(types).toEqual([
      "paragraph",
      "heading", "paragraph", "paragraph",
      "heading", "bulletList",
      "heading", "taskList",
      "heading", "bulletList",
      "heading", "paragraph", "paragraph",
    ]);
    expect(note.doc.content.some((b) => b.type === "heading" && b.content?.[0].text === "Decisions")).toBe(false); // empty: left out
    expect(note.text).toContain("Write notes (Sanna, by Friday)");
    expect(note.text).toContain("people: Hamid, Sanna");
    expect(note.text).toContain("Sanna: Bye");
    expect(JSON.stringify(note.doc)).toContain('"checked":false');
  });

  it("falls back to the meeting's name", () => {
    const note = summaryToNote(
      { title: "", overview: "", keyPoints: [], decisions: [], actionItems: [], openQuestions: [] },
      { meetingTitle: "Weekly", when: "today", people: [], lines: [] },
    );
    expect(note.title).toBe("Weekly");
    expect(note.doc.content).toHaveLength(1);
  });
});

describe("webhook signatures", () => {
  const secret = `whsec_${Buffer.from("a very secret key for tests").toString("base64")}`;
  const body = '{"event":"bot.done","data":{"bot":{"id":"b1"}}}';
  const now = 1_800_000_000;
  const headers = (sig: string, ts = now, prefix = "webhook") =>
    new Headers({ [`${prefix}-id`]: "msg_1", [`${prefix}-timestamp`]: String(ts), [`${prefix}-signature`]: sig });

  it("accepts a correct signature (new and old header names, several signatures)", () => {
    const sig = signForTest(secret, "msg_1", now, body);
    expect(verifyRecallSignature(secret, headers(sig), body, now)).toBe(true);
    expect(verifyRecallSignature(secret, headers(sig, now, "svix"), body, now)).toBe(true);
    expect(verifyRecallSignature(secret, headers(`v1,AAAA ${sig}`), body, now)).toBe(true);
  });

  it("refuses anything else", () => {
    const sig = signForTest(secret, "msg_1", now, body);
    expect(verifyRecallSignature(secret, headers(sig), body.replace("b1", "b2"), now)).toBe(false); // body changed
    expect(verifyRecallSignature(secret, headers(sig, now + 1), body, now)).toBe(false); // timestamp changed
    expect(verifyRecallSignature(secret, headers(sig), body, now + 3600)).toBe(false); // too old (replay)
    expect(verifyRecallSignature(`whsec_${Buffer.from("other").toString("base64")}`, headers(sig), body, now)).toBe(false);
    expect(verifyRecallSignature(undefined, headers(sig), body, now)).toBe(false);
    expect(verifyRecallSignature("not-whsec", headers(sig), body, now)).toBe(false);
    expect(verifyRecallSignature(secret, new Headers(), body, now)).toBe(false);
    expect(verifyRecallSignature(secret, headers(sig.replace("v1,", "v2,")), body, now)).toBe(false);
  });
});
