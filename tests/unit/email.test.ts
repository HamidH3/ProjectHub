// Invite and reset emails: how they look, that names can't inject anything,
// who they come from, and that nothing is sent when email isn't set up.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));

const { emailConfigured, emailSender, inviteEmail, resetEmail, sendEmail } = await import("@/lib/email");

const base = {
  link: "https://x.test/invite/abc?x=1&y=2",
  recipientName: "Tom",
  recipientEmail: "tom@x.test",
  expiresOn: "Thursday 19 November 2026",
};

function clearEmailEnv() {
  for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "RESEND_API_KEY", "EMAIL_FROM"]) vi.stubEnv(k, "");
}

describe("invitation email", () => {
  it("says they've been invited, when the link expires, and what happens next", () => {
    const m = inviteEmail(base);
    expect(m.subject).toBe("You have been invited to join ProjectHub");
    expect(m.text).toContain("Hi Tom,");
    expect(m.text).toContain("You have been invited to join ProjectHub");
    expect(m.text).toContain("Link expires: Thursday 19 November 2026 (7 days)");
    expect(m.text).toContain("What happens next");
    expect(m.html).toContain("Accept invitation");
  });

  it("doesn't name or show who sent it", () => {
    for (const m of [inviteEmail(base), inviteEmail({ ...base, renewal: true })]) {
      expect(m.html + m.text + m.subject).not.toMatch(/Invited by|on behalf of|Reply to this email/);
    }
  });

  it("has its own wording for a new link", () => {
    const m = inviteEmail({ ...base, renewal: true });
    expect(m.subject).toBe("Your new invitation to ProjectHub");
    expect(m.text).toContain("earlier invitation links have stopped working");
  });

  it("mentions two-step sign-in only for administrators", () => {
    expect(inviteEmail({ ...base, isAdmin: true }).text).toContain("two-step sign-in");
    expect(inviteEmail(base).text).not.toContain("two-step sign-in");
  });

  it("escapes names and links", () => {
    const m = inviteEmail({ ...base, recipientName: "<script>alert(1)</script>" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain('href="https://x.test/invite/abc?x=1&amp;y=2"');
    expect(m.text).toContain("https://x.test/invite/abc?x=1&y=2");
  });

  it("leaves project details out", () => {
    expect(inviteEmail(base).text).not.toMatch(/project:/i);
  });

  it("reset email can say which admin sent it", () => {
    expect(resetEmail({ link: "https://x.test", fromAdmin: true }).text).toContain("You have been sent a link");
    expect(resetEmail({ link: "https://x.test" }).subject).toBe("Reset your ProjectHub password");
  });
});

describe("sending", () => {
  beforeEach(() => {
    sendMail.mockReset();
    clearEmailEnv();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends nothing when email isn't set up", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(emailConfigured()).toBe(false);
    expect(emailSender()).toBeNull();
    expect(await sendEmail({ to: "a@b.test", subject: "s", html: "h", text: "t" })).toBe("not_configured");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends from your own mailbox (e.g. Gmail) with your name, replies to the admin", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_PORT", "465");
    vi.stubEnv("SMTP_USER", "me@gmail.test");
    vi.stubEnv("SMTP_PASSWORD", "app-password");
    sendMail.mockResolvedValue({});
    expect(emailSender()).toBe("me@gmail.test");
    expect(await sendEmail({ to: "tom@x.test", subject: "s", html: "h", text: "t", senderName: "Hamid Hafiz", replyTo: "boss@x.test" })).toBe("sent");
    const mail = sendMail.mock.calls[0][0];
    expect(mail.from).toEqual({ name: "Hamid Hafiz (ProjectHub)", address: "me@gmail.test" });
    expect(mail.replyTo).toBe("boss@x.test");
    expect(mail.to).toBe("tom@x.test");
  });

  it("doesn't let a name break the email headers", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "me@gmail.test");
    vi.stubEnv("SMTP_PASSWORD", "pw");
    sendMail.mockResolvedValue({});
    await sendEmail({ to: "t@x.test", subject: "s", html: "h", text: "t", senderName: 'Evil\r\nBcc: all@x.test "<>' });
    expect(sendMail.mock.calls[0][0].from.name).not.toMatch(/[\r\n"<>]/);
  });

  it("reports a wrong password instead of pretending it was sent", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "me@gmail.test");
    vi.stubEnv("SMTP_PASSWORD", "wrong");
    sendMail.mockRejectedValue(new Error("Invalid login: 535 Username and Password not accepted"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendEmail({ to: "t@x.test", subject: "s", html: "h", text: "t" })).toBe("failed");
  });

  it("can also send through Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "ProjectHub <p@x.test>");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await sendEmail({ to: "t@x.test", subject: "s", html: "h", text: "t", senderName: "Hamid", replyTo: "h@x.test" })).toBe("sent");
    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.from).toBe("Hamid (ProjectHub) <p@x.test>");
    expect(body.reply_to).toEqual(["h@x.test"]);
  });
});
