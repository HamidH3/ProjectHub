// The single place pages ask "who is logged in, and are they allowed in?".
// Every page inside the logged-in area calls getCurrentUser().
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type CurrentUser = {
  id: string;
  email: string | null;
  username: string | null;
  fullName: string | null;
  role: Database["public"]["Enums"]["app_role"];
  timezone: string;
  // Extra powers an admin can switch on per person (admins always have them).
  canCreateProjects: boolean;
  canUseMeetingBot: boolean;
};

// cache() means repeated calls during one page load only check once.
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();

  // 1. Must be logged in (the session token is verified, not just read).
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) redirect("/login");

  // The questions below are asked at the same time (not one after another),
  // so every page opens faster. The answers are still checked in this order.
  const codeEntered = claims.aal === "aal2";
  const [userRes, profileRes, settingsRes] = await Promise.all([
    // Ask Supabase's server (not the cookie) whether this user has 2FA set up.
    codeEntered ? null : supabase.auth.getUser(),
    // The database only returns your own row here.
    supabase
      .from("profiles")
      .select("id, username, full_name, role, timezone, must_change_password, can_create_projects, can_use_meeting_bot")
      .eq("id", claims.sub)
      .maybeSingle(),
    codeEntered ? null : supabase.from("app_settings").select("require_mfa_for_all").maybeSingle(),
  ]);

  // 2. If 2FA is set up, the code must have been entered this session
  //    ("aal2" in the verified token means it was).
  if (!codeEntered) {
    const has2fa = (userRes?.data.user?.factors ?? []).some((f) => f.status === "verified");
    if (has2fa) redirect("/mfa");
  }

  // 3. No profile means the account was removed (or never finished being set
  //    up): sign them out and say so.
  const profile = profileRes.data;
  if (!profile) redirect("/auth/signout?reason=removed");

  // 4. A required password change comes before anything else. Someone who
  //    has just accepted an invite (no username yet) sets up their account.
  if (profile.must_change_password) redirect(profile.username ? "/update-password" : "/welcome");

  // 5. Admins (or everyone, if switched on in settings) must have 2FA.
  if (!codeEntered) {
    const required = profile.role === "admin" || (settingsRes?.data?.require_mfa_for_all ?? false);
    if (required) redirect("/mfa");
  }

  return {
    id: profile.id,
    email: typeof claims.email === "string" ? claims.email : null,
    username: profile.username,
    fullName: profile.full_name,
    role: profile.role,
    timezone: profile.timezone,
    canCreateProjects: profile.role === "admin" || profile.can_create_projects,
    canUseMeetingBot: profile.role === "admin" || profile.can_use_meeting_bot,
  };
});
