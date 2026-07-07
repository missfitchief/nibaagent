import { drizzle as drizzleNodePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

/**
 * One drizzle API surface, two drivers:
 *  - DATABASE_URL set  -> node-postgres pool (Neon-compatible, `sslmode=require`
 *    handled by the connection string itself)
 *  - DATABASE_URL empty -> embedded PGlite persisted under ./.data/pg
 *    (local development only; production refuses to boot without a URL)
 *
 * Next.js dev hot-reloads modules, so the handle is cached on globalThis.
 */

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __nibaDb?: Db; __nibaDbReady?: Promise<void> };

function createDb(): Db {
  const e = env();
  if (e.DATABASE_URL) {
    const pool = new Pool({ connectionString: e.DATABASE_URL, max: 5 });
    return drizzleNodePg(pool, { schema }) as Db;
  }
  if (e.NODE_ENV === "production") throw new Error("DATABASE_URL is required in production");
  // Lazy import keeps pglite out of the production bundle path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("node:fs") as typeof import("node:fs")).mkdirSync("./.data/pg", { recursive: true });
  const pglite = new PGlite("./.data/pg");
  return drizzlePglite(pglite, { schema }) as unknown as Db;
}

export function db(): Db {
  if (!globalForDb.__nibaDb) globalForDb.__nibaDb = createDb();
  return globalForDb.__nibaDb;
}

export { schema };
