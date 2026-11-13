// The Claude connector: understanding words, building notes, and the protocol.
import { describe, expect, it } from "vitest";
import { clip, docText, parseDay, parseTime, pickByName, textToDoc } from "@/lib/mcp/words";
import { handleRpc, isRpcMessage, SUPPORTED_VERSIONS, type ToolDefinition } from "@/lib/mcp/protocol";

const today = "2026-11-13"; // a Friday

describe("days and times", () => {
  it("understands today, tomorrow, weekdays and dates", () => {
    expect(parseDay("today", today)).toBe("2026-11-13");
    expect(parseDay("Tomorrow", today)).toBe("2026-11-14");
    expect(parseDay("monday", today)).toBe("2026-11-16");
    expect(parseDay("next fri", today)).toBe("2026-11-20"); // a weekday always means the next one
    expect(parseDay("2026-12-01", today)).toBe("2026-12-01");
    expect(parseDay("someday", today)).toBeNull();
    expect(parseDay("2026-02-30", today)).toBeNull();
  });

  it("understands times", () => {
    expect(parseTime("14:30")).toBe("14:30");
    expect(parseTime("9:05")).toBe("09:05");
    expect(parseTime("2pm")).toBe("14:00");
    expect(parseTime("12 am")).toBe("00:00");
    expect(parseTime("noon")).toBe("12:00");
    expect(parseTime("14")).toBeNull(); // too vague
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("13pm")).toBeNull();
  });
});

describe("finding things by name", () => {
  const projects = [
    { id: "1", name: "Chatoo Opticians" },
    { id: "2", name: "Check Financials" },
    { id: "3", name: "Europa Group International" },
  ];

  it("finds by id, exact name or part of the name", () => {
    expect(pickByName(projects, "2", "project")).toEqual({ item: projects[1] });
    expect(pickByName(projects, "chatoo opticians", "project")).toEqual({ item: projects[0] });
    expect(pickByName(projects, "europa", "project")).toEqual({ item: projects[2] });
  });

  it("adds ids when several have the same name", () => {
    const twins = [{ id: "a1", name: "Plan" }, { id: "b2", name: "Plan" }];
    const r = pickByName(twins, "plan", "note");
    expect("error" in r && r.error).toMatch(/Plan \(id a1\), Plan \(id b2\)/);
    expect(pickByName(twins, "b2", "note")).toEqual({ item: twins[1] });
  });

  it("asks which one when several match, and lists options when none do", () => {
    const several = pickByName(projects, "ch", "project");
    expect("error" in several && several.error).toMatch(/More than one project.*Chatoo Opticians, Check Financials/);
    const none = pickByName(projects, "Zebra", "project");
    expect("error" in none && none.error).toMatch(/No project called "Zebra".*Europa Group International/);
  });
});

describe("text into notes", () => {
  it("makes paragraphs, headings, bullets and tick boxes", () => {
    const doc = textToDoc("# Plan\nFirst line\n\n- one\n- two\n[ ] call Ali\n[x] send brief");
    expect(doc.content.map((b) => b.type)).toEqual(["heading", "paragraph", "bulletList", "taskList"]);
    expect(doc.content[3].content?.map((i) => i.attrs?.checked)).toEqual([false, true]);
    expect(docText(doc)).toBe("Plan\nFirst line\none\ntwo\ncall Ali\nsend brief");
  });

  it("makes an empty page from empty text", () => {
    expect(textToDoc("").content).toEqual([{ type: "paragraph" }]);
  });

  it("cuts long text and says so", () => {
    expect(clip("abcdef", 3)).toMatch(/^abc\n… \(cut short: 3 more characters\)$/);
    expect(clip("abc", 3)).toBe("abc");
  });
});

describe("the connector protocol", () => {
  const tools: ToolDefinition[] = [
    { name: "echo", title: "Echo", description: "", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  ];
  const call = async (name: string, args: Record<string, unknown>) => ({ text: `${name}:${JSON.stringify(args)}`, data: args });

  it("says hello with a protocol version both sides know", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, tools, call);
    expect(r).toMatchObject({ id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "projecthub" } } });
    const old = await handleRpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, tools, call);
    expect(old).toMatchObject({ result: { protocolVersion: SUPPORTED_VERSIONS[0] } });
  });

  it("lists tools and runs them", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/list" }, tools, call)).toMatchObject({ result: { tools } });
    const r = await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "echo", arguments: { a: 1 } } }, tools, call);
    expect(r).toMatchObject({ result: { content: [{ type: "text", text: 'echo:{"a":1}' }], structuredContent: { result: { a: 1 } }, isError: false } });
  });

  it("refuses unknown tools and methods, and doesn't reply to notifications", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope" } }, tools, call)).toMatchObject({ error: { code: -32602 } });
    expect(await handleRpc({ jsonrpc: "2.0", id: 6, method: "secrets/list" }, tools, call)).toMatchObject({ error: { code: -32601 } });
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, tools, call)).toBeNull();
  });

  it("turns a tool crash into a polite error, without details", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "echo" } }, tools, async () => {
      throw new Error("database password is hunter2");
    });
    expect(JSON.stringify(r)).not.toContain("hunter2");
    expect(r).toMatchObject({ result: { isError: true } });
  });

  it("only accepts JSON-RPC 2.0 messages", () => {
    expect(isRpcMessage({ jsonrpc: "2.0", method: "ping", id: 1 })).toBe(true);
    expect(isRpcMessage({ method: "ping" })).toBe(false);
    expect(isRpcMessage("ping")).toBe(false);
  });
});
