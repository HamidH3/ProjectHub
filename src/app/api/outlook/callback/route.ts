// Microsoft sends you back here after "Sign in with Microsoft". The answer must
// match the sign-in this browser started (same state, same person, within 10
// minutes); then the sign-in token is stored encrypted and your events are
// copied. You end up back in Settings with a message saying how it went.
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { getSiteUrl } from "@/lib/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/audit";
import { seal } from "@/lib/outlook/crypto";
import { OAUTH_COOKIE } from "@/lib/outlook/cookie";
import { accountLabel, exchangeCode, microsoftConfigured } from "@/lib/outlook/microsoft";
import { syncConnection } from "@/lib/outlook/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Why Microsoft said no, in one word for the Settings page. */
function reason(error: string, description: string): string {
  if (/AADSTS65001|AADSTS90094|AADSTS90095|admin/i.test(description) || error === "consent_required") return "admin";
  if (error === "access_denied") return "cancelled";
  return "failed";
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const site = await getSiteUrl();
  const back = (status: string) => {
    const res = NextResponse.redirect(`${site}/settings?outlook=${status}#outlook`);
    res.cookies.set(OAUTH_COOKIE, "", { path: "/api/outlook", maxAge: 0 });
    return res;
  };

  const params = request.nextUrl.searchParams;
  const [state, verifier, uid] = (request.cookies.get(OAUTH_COOKIE)?.value ?? "").split(".");
  if (!state || !verifier || uid !== user.id || !same(params.get("state") ?? "", state)) return back("expired");

  const error = params.get("error");
  if (error) return back(reason(error, params.get("error_description") ?? ""));
  const code = params.get("code");
  if (!code || !microsoftConfigured()) return back("failed");

  try {
    const tokens = await exchangeCode(code, verifier, `${site}/api/outlook/callback`);
    const label = await accountLabel(tokens.access).catch(() => null);
    const admin = createAdminClient();
    const { data, error: saveError } = await admin
      .from("calendar_connections")
      .upsert(
        {
          user_id: user.id,
          kind: "microsoft",
          label,
          secret: seal(tokens.refresh),
          status: "ok",
          last_error: null,
          last_synced_at: null,
        },
        { onConflict: "user_id,kind" },
      )
      .select("id, user_id, kind, secret, last_synced_at")
      .single();
    if (saveError || !data) throw new Error(saveError?.message ?? "not saved");
    // Signing in replaces a calendar link, so meetings don't show twice.
    await admin.from("calendar_connections").delete().eq("user_id", user.id).eq("kind", "link");
    await syncConnection(data as Parameters<typeof syncConnection>[0]);
    await logActivity({ actorId: user.id, action: "outlook.connected", entityType: "calendar", metadata: { kind: "microsoft" } });
    return back("connected");
  } catch (err) {
    console.error("Outlook sign-in failed:", err instanceof Error ? err.message : err);
    return back("failed");
  }
}
