import "server-only";

// Who is calling the connector? Claude sends the access token it got when the
// person signed in and pressed "Allow" (Supabase's OAuth server issued it).
// We check the token, then use it as-is: the database sees that person and
// applies all its usual rules. No secret key is involved.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { personName } from "@/lib/schedule";
import { todayIn } from "@/lib/dates";
import type { Me, ToolContext } from "@/lib/mcp/tools";

export const MCP_PATH = "/mcp";

// The site's address, e.g. https://project-hub-five-psi.vercel.app (no trailing slash).
export function siteUrl(request: Request): string {
  const fromEnv = process.env.SITE_URL?.replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") throw new Error("SITE_URL must be set in production.");
  return new URL(request.url).origin; // laptop only
}

export function protectedResourceMetadataUrl(request: Request) {
  return `${siteUrl(request)}/.well-known/oauth-protected-resource${MCP_PATH}`;
}

// Supabase's OAuth server, which handles signing in and issuing tokens.
export function authorizationServer() {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, "")}/auth/v1`;
}

export type CallerProblem = { status: 401 | 403; error: "invalid_token" | "insufficient_scope"; message: string };

function userClient(token: string): SupabaseClient<Database> {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+([A-Za-z0-9\-_.~+/]+=*)$/i.exec(h.trim());
  return m ? m[1] : null;
}

// Checks the token and loads the person. Returns their tool context, or why not.
export async function identifyCaller(token: string): Promise<ToolContext | CallerProblem> {
  const supabase = userClient(token);
  const { data, error } = await supabase.auth.getClaims(token);
  const claims = data?.claims;
  if (error || !claims?.sub || claims.role !== "authenticated") {
    return { status: 401, error: "invalid_token", message: "Sign in to ProjectHub again." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, full_name, role, timezone, must_change_password")
    .eq("id", claims.sub)
    .maybeSingle();

  if (!profile) {
    // Either the account was removed, or two-step sign-in is set up and this
    // token doesn't show the code was entered (the database then hides
    // everything, even your own profile).
    if (claims.aal !== "aal2") {
      const { data: u } = await supabase.auth.getUser(token);
      if (u.user?.factors?.some((f) => f.status === "verified")) {
        return {
          status: 403,
          error: "insufficient_scope",
          message:
            "Your account uses two-step sign-in, and this connection didn't carry it. Disconnect and connect ProjectHub again in Claude's connector settings, entering your code when asked.",
        };
      }
    }
    return { status: 401, error: "invalid_token", message: "This ProjectHub account no longer exists." };
  }
  if (profile.must_change_password) {
    return { status: 403, error: "insufficient_scope", message: "Finish setting up your ProjectHub password on the website first." };
  }

  const me: Me = {
    id: profile.id,
    name: personName(profile),
    username: profile.username,
    role: profile.role,
    timezone: profile.timezone,
  };
  return { supabase, me, today: todayIn(profile.timezone) };
}
