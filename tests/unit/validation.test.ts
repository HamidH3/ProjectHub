// The rules forms are checked against on the server.
import { describe, expect, it } from "vitest";
import { emailSchema, passwordSchema, usernameSchema } from "@/lib/validation/auth";
import { inviteSchema, welcomeSchema } from "@/lib/validation/members";

describe("form rules", () => {
  it("tidies emails and refuses bad ones", () => {
    expect(emailSchema.parse("  Hamid@Example.COM ")).toBe("hamid@example.com");
    expect(emailSchema.safeParse("not an email").success).toBe(false);
  });

  it("only allows simple usernames", () => {
    expect(usernameSchema.parse("Hamid_3")).toBe("hamid_3");
    expect(usernameSchema.safeParse("ab").success).toBe(false);
    expect(usernameSchema.safeParse("has space").success).toBe(false);
    expect(usernameSchema.safeParse("ünïcode").success).toBe(false);
  });

  it("needs passwords of 12 to 72 characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("x".repeat(12)).success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(73)).success).toBe(false);
  });

  it("checks invites", () => {
    const ok = inviteSchema.parse({ email: "Tom@X.test", fullName: "  ", role: "member", projectIds: [] });
    expect(ok.email).toBe("tom@x.test");
    expect(ok.fullName).toBeNull();
    expect(inviteSchema.safeParse({ email: "tom@x.test", fullName: "", role: "owner", projectIds: [] }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "tom@x.test", fullName: "", role: "member", projectIds: ["not-an-id"] }).success).toBe(false);
  });

  it("needs matching passwords on the welcome page", () => {
    const base = { fullName: "Tom", username: "tom", password: "x".repeat(12) };
    expect(welcomeSchema.safeParse({ ...base, confirm: "y".repeat(12) }).success).toBe(false);
    expect(welcomeSchema.safeParse({ ...base, confirm: "x".repeat(12) }).success).toBe(true);
  });
});
