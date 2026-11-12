// Invite and reset emails: names can't inject anything, and nothing is sent
// when email isn't set up.
import { afterEach, describe, expect, it, vi } from "vitest";
import { inviteEmail, resetEmail, sendEmail } from "@/lib/email";

describe("emails", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("escapes names and links", () => {
    const m = inviteEmail({ link: "https://x.test/a?b=1&c=2", inviterName: "Hamid", recipientName: "<script>alert(1)</script>" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain('href="https://x.test/a?b=1&amp;c=2"');
    expect(m.text).toContain("https://x.test/a?b=1&c=2");
  });

  it("leaves project details out", () => {
    const m = inviteEmail({ link: "https://x.test", inviterName: "Hamid", recipientName: "Tom" });
    expect(m.text).not.toMatch(/project:/i);
    expect(resetEmail({ link: "https://x.test" }).subject).toBe("Reset your ProjectHub password");
  });

  it("sends nothing when email isn't set up", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await sendEmail({ to: "a@b.test", subject: "s", html: "h", text: "t" })).toBe("not_configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a failure from Resend instead of pretending it was sent", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "ProjectHub <p@x.test>");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("domain not verified", { status: 403 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendEmail({ to: "a@b.test", subject: "s", html: "h", text: "t" })).toBe("failed");
  });
});
