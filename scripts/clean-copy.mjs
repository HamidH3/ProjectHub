#!/usr/bin/env node
// FOR THE OWNER: makes a clean copy of ProjectHub to hand to someone else
// (a buyer, a client), with none of your details, keys or data.
//
//   npm run clean-copy                      → ../projecthub-clean-YYYY-MM-DD
//   npm run clean-copy -- --out D:\handover → somewhere else
//
// What it does:
//   1. Copies only the project's own files (what Git tracks), so .env files,
//      node_modules, build output and your Git history are never included.
//   2. Leaves out owner-only files: OWNER-NOTES.md and the word list below.
//   3. Scans every copied file for your personal words (listed one per line
//      in .clean-copy-words.txt, which Git ignores) and for anything that looks
//      like a key or password. If it finds one, it stops and tells you where.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { c } from "./lib.mjs";

const WORDS_FILE = ".clean-copy-words.txt";
const NEVER_COPY = [
  /^OWNER-NOTES\.md$/,
  /^\.clean-copy-words\.txt$/,
  /^\.env(?!\.docker\.example$)/, // any .env file except the example
  /(^|\/)secret\.env$/,
  /\.bak$/,
  /^supabase\/\.(temp|branches)\//,
  /^\.vercel\//,
  /^\.claude\//,
];
const SECRET_PATTERNS = [
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{16,}/],
  ["Supabase project address", /\b[a-z]{20}\.supabase\.co\b/],
  ["Anthropic API key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["Webhook secret", /whsec_[A-Za-z0-9+/=]{20,}/],
  ["Resend API key", /\bre_[A-Za-z0-9]{20,}/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["Signed token (JWT)", /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};

// --- Your words
if (!existsSync(WORDS_FILE)) {
  writeFileSync(
    WORDS_FILE,
    [
      "# One word or phrase per line that must NOT appear in a copy you hand over.",
      "# Not case sensitive. Lines starting with # are ignored. This file is never copied.",
      "# For example: your name, usernames, email addresses, company name, your live",
      "# site's address, your Supabase project refs, your computer's user folder.",
      "",
    ].join("\n"),
  );
  console.log(c.warn(`Created ${WORDS_FILE}. Add your own details to it (one per line), then run this again.`));
  process.exit(1);
}
const words = readFileSync(WORDS_FILE, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
if (words.length === 0) {
  console.log(c.bad(`${WORDS_FILE} has no words in it yet. Add your name, emails, site address, Supabase refs…`));
  process.exit(1);
}

// --- Which files
let files;
try {
  files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((f) => existsSync(f));
} catch {
  console.log(c.bad("This needs Git and has to be run inside the project folder."));
  process.exit(1);
}
const copy = files.filter((f) => !NEVER_COPY.some((rule) => rule.test(f.replaceAll("\\", "/"))));

// --- Where to
const out = resolve(arg("--out") ?? join("..", `projecthub-clean-${new Date().toISOString().slice(0, 10)}`));
if (existsSync(out) && readdirSync(out).length > 0) {
  console.log(c.bad(`${out} already exists and isn't empty. Delete it first, or choose another place with --out.`));
  process.exit(1);
}
for (const f of copy) {
  mkdirSync(dirname(join(out, f)), { recursive: true });
  copyFileSync(f, join(out, f));
}
console.log(c.ok(`Copied ${copy.length} files to ${out} (left out ${files.length - copy.length}).`));

// --- Scan the copy
const findings = [];
const mask = (s) => (s.length <= 6 ? "…" : `${s.slice(0, 4)}…`);
for (const f of copy) {
  const buf = readFileSync(join(out, f));
  if (buf.subarray(0, 8000).includes(0)) continue; // a picture or other binary file
  const lines = buf.toString("utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const lower = line.toLowerCase();
    for (const w of words) if (lower.includes(w.toLowerCase())) findings.push(`${f}:${i + 1}  your word "${w}"`);
    for (const [label, re] of SECRET_PATTERNS) {
      const m = re.exec(line);
      if (m) findings.push(`${f}:${i + 1}  looks like a ${label} (${mask(m[0])})`);
    }
  });
}

if (findings.length) {
  console.log("");
  console.log(c.bad(c.bold(`NOT ready to hand over: ${findings.length} thing${findings.length === 1 ? "" : "s"} found`)));
  for (const f of findings.slice(0, 50)) console.log(`  ${f}`);
  if (findings.length > 50) console.log(`  …and ${findings.length - 50} more`);
  console.log(`\nFix them in your project (not in the copy), delete ${out}, and run this again.`);
  process.exit(1);
}

console.log("");
console.log(c.ok(c.bold("Clean: no personal details or keys found.")));
console.log(`\nTo zip it:`);
console.log(c.dim(process.platform === "win32" ? `  tar -a -c -f projecthub.zip -C "${out}" .` : `  (cd "${out}" && zip -qr ../projecthub.zip .)`));
console.log(`\nThe buyer starts from README.md. Before sending, also read the handover checklist in OWNER-NOTES.md.`);
