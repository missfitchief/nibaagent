/**
 * Seeds the hidden admin user from env (ADMIN_EMAIL + ADMIN_PASSWORD_HASH, or
 * ADMIN_PASSWORD plaintext for local dev — hashed on the spot, never stored raw).
 *   npx tsx scripts/seed-admin.ts
 */
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db/client";
import { users } from "../src/lib/db/schema";

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "";
  let hash = process.env.ADMIN_PASSWORD_HASH ?? "";
  const plain = process.env.ADMIN_PASSWORD ?? "";
  if (!email) {
    console.error("Set ADMIN_EMAIL (and ADMIN_PASSWORD_HASH or ADMIN_PASSWORD).");
    process.exit(1);
  }
  if (!hash && plain) hash = await bcrypt.hash(plain, 11);
  if (!hash) {
    console.error("Set ADMIN_PASSWORD_HASH (bcrypt) or ADMIN_PASSWORD (dev only).");
    process.exit(1);
  }
  const existing = await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) {
    await db().update(users).set({ passwordHash: hash, role: "admin" }).where(eq(users.id, existing[0].id));
    console.log(`updated admin ${email}`);
  } else {
    await db().insert(users).values({ email, name: "Admin", passwordHash: hash, role: "admin" });
    console.log(`created admin ${email}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
