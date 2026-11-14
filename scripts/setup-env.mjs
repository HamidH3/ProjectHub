#!/usr/bin/env node
// Creates your settings file by asking a few questions.
//
//   npm run setup                     → .env.local (running on your own computer, or for Vercel)
//   npm run setup -- --for docker     → .env.docker (Docker)
//   npm run setup -- --for kubernetes → deploy/kubernetes/secret.env (+ tells you what to put in configmap.yaml)
//
// Secrets are typed hidden and only ever written to that file (which Git ignores).
import { existsSync, writeFileSync, copyFileSync } from "node:fs";
import { c, checks, newToken, prompter, readEnvFile } from "./lib.mjs";

const target = (() => {
  const i = process.argv.indexOf("--for");
  return i === -1 ? "local" : process.argv[i + 1];
})();
const FILES = { local: ".env.local", docker: ".env.docker", kubernetes: "deploy/kubernetes/secret.env" };
if (!FILES[target]) {
  console.log(c.bad(`Unknown --for ${target}. Use local, docker or kubernetes.`));
  process.exit(1);
}
const file = FILES[target];

console.log(c.bold(`\nProjectHub settings → ${file}\n`));
console.log("You'll need your Supabase project open: Project Settings → API Keys and → Data API (Project URL).");
console.log(c.dim("Press Enter to accept a [suggested] value. Hidden answers aren't shown as you type or paste.\n"));

const p = prompter();
const old = readEnvFile(file) ?? {};
if (existsSync(file)) {
  if (!(await p.yes(c.warn(`${file} already exists. Replace it (a backup is kept)?`)))) {
    console.log("Nothing changed.");
    p.close();
    process.exit(0);
  }
}

const v = {};
console.log(c.bold("\n1. Supabase (required)"));
v.NEXT_PUBLIC_SUPABASE_URL = await p.ask("Project URL", { fallback: old.NEXT_PUBLIC_SUPABASE_URL, check: checks.supabaseUrl });
v.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = await p.ask("Publishable key (sb_publishable_…)", {
  fallback: old.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  check: checks.publishableKey,
});
v.SUPABASE_SECRET_KEY = await p.ask("Secret key (sb_secret_…)", { secret: true, fallback: old.SUPABASE_SECRET_KEY, check: checks.secretKey });

console.log(c.bold("\n2. Your site"));
v.SITE_URL = await p.ask("The address people will open", {
  fallback: old.SITE_URL || (target === "local" ? "http://localhost:3000" : ""),
  check: checks.siteUrl,
});
v.SETUP_TOKEN = old.SETUP_TOKEN && old.SETUP_TOKEN.length >= 32 ? old.SETUP_TOKEN : newToken();
console.log(c.info("A one-time SETUP_TOKEN was created for making your first admin account (it's in the file)."));

console.log(c.bold("\n3. Email for invites and password resets (optional)"));
console.log(c.dim("Without it the app still works: invite links are shown for you to copy and send yourself."));
if (await p.yes("Set up email now?", Boolean(old.SMTP_HOST || old.RESEND_API_KEY))) {
  if (await p.yes("Use Gmail (free, needs a Gmail app password)? Choose No for Resend.", true)) {
    v.SMTP_HOST = "smtp.gmail.com";
    v.SMTP_PORT = "465";
    v.SMTP_USER = await p.ask("Gmail address", { fallback: old.SMTP_USER, check: (x) => (/^\S+@\S+\.\S+$/.test(x) ? null : "An email address") });
    v.SMTP_PASSWORD = await p.ask("Gmail app password (16 letters, spaces don't matter)", {
      secret: true,
      fallback: old.SMTP_PASSWORD,
      check: (x) => (x.replace(/\s/g, "").length === 16 ? null : "App passwords are 16 letters (myaccount.google.com/apppasswords)"),
    });
    v.SMTP_PASSWORD = v.SMTP_PASSWORD.replace(/\s/g, "");
  } else {
    v.RESEND_API_KEY = await p.ask("Resend API key (re_…)", { secret: true, fallback: old.RESEND_API_KEY, check: (x) => (/^re_\w{10,}$/.test(x) ? null : "Should start with re_") });
    v.EMAIL_FROM = await p.ask('From address, e.g. "ProjectHub <hello@yourdomain.com>"', { fallback: old.EMAIL_FROM, check: checks.required });
  }
}

