// Dump the data before anything destroys it.
//
// This exists because `supabase db reset` reinitialises the cluster and takes
// every unsaved script with it. The framework is reproducible — it lives in
// seed.sql — but what you have WRITTEN is not, and the tool offered no way back
// from a command that is otherwise routine.
//
// Wired in front of `db:reset` so the safe thing happens by default. The raw
// command is still there as `db:reset:hard` for when the data genuinely does
// not matter.
//
// Node rather than a shell one-liner: the repo is developed on Windows, and
// timestamped redirection behaves differently in cmd, PowerShell and Git Bash.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const CONTAINER = "supabase_db_content-system";
const DIR = "supabase/backups";
/** Enough history to undo a mistake; not so much that it becomes a junk drawer. */
const KEEP = 20;

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = join(DIR, `${stamp}.sql`);

let dump;
try {
  dump = execFileSync(
    "docker",
    [
      "exec",
      CONTAINER,
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      "postgres",
      // Data only: the schema comes from migrations and the framework from
      // seeds. What is irreplaceable is the rows.
      "--data-only",
      // Restorable in any order without tripping foreign keys.
      "--disable-triggers",
      "--column-inserts",
    ],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
} catch (err) {
  // A stopped database is not a reason to block the command that is about to
  // start one — but it IS a reason to say so loudly rather than continue in
  // silence, which is exactly how the last script went missing.
  console.error(`\n  ⚠  Could not back up: ${err.message.split("\n")[0]}`);
  console.error(`     If the database is running and holds work you care about, stop now.\n`);
  process.exit(0);
}

mkdirSync(DIR, { recursive: true });
writeFileSync(file, dump, "utf8");

// Trim the oldest, keeping the most recent KEEP.
const old = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({ f, t: statSync(join(DIR, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)
  .slice(KEEP);

for (const { f } of old) unlinkSync(join(DIR, f));

const kb = Math.round(dump.length / 1024);
console.log(`  ✓ Backed up to ${file} (${kb} KB)`);
console.log(`    Restore with: pnpm db:restore ${file}`);
