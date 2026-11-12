// Looking up an invite from its link. Uses the secret-key client because the
// person opening the link isn't signed in yet (invitations are admin-only).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashInviteCode, inviteState, isInviteCode, type InviteState } from "@/lib/invite-code";

export type FoundInvite = {
  state: InviteState;
  inviteId?: string;
  userId?: string;
  email?: string;
  fullName?: string | null;
  inviterName?: string | null;
};

export async function findInvite(code: unknown): Promise<FoundInvite> {
  if (!isInviteCode(code)) return { state: "invalid" };
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("invitations")
    .select("id, email, full_name, user_id, invited_by, expires_at, revoked_at")
    .eq("token_hash", hashInviteCode(code))
    .maybeSingle();
  if (!invite) return { state: "invalid" };

  const [{ data: profile }, { data: inviter }] = await Promise.all([
    invite.user_id
      ? admin.from("profiles").select("username, must_change_password").eq("id", invite.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    invite.invited_by
      ? admin.from("profiles").select("full_name, username").eq("id", invite.invited_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    state: inviteState(invite, profile),
    inviteId: invite.id,
    userId: invite.user_id ?? undefined,
    email: invite.email,
    fullName: invite.full_name,
    inviterName: inviter?.full_name || inviter?.username || null,
  };
}
