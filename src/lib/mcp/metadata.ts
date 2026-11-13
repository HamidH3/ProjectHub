import "server-only";

// The two small "how do I sign in?" documents Claude reads before connecting
// (RFC 9728 and RFC 8414). Served under /.well-known/ (see src/app/.well-known).
import { MCP_PATH, authorizationServer, siteUrl } from "@/lib/mcp/auth";

const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" };

// "This connector is ProjectHub; sign in with ProjectHub's Supabase."
export function protectedResource(request: Request) {
  return Response.json(
    {
      resource: `${siteUrl(request)}${MCP_PATH}`,
      authorization_servers: [authorizationServer()],
      // Not "openid": ProjectHub doesn't need it, and it fails on projects still using the older HS256 key.
      scopes_supported: ["email", "profile"],
      bearer_methods_supported: ["header"],
      resource_name: "ProjectHub",
      resource_documentation: siteUrl(request),
    },
    { headers: CORS },
  );
}

// Some apps look for the sign-in server's details on this site too: pass
// Supabase's own document through unchanged.
export async function authorizationServerMetadata() {
  const issuer = authorizationServer();
  const base = issuer.replace(/\/auth\/v1$/, "");
  try {
    const res = await fetch(`${base}/.well-known/oauth-authorization-server/auth/v1`, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(String(res.status));
    return Response.json(await res.json(), { headers: CORS });
  } catch {
    return Response.json({ error: "Sign-in server not reachable" }, { status: 502 });
  }
}
