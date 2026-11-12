"use server";

// Opening links from emails: invites (/invite/<code>) and password resets
// (/continue). These run only when the person presses "Continue", never when
// the link is merely opened, so link checkers in Outlook, Teams, WhatsApp
// etc. can't use the link up before the person gets to it.
import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findInvite } from "@/lib/invites";
import { logActivity } from "@/lib/audit";
import { rateLimit, UNAVAILABLE_MESSAGE } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request";
import { safeNextPath } from "@/lib/paths";
import { INVITE_PROBLEMS } from "@/lib/invite-code";

export type ContinueState = { error?: string } | undefined;


export async function acceptInvite(_prev: ContinueState, formData: FormData): Promise<ContinueState> {
  const ip = await getRequestIp();
  const limit = await rateLimit(`invite-accept:${ip}`, 20, 15 * 60);
  if (limit === "unavailable") return { error: UNAVAILABLE_MESSAGE };
  if (limit === "limited") return { error: "Too many tries. Wait a few minutes and try again." };

  const found = await findInvite(formData.get("code"));
  if (found.state !== "ok") return { error: INVITE_PROBLEMS[found.state] };

  const admin = createAdminClient();
  const { data: account } = await admin.auth.admin.getUserById(found.userId!);
  const email = account.user?.email;
  if (!account.user || !email) return { error: INVITE_PROBLEMS.invalid };

  // Opening the invite confirms their email address (this also marks the
  // invitation as accepted in the database).
  if (!account.user.email_confirmed_at) {
    const { error } = await admin.auth.admin.updateUserById(account.user.id, { email_confirm: true });
    if (error) return { error: "Couldn't open your invite. Try again in a moment." };
  }

  // Sign them in: make a one-time sign-in code and use it straight away, here
  // on the server, so it never leaves this request.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return { error: "Couldn't open your invite. Try again in a moment." };

  const supabase = await createClient();
  let { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error) ({ error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash }));
  if (error) {
    console.error("Invite sign-in failed:", error.message);
    return { error: "Couldn't sign you in. Try again, or ask for a new invite." };
  }

  await logActivity({ actorId: account.user.id, action: "auth.invite_opened", entityType: "invitation", entityId: found.inviteId });
  redirect("/welcome");
}

// Password reset (and other Supabase email) links: /continue?token_hash=…&type=…&next=…
const CONTINUE_TYPES: EmailOtpType[] = ["recovery", "invite", "email_change"];

export async function continueEmailLink(_prev: ContinueState, formData: FormData): Promise<ContinueState> {
  const tokenHash = formData.get("token_hash");
  const type = formData.get("type") as EmailOtpType | null;
  if (typeof tokenHash !== "string" || !tokenHash || tokenHash.length > 200 || !type || !CONTINUE_TYPES.includes(type)) {
    redirect("/login?error=link");
  }
  const next = safeNextPath(formData.get("next"), type === "recovery" ? "/update-password" : "/");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) redirect("/login?error=link");
  redirect(next);
}
