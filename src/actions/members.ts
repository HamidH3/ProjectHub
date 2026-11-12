"use server";

// Server actions for people and access. Every action here is for admins only:
// each checks the role up front for a clear message, and the database rules
// check it again. The secret-key client is used only for Supabase Auth's own
// admin functions (creating sign-up links, deleting accounts, looking up an
// email); table changes go through your normal session so the rules apply.
import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/audit";
import { rateLimit, UNAVAILABLE_MESSAGE } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/request";
import { inviteEmail, resetEmail, sendEmail, type SendResult } from "@/lib/email";
import { idSchema, inviteSchema, roleSchema, type InviteInput } from "@/lib/validation/members";
import { INVITE_DAYS, newInviteCode } from "@/lib/invite-code";

type Fail = { ok: false; error: string };
type Ok<T = object> = { ok: true } & T;
export type LinkResult = Ok<{ link: string; email: SendResult }> | Fail;
export type PlainResult = Ok | Fail;

const NOT_ALLOWED: Fail = { ok: false, error: "Only an administrator can do that." };

async function requireAdmin(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user.role === "admin" ? user : null;
}

function refresh() {
  revalidatePath("/", "layout");
}

function displayName(user: CurrentUser) {
  return user.fullName || user.username || "An administrator";
}

// A password reset link. It opens a page with a "Continue" button (see
// /continue), so link checkers in email and chat apps can't use it up.
async function makeResetLink(email: string) {
  const admin = createAdminClient();
  const site = await getSiteUrl();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${site}/update-password` } });
  if (error || !data?.properties?.hashed_token) return { error: error ?? new Error("No link returned") };
  const link = `${site}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery&next=${encodeURIComponent("/update-password")}`;
  return { link };
}

// Gives an invitation a fresh link (/invite/<code>) that works for 7 days.
// Any earlier link for it stops working.
async function issueInviteLink(inviteId: string) {
  const supabase = await createClient();
  const site = await getSiteUrl();
  const { code, hash } = newInviteCode();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  const { error } = await supabase
    .from("invitations")
    .update({ token_hash: hash, last_sent_at: new Date().toISOString(), expires_at: expiresAt.toISOString() })
    .eq("id", inviteId);
  if (error) return null;
  return { link: `${site}/invite/${code}`, expiresAt };
}

// "Thursday 19 November 2026", in the admin's time zone.
function longDate(date: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

// Sends the invitation email from the admin (their name as the sender, replies to them).
async function sendInvite(
  admin: CurrentUser,
  to: { email: string; fullName: string | null; isAdmin: boolean },
  issued: { link: string; expiresAt: Date },
  renewal: boolean,
) {
  return sendEmail({
    to: to.email,
    senderName: displayName(admin),
    replyTo: admin.email,
    ...inviteEmail({
      link: issued.link,
      inviterName: displayName(admin),
      inviterEmail: admin.email,
      recipientName: to.fullName,
      recipientEmail: to.email,
      expiresOn: longDate(issued.expiresAt, admin.timezone),
      isAdmin: to.isAdmin,
      renewal,
    }),
  });
}

// Makes the (not yet usable) account an invite is for. No email is sent by
// Supabase; the person gets in through the invite link.
async function createInvitedAccount(email: string, fullName: string | null) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: fullName ? { full_name: fullName } : {},
  });
  if (error || !data.user) return { error: error ?? new Error("No account returned") };
  // They choose their own password on the welcome page before anything else.
  await admin.from("profiles").update({ must_change_password: true }).eq("id", data.user.id);
  return { userId: data.user.id };
}

// -----------------------------------------------------------------------------
// Invitations
// -----------------------------------------------------------------------------
export async function inviteUser(input: InviteInput): Promise<LinkResult> {
  const user = await requireAdmin();
  if (!user) return NOT_ALLOWED;
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { email, fullName, role, projectIds } = parsed.data;

  const limit = await rateLimit(`invite:${user.id}`, 30, 60 * 60);
  if (limit === "unavailable") return { ok: false, error: UNAVAILABLE_MESSAGE };
  if (limit === "limited") return { ok: false, error: "That's a lot of invites. Try again in an hour." };

  const supabase = await createClient();
  // The invitation is saved first: when the account is created, the database
  // reads the role and projects from it (and from nowhere else).
  const { data: invite, error: inviteError } = await supabase
    .from("invitations")
    .insert({
      email,
      full_name: fullName,
      role,
      project_ids: role === "admin" ? [] : projectIds,
      invited_by: user.id,
      expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  if (inviteError || !invite) {
    if (inviteError?.code === "23505") return { ok: false, error: "That email already has an open invite. Use Resend in the list below." };
    return { ok: false, error: "Couldn't create the invite." };
  }

  const account = await createInvitedAccount(email, fullName);
  if ("error" in account) {
    await supabase.from("invitations").delete().eq("id", invite.id);
    const exists = (account.error as { code?: string }).code === "email_exists";
    return {
      ok: false,
      error: exists
        ? "That email already has an account. Find them in the list below to change their access."
        : "Couldn't create the account. Try again.",
    };
  }
  await supabase.from("invitations").update({ user_id: account.userId }).eq("id", invite.id);

  const issued = await issueInviteLink(invite.id);
  if (!issued) return { ok: false, error: "Couldn't create the invite link. Use Resend in the list below." };

  const sent = await sendInvite(user, { email, fullName, isAdmin: role === "admin" }, issued, false);
  await logActivity({ actorId: user.id, action: "user.invited", entityType: "invitation", entityId: invite.id, metadata: { email, role } });
  refresh();
  return { ok: true, link: issued.link, email: sent };
}

export async function resendInvite(inviteId: string): Promise<LinkResult> {
  const user = await requireAdmin();
  if (!user) return NOT_ALLOWED;
  if (!idSchema.safeParse(inviteId).success) return { ok: false, error: "Invite not found." };
  const limit = await rateLimit(`invite:${user.id}`, 30, 60 * 60);
  if (limit !== "allowed") return { ok: false, error: limit === "limited" ? "Too many invites. Try again in an hour." : UNAVAILABLE_MESSAGE };

  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("invitations")
    .select("id, email, full_name, role, user_id, accepted_at, revoked_at")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite || invite.accepted_at || invite.revoked_at) return { ok: false, error: "That invite is no longer open." };

  // The account may be missing (e.g. invited before this version): make it.
  let userId = invite.user_id;
  if (userId) {
    const { data } = await createAdminClient().auth.admin.getUserById(userId);
    if (!data.user) userId = null;
  }
  if (!userId) {
    const account = await createInvitedAccount(invite.email, invite.full_name);
    if ("error" in account) {
      const exists = (account.error as { code?: string }).code === "email_exists";
      return { ok: false, error: exists ? "That email already has an account." : "Couldn't create the account. Try again." };
    }
    userId = account.userId;
    await supabase.from("invitations").update({ user_id: userId }).eq("id", invite.id);
  }

  const issued = await issueInviteLink(invite.id);
  if (!issued) return { ok: false, error: "Couldn't create a new link. Try again." };
  const sent = await sendInvite(user, { email: invite.email, fullName: invite.full_name, isAdmin: invite.role === "admin" }, issued, true);
  await logActivity({ actorId: user.id, action: "user.invite_resent", entityType: "invitation", entityId: invite.id });
  refresh();
  return { ok: true, link: issued.link, email: sent };
}

// For someone whose invite was opened (often by an email or chat app checking
// the link) but who never finished setting up: a fresh sign-up link.
export async function newSetupLink(userId: string): Promise<LinkResult> {
  const user = await requireAdmin();
  if (!user) return NOT_ALLOWED;
  if (!idSchema.safeParse(userId).success) return { ok: false, error: "Person not found." };
  const limit = await rateLimit(`invite:${user.id}`, 30, 60 * 60);
  if (limit !== "allowed") return { ok: false, error: limit === "limited" ? "Too many invites. Try again in an hour." : UNAVAILABLE_MESSAGE };

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("username, must_change_password").eq("id", userId).maybeSingle();
  if (!profile) return { ok: false, error: "Person not found." };
  if (profile.username && !profile.must_change_password) return { ok: false, error: "They've already set up their account. Send a password reset link instead." };

  const { data: invite } = await supabase
    .from("invitations")
    .select("id, email, full_name, role")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!invite) return { ok: false, error: "No invite found for them. Remove them and invite them again." };

  const issued = await issueInviteLink(invite.id);
  if (!issued) return { ok: false, error: "Couldn't create a new link. Try again." };
  const sent = await sendInvite(user, { email: invite.email, fullName: invite.full_name, isAdmin: invite.role === "admin" }, issued, true);
  await logActivity({ actorId: user.id, action: "user.setup_link_created", entityType: "user", entityId: userId });
  refresh();
  return { ok: true, link: issued.link, email: sent };
}

// Cancels the invite and removes the unused account it created, so the link
// stops working.
export async function cancelInvite(inviteId: string): Promise<PlainResult> {
  const user = await requireAdmin();
  if (!user) return NOT_ALLOWED;
  if (!idSchema.safeParse(inviteId).success) return { ok: false, error: "Invite not found." };

  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("invitations")
    .select("id, email, user_id, accepted_at")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite || invite.accepted_at) return { ok: false, error: "That invite is no longer open." };

  const { error } = await supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", invite.id);
  if (error) return { ok: false, error: "Couldn't cancel the invite." };

  if (invite.user_id) {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(invite.user_id);
    // Only remove the account if they never used the link.
    if (data.user && !data.user.email_confirmed_at) await admin.auth.admin.deleteUser(invite.user_id);
  }
  await logActivity({ actorId: user.id, action: "user.invite_cancelled", entityType: "invitation", entityId: invite.id, metadata: { email: invite.email } });
  refresh();
  return { ok: true };
}

// -----------------------------------------------------------------------------
// People
// -----------------------------------------------------------------------------
export async function changeRole(userId: string, role: string): Promise<PlainResult> {
  const user = await requireAdmin();
  if (!user) return NOT_ALLOWED;
  const parsedRole = roleSchema.safeParse(role);
  if (!idSchema.safeParse(userId).success || !parsedRole.success) return { ok: false, error: "Check the details and try again." };
  if (userId === user.id) return { ok: false, error: "You can't change your own role. Ask another administrator." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ role: parsedRole.data }).eq("id", userId).select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't change their role." };
  await logActivity({ actorId: user.id, action: "user.role_changed", entityType: "user", entityId: userId, metadata: { role: parsedRole.data } });
  refresh();
  return { ok: true };
}

// Sets exactly which projects someone can open (admins can open all anyway).
export async function setUserProjects(userId: string, projectIds: string[]): Promise<PlainResult> {
  const user = await requireAdmin();
  if (!user) return NOT_ALLOWED;
  if (!idSchema.safeParse(userId).success || !projectIds.every((id) => idSchema.safeParse(id).success)) {
    return { ok: false, error: "Check the details and try again." };
  }

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("project_members").select("project_id").eq("user_id", userId);
  if (readError) return { ok: false, error: "Couldn't load their projects." };
  const have = new Set(current.map((m) => m.project_id));
  const want = new Set(projectIds);
  const add = [...want].filter((id) => !have.has(id));
  const remove = [...have].filter((id) => !want.has(id));

  if (add.length) {
    const { error } = await supabase
      .from("project_members")
      .insert(add.map((project_id) => ({ project_id, user_id: userId, added_by: user.id })));
    if (error) return { ok: false, error: "Couldn't add them to every project." };
  }
  if (remove.length) {
    const { error } = await supabase.from("project_members").delete().eq("user_id", userId).in("project_id", remove);
    if (error) return { ok: false, error: "Couldn't remove them from every project." };
  }
  await logActivity({ actorId: user.id, action: "user.projects_changed", entityType: "user", entityId: userId, metadata: { added: add, removed: remove } });
  refresh();
  return { ok: true };
}

// Deletes the account completely. Their notes, to-dos and files stay in the
// projects; they just show no author.
export async function removeUser(userId: string): Promise<PlainResult> {
  const user = await requireAdmin();
  if (!user) return NOT_ALLOWED;
  if (!idSchema.safeParse(userId).success) return { ok: false, error: "Person not found." };
  if (userId === user.id) return { ok: false, error: "You can't remove your own account." };

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  if (!data.user) return { ok: false, error: "Person not found." };
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: "Couldn't remove them. Try again." };
  await logActivity({ actorId: user.id, action: "user.removed", entityType: "user", entityId: userId, metadata: { email: data.user.email ?? null } });
  refresh();
  return { ok: true };
}

// A password reset link for someone (emailed if email is set up; shown to you either way).
export async function sendPasswordReset(userId: string): Promise<LinkResult> {
  const user = await requireAdmin();
  if (!user) return NOT_ALLOWED;
  if (!idSchema.safeParse(userId).success) return { ok: false, error: "Person not found." };
  const limit = await rateLimit(`admin-reset:${user.id}`, 20, 60 * 60);
  if (limit !== "allowed") return { ok: false, error: limit === "limited" ? "Too many resets. Try again in an hour." : UNAVAILABLE_MESSAGE };

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  const email = data.user?.email;
  if (!email) return { ok: false, error: "Person not found." };
  const made = await makeResetLink(email);
  if ("error" in made) return { ok: false, error: "Couldn't create a reset link." };
  const sent = await sendEmail({
    to: email,
    senderName: displayName(user),
    replyTo: user.email,
    ...resetEmail({ link: made.link, requestedBy: displayName(user) }),
  });
  await logActivity({ actorId: user.id, action: "user.reset_link_created", entityType: "user", entityId: userId });
  return { ok: true, link: made.link, email: sent };
}

// -----------------------------------------------------------------------------
// A project's Members tab
// -----------------------------------------------------------------------------
export async function addProjectMembers(projectId: string, userIds: string[]): Promise<PlainResult> {
  const user = await requireAdmin();
  if (!user) return NOT_ALLOWED;
  if (!idSchema.safeParse(projectId).success || !userIds.length || !userIds.every((id) => idSchema.safeParse(id).success)) {
    return { ok: false, error: "Choose who to add." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .upsert(userIds.map((user_id) => ({ project_id: projectId, user_id, added_by: user.id })), { ignoreDuplicates: true });
  if (error) return { ok: false, error: "Couldn't add them to the project." };
  await logActivity({ actorId: user.id, action: "project.members_added", projectId, entityType: "project", entityId: projectId, metadata: { userIds } });
  refresh();
  return { ok: true };
}

export async function removeProjectMember(projectId: string, userId: string): Promise<PlainResult> {
  const user = await requireAdmin();
  if (!user) return NOT_ALLOWED;
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(userId).success) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  const { error } = await supabase.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId);
  if (error) return { ok: false, error: "Couldn't remove them from the project." };
  await logActivity({ actorId: user.id, action: "project.member_removed", projectId, entityType: "project", entityId: projectId, metadata: { userId } });
  refresh();
  return { ok: true };
}
