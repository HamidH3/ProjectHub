// Sending emails (invites and password resets).
//
// Two ways to send, set up with environment variables (.env.local and Vercel):
//   1. Your own mailbox over SMTP, e.g. Gmail with an app password:
//        SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=you@gmail.com  SMTP_PASSWORD=<app password>
//      Emails then come from that mailbox, so replies go straight to you.
//   2. Resend (needs a domain you own): RESEND_API_KEY and EMAIL_FROM.
// If neither is set, nothing is sent and the People page shows the link so you
// can pass it on yourself.
//
// What goes into emails: the recipient's name and address, and the link. The
// admin who sent it is NOT named or shown (sender name is just "ProjectHub"). Project names and anything else in ProjectHub
// are deliberately left out.
import "server-only";
import nodemailer from "nodemailer";

export type SendResult = "sent" | "not_configured" | "failed";
type Provider = "smtp" | "resend" | null;

function provider(): Provider {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) return "smtp";
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return "resend";
  return null;
}

export function emailConfigured() {
  return provider() !== null;
}

// The plain address emails are sent from, for showing on the People page.
export function emailSender(): string | null {
  const p = provider();
  if (p === "smtp") return addressOnly(process.env.EMAIL_FROM || process.env.SMTP_USER!);
  if (p === "resend") return addressOnly(process.env.EMAIL_FROM!);
  return null;
}

function addressOnly(value: string): string {
  return (value.match(/<([^>]+)>/)?.[1] ?? value).trim();
}

