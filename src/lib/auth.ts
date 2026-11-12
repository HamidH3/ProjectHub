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
};

// cache() means repeated calls during one page load only check once.
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();

  // 1. Must be logged in (the session token is verified, not just read).
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) redirect("/login");

  // 2. If 2FA is set up, the code must have been entered this session.
  //    "aal2" in the verified token means the code was entered. Otherwise ask
  //    Supabase's server (not the cookie) whether this user has 2FA set up.
  const codeEntered = claims.aal === "aal2";
  if (!codeEntered) {
    const { data: userData } = await supabase.auth.getUser();
    const has2fa = (userData.user?.factors ?? []).some((f) => f.status === "verified");
    if (has2fa) redirect("/mfa");
  }

  // 3. Load the profile (the database only returns your own row here).
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, full_name, role, timezone, must_change_password")
    .eq("id", claims.sub)
    .maybeSingle();

  if (!profile) {
    throw new Error("Your account has no profile. Ask the administrator to check it.");
  }

  // 4. A required password change comes before anything else.
  if (profile.must_change_password) redirect("/update-password");

  // 5. Admins (or everyone, if switched on in settings) must have 2FA.
  if (!codeEntered) {
    let required = profile.role === "admin";
    if (!required) {
      const { data: settings } = await supabase
        .from("app_settings")
        .select("require_mfa_for_all")
        .maybeSingle();
      required = settings?.require_mfa_for_all ?? false;
    }
    if (required) redirect("/mfa");
  }

  return {
    id: profile.id,
    email: typeof claims.email === "string" ? claims.email : null,
    username: profile.username,
    fullName: profile.full_name,
    role: profile.role,
    timezone: profile.timezone,
  };
});
