// Put a backup back.
//
// Takes a file written by backup.mjs and replays it into the running database.
// The dump is data-only with --column-inserts, so it re-inserts rows into a
// schema the migrations have already built.
//
//   pnpm db:restore                          most recent backup
//   pnpm db:restore supabase/backups/X.sql   a specific one
//
// Restoring on top of a freshly reset database is the intended path: migrations
// build the schema, seeds lay down the framework, this brings back what you
// wrote. Rows that already exist collide on their primary key and are reported
// rather than suppressed — ON_ERROR_STOP is off so one collision does not
// abandon the rest of the restore, but every one of them is printed.

import { spawnSync } from "node:child_process";
import { existsSync, openSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CONTAINER = "supabase_db_content-system";
const DIR = "supabase/backups";

/** Newest backup, unless one was named on the command line. */
function pick() {
  const explicit = process.argv[2];
  if (explicit) return explicit;
  if (!existsSync(DIR)) return null;

  const [newest] = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ path: join(DIR, f), t: statSync(join(DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  return newest?.path ?? null;
}

const file = pick();

if (!file) {
  console.error("  No backup found in supabase/backups. Nothing to restore.");
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`  No such backup: ${file}`);
  process.exit(1);
}

console.log(`  Restoring ${file} …`);

// The file is handed to psql as its stdin by file descriptor — no buffering the
// whole dump into memory, and the same `docker exec -i … psql` shape the
// db:seed and db:check scripts already use.
const stdin = openSync(file, "r");

const result = spawnSync(
  "docker",
  ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=0"],
  { stdio: [stdin, "inherit", "inherit"] },
);

if (result.error) {
  console.error(`  Restore failed: ${result.error.message}`);
  process.exit(1);
}

console.log("  ✓ Restore finished. Read any errors above — they are real conflicts.");
process.exit(result.status ?? 0);
