"use server";

// Server actions for the login screens. These run only on the server.
// Each one validates its input, applies a rate limit where it matters,
// and returns a short message for the form to show.
import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, UNAVAILABLE_MESSAGE } from "@/lib/rate-limit";
import { logActivity } from "@/lib/audit";
import { getRequestIp, getRequestOrigin, getSiteUrl } from "@/lib/request";
import { emailConfigured, resetEmail, sendEmail } from "@/lib/email";
import { welcomeSchema } from "@/lib/validation/members";
import { safeNextPath } from "@/lib/paths";
import {
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  setupSchema,
  type FormState,
} from "@/lib/validation/auth";

const GENERIC_LOGIN_ERROR = "That email/username or password is not correct.";

// Non-secret fields to refill after a failed attempt.
function keep(formData: FormData, ...names: string[]) {
  return Object.fromEntries(names.map((n) => [n, String(formData.get(n) ?? "")]));
}

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}

// Compares two secrets without leaking how many characters matched.
function secretsMatch(given: string, expected: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// -----------------------------------------------------------------------------
// One-time admin setup (/setup)
// -----------------------------------------------------------------------------
export async function setupAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = keep(formData, "fullName", "email", "username");
  const ip = await getRequestIp();
  const limit = await rateLimit(`setup:${ip}`, 5, 60 * 60);
  if (limit === "unavailable") return { error: UNAVAILABLE_MESSAGE, values };
  if (limit === "limited") {
    return { error: "Too many attempts. Try again in an hour.", values };
  }

  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error), values };
  const { token, email, username, fullName, password } = parsed.data;

  const expected = process.env.SETUP_TOKEN;
  if (!expected || expected.length < 32) {
    return { error: "Setup isn't configured. Add a SETUP_TOKEN of at least 32 characters to .env.local.", values };
  }
  if (!secretsMatch(token, expected)) {
    return { error: "That setup token is not correct.", values };
  }

  const admin = createAdminClient();

  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (countError || count === null) return { error: "Couldn't reach the database. Try again.", values };
  if ((count ?? 0) > 0) return { error: "Setup has already been completed. Sign in instead.", values };

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName },
  });
  if (createError || !created.user) {
    return { error: createError?.message ?? "Couldn't create the account.", values };
  }

  const { error: roleError } = await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", created.user.id);
  if (roleError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: "Couldn't finish setup, so nothing was saved. Try again.", values };
  }

  await logActivity({
    actorId: created.user.id,
    action: "admin.setup",
    entityType: "user",
    entityId: created.user.id,
  });

  redirect("/login?setup=done");
}

// -----------------------------------------------------------------------------
// Sign in with email or username (/login)
// -----------------------------------------------------------------------------
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = keep(formData, "identifier");
  const ip = await getRequestIp();
  const limit = await rateLimit(`login:${ip}`, 10, 15 * 60);
  if (limit === "unavailable") return { error: UNAVAILABLE_MESSAGE, values };
  if (limit === "limited") {
    return { error: "Too many sign-in attempts. Wait 15 minutes and try again.", values };
  }

  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error), values };
  const { identifier, password } = parsed.data;
  const next = safeNextPath(parsed.data.next);

  // A username is turned into its email on the server, so the browser never
  // learns anyone's email address.
  let email = identifier.toLowerCase();
  if (!identifier.includes("@")) {
    if (!/^[a-z0-9_]{3,30}$/.test(email)) return { error: GENERIC_LOGIN_ERROR, values };
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("username", email)
      .maybeSingle();
    if (!profile) return { error: GENERIC_LOGIN_ERROR, values };
    const { data: found } = await admin.auth.admin.getUserById(profile.id);
    if (!found?.user?.email) return { error: GENERIC_LOGIN_ERROR, values };
    email = found.user.email;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === "user_banned") {
      return { error: "This account has been deactivated. Contact the administrator.", values };
    }
    return { error: GENERIC_LOGIN_ERROR, values };
  }

  await logActivity({ actorId: data.user.id, action: "auth.login", metadata: { ip } });

  // data.user comes straight from Supabase's server, so its 2FA list can be trusted.
  const has2fa = (data.user.factors ?? []).some((f) => f.status === "verified");
  if (has2fa) {
    redirect(`/mfa?next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

// -----------------------------------------------------------------------------
// Sign out
// -----------------------------------------------------------------------------
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// -----------------------------------------------------------------------------
// Forgotten password: emails a reset link (/forgot-password)
// -----------------------------------------------------------------------------
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = keep(formData, "email");
  const ip = await getRequestIp();
  const limit = await rateLimit(`reset:${ip}`, 5, 60 * 60);
  if (limit === "unavailable") return { error: UNAVAILABLE_MESSAGE, values };
  if (limit === "limited") {
    return { error: "Too many requests. Try again in an hour.", values };
  }

  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error), values };

  const { email } = parsed.data;
  if (emailConfigured()) {
    // Our own email through Resend, with a link built from SITE_URL.
    const admin = createAdminClient();
    const site = await getSiteUrl();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${site}/update-password` },
    });
    if (!error && data.properties?.hashed_token) {
      const link = `${site}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery&next=%2Fupdate-password`;
      await sendEmail({ to: email, ...resetEmail({ link }) });
    }
    // An error here usually means there's no account with that email: say nothing.
  } else {
    // No email service set up yet: Supabase's built-in email (which only
    // delivers to your Supabase team's own addresses).
    const supabase = await createClient();
    const origin = await getRequestOrigin();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/confirm?next=/update-password`,
    });
    if (error && error.status !== 400) {
      console.error("Password reset email failed:", error.message);
    }
  }

  // Same answer whether or not the account exists, so this form can't be
  // used to discover who has an account.
  return { success: "If an account uses that email, a reset link is on its way. Check your inbox." };
}

// -----------------------------------------------------------------------------
// Set a new password (/update-password), after a reset or invite link,
// or when an admin has required a change.
// -----------------------------------------------------------------------------
export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "insufficient_aal") redirect("/mfa?next=/update-password");
    if (error.code === "same_password") return { error: "Choose a different password from your current one." };
    if (error.code === "weak_password") return { error: "That password is too weak. Make it longer or less common." };
    if (error.code === "reauthentication_needed") return { error: "Please sign in again, then change your password." };
    return { error: "Couldn't update your password. Try again." };
  }

  const admin = createAdminClient();
  await admin.from("profiles").update({ must_change_password: false }).eq("id", userId);
  await supabase.auth.signOut({ scope: "others" }); // sign out every other device
  await logActivity({ actorId: userId, action: "auth.password_changed", entityType: "user", entityId: userId });

  redirect("/");
}

// -----------------------------------------------------------------------------
// First visit after an invite (/welcome): choose your name, username and
// password.
// -----------------------------------------------------------------------------
export async function completeWelcome(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = keep(formData, "fullName", "username");
  const parsed = welcomeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error), values };
  const { fullName, username, password } = parsed.data;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName, username })
    .eq("id", userId);
  if (profileError) {
    if (profileError.code === "23505") return { error: "That username is taken. Try another.", values };
    return { error: "Couldn't save your details. Try again.", values };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password") return { error: "That password is too weak. Make it longer or less common.", values };
    return { error: "Couldn't save your password. Try again.", values };
  }

  const admin = createAdminClient();
  await admin.from("profiles").update({ must_change_password: false }).eq("id", userId);
  await logActivity({ actorId: userId, action: "auth.invite_accepted", entityType: "user", entityId: userId });
  redirect("/");
}
