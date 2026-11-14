// Small shared helpers for the scripts in this folder (no extra packages).
import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";

export const c = {
  ok: (s) => `\x1b[32m✓\x1b[0m ${s}`,
  bad: (s) => `\x1b[31m✗\x1b[0m ${s}`,
  warn: (s) => `\x1b[33m!\x1b[0m ${s}`,
  info: (s) => `\x1b[36m›\x1b[0m ${s}`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

// Reads a .env-style file into an object (KEY=value; # comments; optional quotes).
export function readEnvFile(path) {
  if (!existsSync(path)) return null;
  const env = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

export function newToken(bytes = 36) {
  return randomBytes(bytes).toString("base64url");
}

// Asking questions in the terminal. ask(q, { secret: true }) hides what's typed.
export function prompter() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  let muted = false;
  const write = rl._writeToOutput?.bind(rl);
  if (write) {
    rl._writeToOutput = (s) => {
      if (!muted) return write(s);
      // keep the line tidy: only show the question, never the secret
      if (s.includes("\n") || s.includes("\r")) write("\n");
    };
  }
  // Lines are queued, so answers piped in all at once (e.g. in a script) aren't lost.
  const lines = rl[Symbol.asyncIterator]();
  const question = async (q) => {
    if (q) process.stdout.write(q);
    const { value, done } = await lines.next();
    if (done) {
      console.log("\nStopped: no more answers. Nothing was saved.");
      process.exit(1);
    }
    return value;
  };
  return {
    async ask(label, { secret = false, fallback = "", check } = {}) {
      for (;;) {
        const hint = fallback ? c.dim(secret ? " [Enter keeps the current one]" : ` [${fallback}]`) : "";
        process.stdout.write(`${label}${hint}${secret ? c.dim(" (hidden)") : ""}: `);
        muted = secret;
        const answer = (await question("")).trim() || fallback;
        muted = false;
        if (secret) process.stdout.write("\n");
        const problem = check ? check(answer) : null;
        if (!problem) return answer;
        console.log(c.bad(problem));
      }
    },
    async yes(label, fallback = false) {
      const answer = (await question(`${label} ${c.dim(fallback ? "[Y/n]" : "[y/N]")}: `)).trim().toLowerCase();
      return answer ? answer.startsWith("y") : fallback;
    },
    close: () => rl.close(),
  };
}

// --- Checks shared by setup and doctor (they never print the values themselves)
export const checks = {
  supabaseUrl: (v) =>
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(v) || /^https?:\/\/[^\s/]+(:\d+)?$/.test(v)
      ? null
      : "Should look like https://abcdefghijklmnop.supabase.co (no slash at the end)",
  publishableKey: (v) =>
    /^sb_publishable_[\w-]{10,}$/.test(v) || /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v)
      ? null
      : "Should start with sb_publishable_ (Supabase → Project Settings → API Keys)",
  secretKey: (v) =>
    /^sb_secret_[\w-]{10,}$/.test(v) || /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v)
      ? null
      : "Should start with sb_secret_ (Supabase → Project Settings → API Keys → Secret keys)",
  siteUrl: (v) =>
    !/^https?:\/\/[^\s]+$/.test(v)
      ? "Should start with https:// (or http://localhost:3000 on your own computer)"
      : v.endsWith("/")
        ? "Leave out the slash at the end"
        : v.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v)
          ? "Use https:// for anything other than localhost"
          : null,
  setupToken: (v) => (v.length >= 32 ? null : "Must be at least 32 characters"),
  required: (v) => (v ? null : "This one is needed"),
  recallKey: (v) => (v.length >= 20 ? null : "Paste the API key from the Recall.ai dashboard"),
  recallRegion: (v) =>
    ["us-west-2", "us-east-1", "eu-central-1", "ap-northeast-1"].includes(v)
      ? null
      : "One of: eu-central-1, us-west-2, us-east-1, ap-northeast-1",
  webhookSecret: (v) => (/^whsec_[A-Za-z0-9+/=]{16,}$/.test(v) ? null : "Should start with whsec_"),
  anthropicKey: (v) => (/^sk-ant-[\w-]{20,}$/.test(v) ? null : "Should start with sk-ant-"),
};