console.log(c.bold("\n4. Meeting recorder (optional)"));
console.log(c.dim("A bot joins Teams/Zoom/Meet calls and Claude writes notes. Needs Recall.ai and an Anthropic API key (both pay as you go)."));
if (await p.yes("Set up the meeting recorder now?", Boolean(old.RECALL_API_KEY))) {
  v.RECALL_API_KEY = await p.ask("Recall.ai API key", { secret: true, fallback: old.RECALL_API_KEY, check: checks.recallKey });
  v.RECALL_REGION = await p.ask("Recall.ai region", { fallback: old.RECALL_REGION || "eu-central-1", check: checks.recallRegion });
  v.RECALL_WEBHOOK_SECRET = await p.ask("Recall.ai workspace verification secret (whsec_…)", { secret: true, fallback: old.RECALL_WEBHOOK_SECRET, check: checks.webhookSecret });
  v.ANTHROPIC_API_KEY = await p.ask("Anthropic API key (sk-ant-…)", { secret: true, fallback: old.ANTHROPIC_API_KEY, check: checks.anthropicKey });
}
p.close();

// --- Write the file
const PUBLIC_OR_CONFIG = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SITE_URL", "RECALL_REGION"];
const sections = [
  [target === "kubernetes" ? "Supabase secret key (the public values go into the image when you build it)." : "Supabase. The two NEXT_PUBLIC_ values are public (they go into the browser code).", ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]],
  ["Your site's address (no slash at the end), and the one-time token for /setup.", ["SITE_URL", "SETUP_TOKEN"]],
  ["Email (optional).", ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "RESEND_API_KEY", "EMAIL_FROM"]],
  ["Meeting recorder (optional).", ["RECALL_API_KEY", "RECALL_REGION", "RECALL_WEBHOOK_SECRET", "ANTHROPIC_API_KEY"]],
];
const lines = [
  `# ProjectHub settings, written by "npm run setup". NEVER commit or share this file.`,
  target === "kubernetes"
    ? `# Created ${new Date().toISOString().slice(0, 10)}. Used by: kubectl apply -k deploy/kubernetes`
    : `# Created ${new Date().toISOString().slice(0, 10)}. Check it any time with: npm run doctor${target === "local" ? "" : ` -- --file ${file}`}`,
];
for (const [title, keys] of sections) {
  const present = keys.filter((k) => v[k] !== undefined && !(target === "kubernetes" && PUBLIC_OR_CONFIG.includes(k)));
  if (!present.length) continue;
  lines.push("", `# ${title}`);
  for (const k of present) lines.push(`${k}=${v[k]}`);
}
const backedUp = existsSync(file);
if (backedUp) copyFileSync(file, `${file}.bak`);
writeFileSync(file, `${lines.join("\n")}\n`, { mode: 0o600 });
console.log("");
console.log(c.ok(`Saved ${file}${backedUp ? ` (the old one is kept as ${file}.bak)` : ""}.`));

// --- What next
if (target === "kubernetes") {
  console.log(c.bold("\nNow put these (not secret) in deploy/kubernetes/configmap.yaml:"));
  console.log(`  SITE_URL: "${v.SITE_URL}"`);
  if (v.RECALL_REGION) console.log(`  RECALL_REGION: "${v.RECALL_REGION}"`);
  console.log(c.bold("…and build the image with:"));
  console.log(`  docker build -t YOUR_REGISTRY/projecthub:1.0.0 --build-arg NEXT_PUBLIC_SUPABASE_URL=${v.NEXT_PUBLIC_SUPABASE_URL} --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${v.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY} .`);
} else if (target === "docker") {
  console.log(c.bold("\nNext:"), "npm run doctor -- --file .env.docker   then   docker compose --env-file .env.docker up -d --build");
} else {
  console.log(c.bold("\nNext:"), "npm run doctor   (checks everything and tells you what's left)");
}
