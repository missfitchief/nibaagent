import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/lib/db/schema";

/**
 * Fresh in-memory database per test file, migrated from the committed SQL.
 * Each test seeds its own businesses so isolation assertions are unambiguous.
 * We override the global db handle the app modules read.
 */
export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export async function makeDb(): Promise<TestDb> {
  const pg = new PGlite(); // in-memory
  const dir = path.resolve("drizzle");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8").split("--> statement-breakpoint").join(";\n");
    await pg.exec(sql);
  }
  const db = drizzle(pg, { schema }) as unknown as TestDb;
  // Point the app's db() at this instance.
  (globalThis as unknown as { __nibaDb?: unknown }).__nibaDb = db;
  return db;
}

let counter = 0;

export async function seedBusiness(db: TestDb, name: string) {
  counter += 1;
  const [user] = await db
    .insert(schema.users)
    .values({ email: `owner${counter}@test.local`, name, passwordHash: "x", role: "client" })
    .returning();
  const [business] = await db
    .insert(schema.businesses)
    .values({ ownerUserId: user.id, name, slug: `${name.toLowerCase()}-${counter}` })
    .returning();
  await db.insert(schema.botSettings).values({ businessId: business.id });
  return { user, business };
}
