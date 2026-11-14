#!/usr/bin/env node
// Checks your setup and tells you what's missing, in order. Never prints secrets.
//
//   npm run doctor                        → checks .env.local
//   npm run doctor -- --file .env.docker  → checks another settings file
//   npm run doctor -- --offline           → only checks the file (no network)
import { c, checks, readEnvFile } from "./lib.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const file = arg("--file") ?? ".env.local";
const offline = process.argv.includes("--offline");
let failed = 0;
let warned = 0;
const ok = (s) => console.log(c.ok(s));
const bad = (s, fix) => {
  failed++;
  console.log(c.bad(s));
  if (fix) console.log(`    ${c.dim("→")} ${fix}`);
};
const warn = (s, fix) => {
  warned++;
  console.log(c.warn(s));
  if (fix) console.log(`    ${c.dim("→")} ${fix}`);
};
const section = (s) => console.log(`\n${c.bold(s)}`);

async function get(url, headers = {}) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: null, error: err instanceof Error ? err.message : String(err) };
  }
}

console.log(c.bold(`ProjectHub doctor — checking ${file}`));

// ---------------------------------------------------------------- 1. Computer
section("1. This computer");
const major = Number(process.versions.node.split(".")[0]);
if (major >= 22) ok(`Node.js ${process.versions.node}`);
else bad(`Node.js ${process.versions.node} is too old`, "Install Node.js 22 LTS from nodejs.org");

// ---------------------------------------------------------------- 2. Settings
section("2. Settings file");
const env = readEnvFile(file);
if (!env) {
  bad(`${file} not found`, `Run: npm run setup${file === ".env.local" ? "" : file === ".env.docker" ? " -- --for docker" : ""}`);
  finish();
}
const need = [
  ["NEXT_PUBLIC_SUPABASE_URL", checks.supabaseUrl],
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", checks.publishableKey],
  ["SUPABASE_SECRET_KEY", checks.secretKey],
  ["SITE_URL", checks.siteUrl],
];
for (const [key, check] of need) {
  const value = env[key];
  if (!value) bad(`${key} is missing`, "Run: npm run setup");
  else if (check(value)) bad(`${key}: ${check(value)}`);
  else ok(key);
}
if (env.SETUP_TOKEN && checks.setupToken(env.SETUP_TOKEN)) bad(`SETUP_TOKEN: ${checks.setupToken(env.SETUP_TOKEN)}`);

const smtp = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"].filter((k) => env[k]);
if (smtp.length === 3) ok(`Email: Gmail/SMTP (${env.SMTP_HOST})`);
else if (smtp.length) bad(`Email: SMTP is half set up (have ${smtp.join(", ")})`, "Fill in SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD, or remove them");
else if (env.RESEND_API_KEY && env.EMAIL_FROM) ok("Email: Resend");
else warn("Email isn't set up (optional)", "Invite links will be shown for you to copy. See docs/OPTIONAL-FEATURES.md → Email");

const recorderKeys = ["RECALL_API_KEY", "RECALL_REGION", "RECALL_WEBHOOK_SECRET", "ANTHROPIC_API_KEY"];
const recorder = recorderKeys.filter((k) => env[k]);
if (recorder.length === 4) {
  const problems = [
    checks.recallRegion(env.RECALL_REGION) && `RECALL_REGION: ${checks.recallRegion(env.RECALL_REGION)}`,
    checks.webhookSecret(env.RECALL_WEBHOOK_SECRET) && `RECALL_WEBHOOK_SECRET: ${checks.webhookSecret(env.RECALL_WEBHOOK_SECRET)}`,
    checks.anthropicKey(env.ANTHROPIC_API_KEY) && `ANTHROPIC_API_KEY: ${checks.anthropicKey(env.ANTHROPIC_API_KEY)}`,
  ].filter(Boolean);
  if (problems.length) problems.forEach((p) => bad(p));
  else ok("Meeting recorder settings");
} else if (recorder.length) {
  bad(`Meeting recorder is half set up (missing ${recorderKeys.filter((k) => !env[k]).join(", ")})`, "See docs/OPTIONAL-FEATURES.md → Meeting recorder");
} else {
  warn("Meeting recorder isn't set up (optional)");
}

if (offline) finish();

// ---------------------------------------------------------------- 3. Supabase
section("3. Supabase");
const base = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const pub = { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "" };
const sec = { apikey: env.SUPABASE_SECRET_KEY ?? "", Authorization: `Bearer ${env.SUPABASE_SECRET_KEY ?? ""}` };

