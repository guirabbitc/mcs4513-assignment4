// Applies every SQL file in db/migrations that has not been applied yet.
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { db, getMigrationLevel } from "../src/db.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations");

await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`);

const applied = new Set(
  (await db.query("SELECT version FROM schema_migrations")).rows.map((r) => r.version)
);

for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
  const version = file.replace(".sql", "");
  if (applied.has(version)) continue;
  await db.query("BEGIN");
  await db.query(await readFile(path.join(dir, file), "utf8"));
  await db.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
  await db.query("COMMIT");
  console.log(`applied ${version}`);
}

console.log(`Migration level: ${await getMigrationLevel()}`);
await db.end();
