// Loading everyone with an account, and open invitations, for the People page.
// Only for admins: the page checks the role before calling this.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type Role = Database["public"]["Enums"]["app_role"];

export type Person = {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  role: Role;
  projectIds: string[];
  has2fa: boolean;
  lastSignIn: string | null;
  joinedAt: string;
  setUp: boolean; // false = opened an invite (or a link checker did) but never chose a username
  canCreateProjects: boolean; // switched on by an admin (admins can always)
  canUseMeetingBot: boolean;
};

export type PendingInvite = {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  projectIds: string[];
  lastSentAt: string;
  expired: boolean;
  oldLink: boolean; // made before invite links changed: needs Resend
};

export async function getPeople() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const [profiles, members, invites, users] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, full_name, role, created_at, must_change_password, can_create_projects, can_use_meeting_bot"),
    supabase.from("project_members").select("project_id, user_id"),
    supabase
      .from("invitations")
      .select("id, email, full_name, role, project_ids, last_sent_at, expires_at, user_id, token_hash")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    // Emails, sign-ins and 2FA live in Supabase Auth, which only the secret key can list.
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (profiles.error || members.error || invites.error || users.error) throw new Error("Couldn't load people.");

  const authById = new Map(users.data.users.map((u) => [u.id, u]));
  const projectsByUser = new Map<string, string[]>();
  for (const m of members.data) projectsByUser.set(m.user_id, [...(projectsByUser.get(m.user_id) ?? []), m.project_id]);

  // Accounts made by an invite that hasn't been accepted yet are shown as invites, not people.
  const pendingUserIds = new Set(
    invites.data.filter((i) => i.user_id && !authById.get(i.user_id)?.email_confirmed_at).map((i) => i.user_id!),
  );

  const people: Person[] = profiles.data
    .filter((p) => !pendingUserIds.has(p.id))
    .map((p) => {
      const u = authById.get(p.id);
      return {
        id: p.id,
        name: p.full_name || p.username || u?.email || "Unnamed",
        username: p.username,
        email: u?.email ?? null,
        role: p.role,
        projectIds: projectsByUser.get(p.id) ?? [],
        has2fa: (u?.factors ?? []).some((f) => f.status === "verified"),
        lastSignIn: u?.last_sign_in_at ?? null,
        joinedAt: p.created_at,
        setUp: Boolean(p.username) && !p.must_change_password,
        canCreateProjects: p.can_create_projects,
        canUseMeetingBot: p.can_use_meeting_bot,
      };
    })
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "admin" ? -1 : 1));

  const now = new Date().toISOString();
  const pending: PendingInvite[] = invites.data.map((i) => ({
    id: i.id,
    email: i.email,
    fullName: i.full_name,
    role: i.role,
    projectIds: i.project_ids,
    lastSentAt: i.last_sent_at,
    expired: i.expires_at < now,
    oldLink: !i.token_hash,
  }));

  return { people, pending };
}

// Everyone you could add to a project (for the project's Members tab).
export async function getAddablePeople(projectId: string) {
  const supabase = await createClient();
  const [profiles, members] = await Promise.all([
    supabase.from("profiles").select("id, username, full_name, role"),
    supabase.from("project_members").select("user_id").eq("project_id", projectId),
  ]);
  const inProject = new Set((members.data ?? []).map((m) => m.user_id));
  return (profiles.data ?? [])
    .filter((p) => p.role !== "admin" && !inProject.has(p.id) && p.username) // admins already see every project; no username = invite not accepted yet
    .map((p) => ({ id: p.id, name: p.full_name || p.username || "Unnamed", username: p.username }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
