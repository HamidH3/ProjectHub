// Helpers for the Claude connector (src/app/mcp): understanding what Claude
// sends ("tomorrow", "Friday", "2pm", "Chatoo") and turning plain text into a
// note. Pure functions, unit-tested in tests/unit/mcp.test.ts.
import { addDays, isDay, weekdayIndex, type Day } from "@/lib/days";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

// "today", "tomorrow", "yesterday", "friday" / "next friday" (the next one
// after today), or a date as YYYY-MM-DD. Returns null if it can't tell.
export function parseDay(input: string | null | undefined, today: Day): Day | null {
  if (input == null) return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const asDate: unknown = s;
    // Rejects impossible dates like 2026-02-30 (which would roll over to March).
    return isDay(asDate) && addDays(asDate, 0) === asDate ? asDate : null;
  }
  if (s === "today") return today;
  if (s === "tomorrow") return addDays(today, 1);
  if (s === "yesterday") return addDays(today, -1);
  const name = s.replace(/^(next|this|on)\s+/, "");
  const idx = WEEKDAYS.findIndex((w) => w === name || w.slice(0, 3) === name);
  if (idx >= 0) {
    const diff = (idx - weekdayIndex(today) + 7) % 7 || 7; // always a day after today
    return addDays(today, diff);
  }
  return null;
}

// "14:30", "9:05", "2pm", "2:30 pm", "noon". Returns "HH:MM" or null.
export function parseTime(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (s === "noon" || s === "midday") return "12:00";
  const m = /^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
  } else if (!m[2]) {
    return null; // a bare "14" is too ambiguous
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// Finds one item by id or by name (exact name first, then "contains").
// Returns the match, or a message listing what it could have meant.
export function pickByName<T extends { id: string; name: string }>(
  items: T[],
  query: string,
  what: string,
): { item: T } | { error: string } {
  const q = query.trim().toLowerCase();
  if (!q) return { error: `Say which ${what}.` };
  const byId = items.find((i) => i.id === query.trim());
  if (byId) return { item: byId };
  const exact = items.filter((i) => i.name.toLowerCase() === q);
  if (exact.length === 1) return { item: exact[0] };
  const partial = items.filter((i) => i.name.toLowerCase().includes(q));
  if (partial.length === 1) return { item: partial[0] };
  const matches = exact.length > 1 ? exact : partial;
  // Same name more than once: add the id, so the right one can be picked.
  const options = matches.map((i) =>
    matches.filter((m) => m.name.toLowerCase() === i.name.toLowerCase()).length > 1 ? `${i.name} (id ${i.id})` : i.name,
  );
  if (options.length > 1) return { error: `More than one ${what} matches "${query}": ${options.join(", ")}. Which one?` };
  const all = items.map((i) => i.name);
  return {
    error: all.length
      ? `No ${what} called "${query}". The ${what}s you can use are: ${all.join(", ")}.`
      : `There are no ${what}s you can use.`,
  };
}

type DocNode = { type: string; attrs?: Record<string, unknown>; content?: DocNode[]; text?: string };

function para(text: string): DocNode {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}

// Plain text → a note page. Blank lines separate paragraphs; lines starting
// "- " or "* " become a bullet list; "[ ] " / "[x] " become a tick list;
// "# " / "## " become headings.
export function textToDoc(text: string): { type: "doc"; content: DocNode[] } {
  const blocks: DocNode[] = [];
  let bullets: DocNode[] | null = null;
  let ticks: DocNode[] | null = null;
  const flush = () => {
    if (bullets) blocks.push({ type: "bulletList", content: bullets });
    if (ticks) blocks.push({ type: "taskList", content: ticks });
    bullets = ticks = null;
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const tick = /^\s*[-*]?\s*\[( |x|X)\]\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (tick) {
      if (bullets) flush();
      (ticks ??= []).push({ type: "taskItem", attrs: { checked: tick[1] !== " " }, content: [para(tick[2])] });
    } else if (bullet) {
      if (ticks) flush();
      (bullets ??= []).push({ type: "listItem", content: [para(bullet[1])] });
    } else {
      flush();
      if (heading) blocks.push({ type: "heading", attrs: { level: heading[1].length }, content: [{ type: "text", text: heading[2] }] });
      else if (line.trim()) blocks.push(para(line.trim()));
    }
  }
  flush();
  return { type: "doc", content: blocks.length ? blocks : [para("")] };
}

// The words of a doc made by textToDoc (for the search index), one block per line.
export function docText(doc: { content?: DocNode[] }): string {
  const lines: string[] = [];
  const walk = (n: DocNode, out: string[]) => {
    if (n.text) out.push(n.text);
    n.content?.forEach((c) => walk(c, out));
  };
  for (const block of doc.content ?? []) {
    if (block.type === "bulletList" || block.type === "taskList") {
      block.content?.forEach((item) => {
        const parts: string[] = [];
        walk(item, parts);
        lines.push(parts.join(""));
      });
    } else {
      const parts: string[] = [];
      walk(block, parts);
      lines.push(parts.join(""));
    }
  }
  return lines.join("\n");
}

// Cuts long text for a reply, saying so.
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n… (cut short: ${text.length - max} more characters)`;
}
