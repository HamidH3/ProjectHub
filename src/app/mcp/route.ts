// The Claude connector's address: https://<your site>/mcp
//
// Claude (from Anthropic's servers) POSTs JSON-RPC messages here with the
// person's access token. No token, or a bad one → 401 with a pointer to how to
// sign in (that's what makes Claude open the ProjectHub sign-in page).
// See src/lib/mcp/* and PROJECTHUB.md → "Claude connector".
import { handleRpc, isRpcMessage, type RpcRequest, type RpcResponse } from "@/lib/mcp/protocol";
import { bearerToken, identifyCaller, protectedResourceMetadataUrl } from "@/lib/mcp/auth";
import { TOOLS, callTool, type ToolContext } from "@/lib/mcp/tools";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const MAX_BODY = 1_000_000; // 1 MB

function signInNeeded(request: Request, description = "Sign in to ProjectHub.") {
  const metadata = protectedResourceMetadataUrl(request);
  return new Response(JSON.stringify({ error: "invalid_token", error_description: description }), {
    status: 401,
    headers: {
      ...JSON_HEADERS,
      "WWW-Authenticate": `Bearer error="invalid_token", error_description="${description.replace(/"/g, "'")}", resource_metadata="${metadata}"`,
    },
  });
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return signInNeeded(request);

  const caller = await identifyCaller(token);
  if ("status" in caller && caller.status === 401) return signInNeeded(request, caller.message);
  // A 403-type problem (e.g. two-step sign-in): stay connected, but every tool
  // says what to do, so the person sees it in the chat.
  const ctx: ToolContext | null = "supabase" in caller ? caller : null;
  const problem = "status" in caller ? caller.message : null;

  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large." } }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Not valid JSON." } }, { status: 400 });
  }

  const messages: unknown[] = Array.isArray(body) ? body.slice(0, 20) : [body];
  const replies: RpcResponse[] = [];
  for (const m of messages) {
    if (!isRpcMessage(m)) {
      replies.push({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Not a JSON-RPC 2.0 message." } });
      continue;
    }
    const reply = await handleRpc(m as RpcRequest, TOOLS, async (name, args) => {
      if (!ctx) return { text: problem ?? "Sign in to ProjectHub again.", isError: true };
      // Up to 300 tool calls per person every 10 minutes.
      if ((await rateLimit(`mcp:${ctx.me.id}`, 300, 600)) === "limited") {
        return { text: "Too many requests to ProjectHub in a short time. Wait a few minutes and try again.", isError: true };
      }
      return callTool(name, args, ctx);
    });
    if (reply) replies.push(reply);
  }

  if (replies.length === 0) return new Response(null, { status: 202 }); // only notifications
  const payload = Array.isArray(body) ? replies : replies[0];
  return new Response(JSON.stringify(payload), { status: 200, headers: JSON_HEADERS });
}

// No server-to-client stream: everything is answered in the POST reply.
function noStream(request: Request) {
  if (!bearerToken(request)) return signInNeeded(request);
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
export const GET = noStream;
export const HEAD = noStream;
export const DELETE = noStream;