// Names go into email headers: no line breaks or quotes allowed.
function headerSafe(value: string): string {
  return value.replace(/[\r\n"<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Shown as the sender's name, e.g. "Hamid Hafiz (ProjectHub)". */
  senderName?: string | null;
  /** Where replies go, e.g. the admin who sent the invite. */
  replyTo?: string | null;
};

export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const p = provider();
  if (!p) return "not_configured";

  const fromAddress = emailSender()!;
  const fromName = message.senderName ? `${headerSafe(message.senderName)} (ProjectHub)` : "ProjectHub";
  const replyTo = message.replyTo && message.replyTo.includes("@") ? addressOnly(message.replyTo) : undefined;

  try {
    if (p === "smtp") {
      const port = Number(process.env.SMTP_PORT || 465);
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465, // 465 = encrypted from the start; 587 upgrades with STARTTLS
        requireTLS: port !== 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
      await transport.sendMail({
        from: { name: fromName, address: fromAddress },
        to: message.to,
        replyTo: replyTo && replyTo !== fromAddress ? replyTo : undefined,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return "sent";
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to: [message.to],
        reply_to: replyTo ? [replyTo] : undefined,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Resend explains what's wrong (e.g. the sending domain isn't verified).
      console.error("Email not sent:", res.status, (await res.text()).slice(0, 300));
      return "failed";
    }
    return "sent";
  } catch (err) {
    // e.g. a wrong app password ("Invalid login") or the mail server can't be reached.
    console.error("Email not sent:", err instanceof Error ? err.message : err);
    return "failed";
  }
}

// -----------------------------------------------------------------------------
// Email designs. Built from tables with inline styles so they look right in
// Outlook, Gmail and phone mail apps. Everything we insert is escaped.
// -----------------------------------------------------------------------------
const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const ORANGE = "#d97757";
const INK = "#1f1f1f";
const MUTED = "#6b6b6b";

function emailLayout(opts: {
  preheader: string;
  title: string;
  intro: string[]; // paragraphs (plain text)
  button: { label: string; href: string };
  steps?: string[];
  details?: { label: string; value: string }[];
  footer: string[];
}) {
  const href = escape(opts.button.href);
  const p = (text: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK}">${escape(text)}</p>`;
  const steps = opts.steps?.length
    ? `<p style="margin:24px 0 8px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${MUTED}">What happens next</p>
       <ol style="margin:0 0 8px;padding-left:20px;font-size:14px;line-height:1.7;color:${INK}">${opts.steps.map((s) => `<li>${escape(s)}</li>`).join("")}</ol>`
    : "";
  const details = opts.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;background:#f7f5f2;border-radius:8px">
         <tr><td style="padding:14px 18px">${opts.details
           .map(
             (d) =>
               `<p style="margin:0;font-size:13px;line-height:1.8;color:${MUTED}">${escape(d.label)}: <span style="color:${INK}">${escape(d.value)}</span></p>`,
           )
           .join("")}</td></tr>
       </table>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#f1eee9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1eee9"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 4px 18px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:22px;height:22px;background:${ORANGE};border-radius:6px"></td>
        <td style="padding-left:10px;font-size:16px;font-weight:700;color:${INK}">ProjectHub</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:12px;padding:36px 36px 32px;border:1px solid #e7e2da">
      <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:${INK}">${escape(opts.title)}</h1>
      ${opts.intro.map(p).join("")}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr>
        <td style="border-radius:8px;background:${ORANGE}">
          <a href="${href}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escape(opts.button.label)}</a>
        </td>
      </tr></table>
      ${steps}
      ${details}
      <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:${MUTED}">If the button doesn't work, copy this link into your browser:<br><a href="${href}" style="color:${ORANGE};word-break:break-all">${href}</a></p>
    </td></tr>
    <tr><td style="padding:20px 8px 0">
      ${opts.footer.map((f) => `<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${MUTED}">${escape(f)}</p>`).join("")}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function textVersion(lines: (string | null | false | undefined)[]) {
  return lines.filter((l): l is string => typeof l === "string").join("\n\n");
}

export type InviteEmailInput = {
  link: string;
  recipientName: string | null;
  recipientEmail: string;
  expiresOn: string; // e.g. "Thursday 19 November 2026"
  isAdmin?: boolean;
  /** true when this replaces an earlier link (Resend / New sign-up link). */
  renewal?: boolean;
};

// Invites don't name the admin who sent them, or show their email address.
export function inviteEmail(o: InviteEmailInput) {
  const hello = o.recipientName ? `Hi ${o.recipientName},` : "Hello,";
  const intro = o.renewal
    ? [
        hello,
        "You have been sent a new link to join ProjectHub. Any earlier invitation links have stopped working, so please use the button below instead.",
      ]
    : [
        hello,
        "You have been invited to join ProjectHub, a private workspace for organising projects, notes, to-dos, meetings and files in one place.",
      ];
  const buttonLabel = o.renewal ? "Set up my account" : "Accept invitation";
  const steps = [
    `Click ${buttonLabel}, then press Continue on the page that opens.`,
    "Choose your name, a username and a password.",
    ...(o.isAdmin ? ["Set up two-step sign-in with an authenticator app (required for administrators)."] : []),
    "You'll go straight to your projects.",
  ];
  const footer = [
    `This invitation was sent to ${o.recipientEmail}. If you weren't expecting it, you can safely ignore this email: nothing is set up unless you accept.`,
    "For your security, don't forward this email: the link is personal to you.",
  ];
  const subject = o.renewal ? "Your new invitation to ProjectHub" : "You have been invited to join ProjectHub";

  return {
    subject,
    html: emailLayout({
      preheader: o.renewal ? "Here's your new link to set up your ProjectHub account." : "You have been invited to ProjectHub.",
      title: o.renewal ? "Your new invitation link" : "You're invited to ProjectHub",
      intro,
      button: { label: buttonLabel, href: o.link },
      steps,
      details: [
        { label: "Your email", value: o.recipientEmail },
        { label: "Link expires", value: `${o.expiresOn} (7 days)` },
      ],
      footer,
    }),
    text: textVersion([
      hello,
      intro[1],
      `Accept your invitation:\n${o.link}`,
      `What happens next:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      `Your email: ${o.recipientEmail}\nLink expires: ${o.expiresOn} (7 days)`,
      footer.join("\n"),
    ]),
  };
}

export function resetEmail(o: { link: string; fromAdmin?: boolean }) {
  const intro = o.fromAdmin
    ? "You have been sent a link to set a new ProjectHub password."
    : "Someone (hopefully you) asked to reset your ProjectHub password.";
  const footer = [
    "If you didn't ask for this, you can ignore this email: your password won't change.",
    "For your security, don't forward this email: the link is personal to you.",
  ];
  return {
    subject: "Reset your ProjectHub password",
    html: emailLayout({
      preheader: "Choose a new password for ProjectHub.",
      title: "Reset your password",
      intro: [intro, "Click the button below, then press the button on the page that opens to choose a new password."],
      button: { label: "Choose a new password", href: o.link },
      footer: ["The link works once, for a limited time.", ...footer],
    }),
    text: textVersion([intro, `Choose a new password:\n${o.link}`, "The link works once, for a limited time.", footer.join("\n")]),
  };
}