const settings = await get(`${base}/auth/v1/settings`, pub);
if (settings.status === 0) {
  bad(`Can't reach ${base}`, `Check the Project URL, your internet connection, and that the project isn't paused (Supabase dashboard → Restore). ${settings.error ?? ""}`);
  finish();
} else if (settings.status === 401 || settings.status === 403) {
  bad("The publishable key was refused", "Copy it again from Supabase → Project Settings → API Keys");
} else if (settings.status !== 200) {
  bad(`Supabase answered ${settings.status}`, "Is the project paused? Open it in the Supabase dashboard");
} else {
  ok("Supabase is reachable and the publishable key works");
  if (settings.body?.disable_signup === false) {
    bad("Anyone can sign up to your Supabase project", 'Supabase → Authentication → Sign In / Providers → turn OFF "Allow new users to sign up"');
  } else ok("Public sign-ups are off (invite-only)");
}

const users = await get(`${base}/auth/v1/admin/users?page=1&per_page=1`, sec);
if (users.status === 200) ok("The secret key works");
else bad("The secret key was refused", "Copy it again from Supabase → Project Settings → API Keys → Secret keys");

// The newest database change adds these columns; if they're there, every change is applied.
const latest = await get(`${base}/rest/v1/profiles?select=id,can_create_projects&limit=1`, sec);
const recorderTable = await get(`${base}/rest/v1/meeting_recordings?select=id&limit=1`, sec);
if (latest.status === 200 && recorderTable.status === 200) ok("Database is up to date (all migrations applied)");
else if (latest.status === 404 || latest.body?.code === "PGRST205" || latest.body?.code === "42P01") {
  bad("The database is empty (no ProjectHub tables yet)", "Run: npx supabase link --project-ref YOUR_REF   then   npx supabase db push --remote");
} else if (latest.status === 400 || recorderTable.status !== 200) {
  bad("The database is missing the newest changes", "Run: npx supabase db push --remote");
} else {
  bad(`Couldn't check the database (answer ${latest.status})`, 'Supabase → Project Settings → Data API: "Enable Data API" must be ON');
}

const bucket = await get(`${base}/storage/v1/bucket/project-files`, sec);
if (bucket.status === 200 && bucket.body?.public === false) ok("File storage is set up and private");
else if (bucket.status === 200) bad("The project-files bucket is PUBLIC", "Supabase → Storage → project-files → make it private");
else if (latest.status === 200) bad("The project-files storage bucket is missing", "Run: npx supabase db push --remote");

if (latest.status === 200) {
  const admins = await get(`${base}/rest/v1/profiles?select=id&role=eq.admin&limit=1`, sec);
  const hasAdmin = Array.isArray(admins.body) && admins.body.length > 0;
  if (hasAdmin && env.SETUP_TOKEN) warn("Your first admin exists, but SETUP_TOKEN is still set", "Delete the SETUP_TOKEN line (here and in your hosting settings)");
  else if (hasAdmin) ok("First admin account exists");
  else if (env.SETUP_TOKEN) warn("No admin yet", `Start the app and open ${env.SITE_URL ?? ""}/setup with the SETUP_TOKEN from ${file}`);
  else bad("No admin yet and no SETUP_TOKEN", "Run: npm run setup (it creates one)");
}

// ---------------------------------------------------------------- 4. Optional services
if (recorder.length === 4) {
  section("4. Meeting recorder services");
  const recall = await get(`https://${env.RECALL_REGION}.recall.ai/api/v1/bot/`, { Authorization: `Token ${env.RECALL_API_KEY}` });
  if (recall.status === 200) ok(`Recall.ai key works (${env.RECALL_REGION})`);
  else if (recall.status === 401 || recall.status === 403) bad("Recall.ai refused the key", "Check RECALL_API_KEY and that RECALL_REGION matches the region you signed up in");
  else bad(`Couldn't check Recall.ai (answer ${recall.status || recall.error})`);
  const claude = await get("https://api.anthropic.com/v1/models?limit=1", { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" });
  if (claude.status === 200) ok("Anthropic API key works");
  else if (claude.status === 401) bad("Anthropic refused the key", "Create a new key at console.anthropic.com → API Keys");
  else bad(`Couldn't check the Anthropic key (answer ${claude.status || claude.error})`);
  if (env.SITE_URL?.startsWith("http://localhost")) {
    warn("On localhost Recall.ai can't reach your webhook", "That's fine for testing: keep the Meeting recorder page open and it checks by itself");
  }
}

finish();

function finish() {
  console.log("");
  if (failed) console.log(c.bad(c.bold(`${failed} thing${failed === 1 ? "" : "s"} to fix`) + (warned ? `, ${warned} optional` : "")));
  else if (warned) console.log(c.ok(c.bold("Ready")) + c.dim(` (${warned} optional thing${warned === 1 ? "" : "s"} not set up)`));
  else console.log(c.ok(c.bold("Everything is ready")));
  process.exit(failed ? 1 : 0);
}
