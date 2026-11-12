// Signs out and goes to the login page. Used when an account has been removed
// while its owner was still signed in: their login only lapses on its own after
// up to an hour, so this ends it straight away.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = request.nextUrl.searchParams.get("reason") === "removed" ? "?error=removed" : "";
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } });
}
