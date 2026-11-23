// "Sign in with Microsoft" for the Outlook calendar: sends you to Microsoft
// with a one-time code (state + PKCE) kept in a short-lived cookie that only
// the callback can read. See /api/outlook/callback.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSiteUrl } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { microsoftConfigured, newSignInRequest } from "@/lib/outlook/microsoft";
import { OAUTH_COOKIE } from "@/lib/outlook/cookie";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser(); // signed in (and 2FA, if set up), or off to /login
  const site = await getSiteUrl();
  const back = (status: string) => NextResponse.redirect(`${site}/settings?outlook=${status}#outlook`);
  if (!microsoftConfigured()) return back("unavailable");
  if ((await rateLimit(`outlook-connect:${user.id}`, 20, 3600)) !== "allowed") return back("busy");

  const request = newSignInRequest(`${site}/api/outlook/callback`);
  const res = NextResponse.redirect(request.url);
  res.cookies.set(OAUTH_COOKIE, `${request.state}.${request.verifier}.${user.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/outlook",
    maxAge: 600,
  });
  return res;
}
