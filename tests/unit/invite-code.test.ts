// Invite links: random codes, stored only as fingerprints, and when a link
// still works.
import { describe, expect, it } from "vitest";
import { hashInviteCode, inviteState, isInviteCode, newInviteCode } from "@/lib/invite-code";

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();
const open = { revoked_at: null, expires_at: future, user_id: "u1" };
const notSetUp = { username: null, must_change_password: true };

describe("invite codes", () => {
  it("makes long random codes and stores only a fingerprint", () => {
    const a = newInviteCode();
    const b = newInviteCode();
    expect(a.code).not.toBe(b.code);
    expect(isInviteCode(a.code)).toBe(true);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(hashInviteCode(a.code));
    expect(a.hash).not.toContain(a.code);
  });

  it("refuses anything that isn't a code", () => {
    expect(isInviteCode("short")).toBe(false);
    expect(isInviteCode("../../etc/passwd")).toBe(false);
    expect(isInviteCode(`${"a".repeat(42)}!`)).toBe(false);
    expect(isInviteCode(undefined)).toBe(false);
  });
});

describe("when an invite link works", () => {
  it("works while the person hasn't set up their account", () => {
    expect(inviteState(open, notSetUp)).toBe("ok");
  });

  it("still works if a link checker (or the person) opened it but they didn't finish", () => {
    // Their email is confirmed by then, but no username yet: same link gets them back in.
    expect(inviteState(open, { username: null, must_change_password: true })).toBe("ok");
  });

  it("stops working once they've chosen a username and password", () => {
    expect(inviteState(open, { username: "tom", must_change_password: false })).toBe("used");
  });

  it("stops working when cancelled or expired", () => {
    expect(inviteState({ ...open, revoked_at: past }, notSetUp)).toBe("cancelled");
    expect(inviteState({ ...open, expires_at: past }, notSetUp)).toBe("expired");
  });

  it("is invalid when there's no invite or no account behind it", () => {
    expect(inviteState(null, null)).toBe("invalid");
    expect(inviteState({ ...open, user_id: null }, null)).toBe("invalid");
    expect(inviteState(open, null)).toBe("invalid");
  });
});
