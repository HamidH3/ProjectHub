// Sending emails (invites and password resets) through Resend.
// Needs RESEND_API_KEY and EMAIL_FROM in .env.local (and in Vercel later).
// Without them nothing is sent, and the People page shows the link so you can
// pass it on yourself.
//
// What goes to Resend: the recipient's address, their name if you typed one,
// the inviter's name and the one-time link. Project names and anything else
// in ProjectHub are deliberately left out of emails.
import "server-only";

export type SendResult = "sent" | "not_configured" | "failed";

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(message: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return "not_configured";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Resend explains what's wrong (e.g. the sending domain isn't verified).
      console.error("Email not sent:", res.status, (await res.text()).slice(0, 300));
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("Email not sent:", err instanceof Error ? err.message : err);
    return "failed";
  }
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, paragraphs: string[], button: { label: string; href: string }, footer: string) {
  const href = escape(button.href);
  return `<!doctype html><html><body style="margin:0;background:#f4f1ec;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f1f1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-weight:600;color:#d97757">ProjectHub</p>
<h1 style="margin:0 0 16px;font-size:20px">${escape(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escape(p)}</p>`).join("")}
<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#d97757;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escape(button.label)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#6b6b6b;line-height:1.5">If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all">${href}</span></p>
<p style="margin:24px 0 0;font-size:13px;color:#6b6b6b;line-height:1.5">${escape(footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function inviteEmail(opts: { link: string; inviterName: string; recipientName: string | null }) {
  const hello = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi,";
  const intro = `${opts.inviterName} has invited you to ProjectHub. Click below to set up your account: you'll choose a username and a password.`;
  const footer = "The link works once and expires after a while. If it has expired, ask for a new invite. If you weren't expecting this, you can ignore it.";
  return {
    subject: `${opts.inviterName} invited you to ProjectHub`,
    html: layout("You're invited", [hello, intro], { label: "Set up my account", href: opts.link }, footer),
    text: `${hello}\n\n${intro}\n\n${opts.link}\n\n${footer}`,
  };
}

export function resetEmail(opts: { link: string }) {
  const intro = "Someone (hopefully you) asked to reset your ProjectHub password. Click below to choose a new one.";
  const footer = "The link works once and expires after a while. If you didn't ask for this, you can ignore this email: your password won't change.";
  return {
    subject: "Reset your ProjectHub password",
    html: layout("Reset your password", [intro], { label: "Choose a new password", href: opts.link }, footer),
    text: `${intro}\n\n${opts.link}\n\n${footer}`,
  };
}
