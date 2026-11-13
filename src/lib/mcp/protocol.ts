// The Model Context Protocol (MCP) messages the Claude connector exchanges
// with ProjectHub: JSON-RPC 2.0 over plain HTTP POSTs, answered with JSON
// (the "stateless Streamable HTTP" style, so no sessions or open streams).
// Pure: the tools themselves are passed in. Unit-tested in tests/unit/mcp.test.ts.

export const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export type ToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  annotations: ToolAnnotations;
};

export type ToolResult = { text: string; data?: unknown; isError?: boolean };

export type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
export type RpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

export const SERVER_INFO = { name: "projecthub", title: "ProjectHub", version: "1.0.0" };

const INSTRUCTIONS =
  "ProjectHub is the user's private project workspace. You act as the signed-in user and can only see " +
  "the projects they can open. Use list_projects to find projects, list_todos / add_todo / update_todo " +
  "for to-dos, list_meetings / add_meeting for the calendar, and search, list_notes, read_note, add_note " +
  "and add_to_note for notes. Dates are in the user's time zone (about_me gives today's date). " +
  "You can only change notes the user wrote. Confirm with the user before changing several things at once.";

function error(id: RpcRequest["id"], code: number, message: string): RpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

// Is this a JSON-RPC request or notification we can read?
export function isRpcMessage(value: unknown): value is RpcRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as RpcRequest).jsonrpc === "2.0" &&
    typeof (value as RpcRequest).method === "string"
  );
}

// Answers one message. Returns null for notifications (no reply needed).
export async function handleRpc(
  msg: RpcRequest,
  tools: ToolDefinition[],
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>,
): Promise<RpcResponse | null> {
  const isNotification = msg.id === undefined;
  if (isNotification) return null;
  const id = msg.id ?? null;

  switch (msg.method) {
    case "initialize": {
      const asked = typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools } };
    case "tools/call": {
      const name = msg.params?.name;
      const args = msg.params?.arguments ?? {};
      if (typeof name !== "string" || !tools.some((t) => t.name === name)) {
        return error(id, -32602, `Unknown tool: ${String(name)}`);
      }
      if (typeof args !== "object" || args === null || Array.isArray(args)) {
        return error(id, -32602, "Tool arguments must be an object.");
      }
      try {
        const r = await callTool(name, args as Record<string, unknown>);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: r.text }],
            ...(r.data !== undefined && !r.isError ? { structuredContent: { result: r.data } } : {}),
            isError: Boolean(r.isError),
          },
        };
      } catch (e) {
        console.error("Connector tool failed:", name, e instanceof Error ? e.message : e);
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: "Something went wrong in ProjectHub. Try again." }], isError: true },
        };
      }
    }
    case "resources/list":
      return { jsonrpc: "2.0", id, result: { resources: [] } };
    case "prompts/list":
      return { jsonrpc: "2.0", id, result: { prompts: [] } };
    default:
      return error(id, -32601, `Method not found: ${msg.method}`);
  }
}
