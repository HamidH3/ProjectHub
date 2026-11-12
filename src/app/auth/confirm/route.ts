// Handles links in emails.
// Links with a one-time token (password resets, older invites) are NOT used
// here: email and chat apps open links automatically to check them, which
// would use the token up before the person clicks. Instead this sends them to
// /continue, where pressing a button uses it.
import { NextResponse, type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/paths";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type) {
    const url = request.nextUrl.clone();
    url.pathname = "/continue";
    url.search = new URLSearchParams({ token_hash: tokenHash, type, next }).toString();
    return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }

  // Supabase's own emails (used when Resend isn't set up) send a one-time
  // code that only works in the browser that asked for it.
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  }

  redirect("/login?error=link");
}
