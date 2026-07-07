/**
 * Applies ./drizzle/*.sql migrations in order, tracked in _migrations.
 * Works against Neon (DATABASE_URL) and the local PGlite dev database.
 *   npx tsx scripts/migrate.ts
 */
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const dir = path.resolve("drizzle");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  let query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  let exec: (sql: string) => Promise<void>;
  let close: () => Promise<void>;

  if (url) {
    const pool = new Pool({ connectionString: url, max: 2 });
    query = async (sql, params) => ({ rows: (await pool.query(sql, params as never[])).rows });
    exec = async (sql) => {
      await pool.query(sql);
    };
    close = () => pool.end();
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    fs.mkdirSync(path.resolve(".data/pg"), { recursive: true });
    const lite = new PGlite("./.data/pg");
    query = async (sql, params) => ({ rows: (await lite.query(sql, params as never[])).rows as unknown[] });
    exec = async (sql) => {
      await lite.exec(sql);
    };
    close = () => lite.close();
  }

  await exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const applied = new Set(((await query("SELECT name FROM _migrations")).rows as Array<{ name: string }>).map((r) => r.name));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8").split("--> statement-breakpoint").join(";\n");
    await exec(sql);
    await query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
    console.log("applied", file);
  }
  console.log(`migrations up to date (${files.length} total) — target: ${url ? "postgres" : "pglite ./.data/pg"}`);
  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
