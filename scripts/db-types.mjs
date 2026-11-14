#!/usr/bin/env node
// Regenerates src/types/database.ts from the linked Supabase project (run it
// after every "db push"). Writes plain UTF-8 on every system, including
// Windows PowerShell, whose ">" would otherwise save the file in a format the
// build can't read.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const result = spawnSync("npx", ["supabase", "gen", "types", "typescript", "--remote"], {
  encoding: "utf8",
  shell: process.platform === "win32",
  stdio: ["inherit", "pipe", "inherit"],
  maxBuffer: 20 * 1024 * 1024,
});
if (result.status !== 0 || !result.stdout.includes("export type")) {
  console.error("✗ Couldn't generate the types. Is the project linked? Run: npx supabase link --project-ref YOUR_REF");
  process.exit(1);
}
writeFileSync("src/types/database.ts", result.stdout, "utf8");
console.log("✓ src/types/database.ts updated");
