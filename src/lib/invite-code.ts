// Invite link codes: /invite/<code>. The code is 32 random bytes (43
// characters); only its SHA-256 fingerprint is stored in the database.
import { createHash, randomBytes } from "node:crypto";

export const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const INVITE_DAYS = 7;

export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function newInviteCode(): { code: string; hash: string } {
  const code = randomBytes(32).toString("base64url");
  return { code, hash: hashInviteCode(code) };
}

export function isInviteCode(value: unknown): value is string {
  return typeof value === "string" && INVITE_CODE_PATTERN.test(value);
}

export type InviteState = "ok" | "invalid" | "cancelled" | "expired" | "used";

// Whether an invite link can still be used. It keeps working until the
// person has chosen their username and password (so if they close the tab
// halfway, the same link still gets them back in), but not after.
export function inviteState(
  invite: { revoked_at: string | null; expires_at: string; user_id: string | null } | null,
  profile: { username: string | null; must_change_password: boolean } | null,
  now = new Date(),
): InviteState {
  if (!invite || !invite.user_id) return "invalid";
  if (invite.revoked_at) return "cancelled";
  if (profile && profile.username && !profile.must_change_password) return "used";
  if (new Date(invite.expires_at) <= now) return "expired";
  if (!profile) return "invalid";
  return "ok";
}

// What to tell someone whose invite link can't be used.
export const INVITE_PROBLEMS = {
  invalid: "This invite link isn't valid. Check you copied all of it, or ask for a new one.",
  cancelled: "This invite was cancelled. Ask the person who invited you for a new one.",
  expired: "This invite has expired. Ask the person who invited you to send a new one.",
  used: "This invite has already been used. Sign in with your username or email instead.",
} as const;
