import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, type TestDb } from "./helpers";
import { emailVerificationTokens, users } from "../src/lib/db/schema";
import { canResendVerification, createVerificationToken, isEmailVerified, verifyEmailToken } from "../src/lib/verification";

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
});

async function newUser(role: "client" | "admin" = "client") {
  const [u] = await db.insert(users).values({ email: `u${Math.round(performance.now() * 1000)}@t.local`, name: "U", passwordHash: "x", role }).returning();
  return u;
}

describe("email verification", () => {
  it("stores a hash of the token, never the raw token", async () => {
    const u = await newUser();
    const raw = await createVerificationToken(u.id, u.email);
    const [row] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, u.id));
    expect(row.tokenHash).not.toBe(raw);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(row.usedAt).toBeNull();
  });

  it("a valid token verifies the email and is single-use", async () => {
    const u = await newUser();
    expect(await isEmailVerified(u.id)).toBe(false);
    const raw = await createVerificationToken(u.id, u.email);
    expect(await verifyEmailToken(raw)).toEqual({ ok: true });
    expect(await isEmailVerified(u.id)).toBe(true);
    // Second use fails.
    const second = await verifyEmailToken(raw);
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/iskorišćen/i);
  });

  it("an expired token fails", async () => {
    const u = await newUser();
    const raw = await createVerificationToken(u.id, u.email);
    await db.update(emailVerificationTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(emailVerificationTokens.userId, u.id));
    const r = await verifyEmailToken(raw);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/istekao/i);
    expect(await isEmailVerified(u.id)).toBe(false);
  });

  it("an invalid/unknown token fails", async () => {
    const r = await verifyEmailToken("deadbeefdeadbeefdeadbeef");
    expect(r.ok).toBe(false);
  });

  it("resend is rate-limited right after a token is issued", async () => {
    const u = await newUser();
    await createVerificationToken(u.id, u.email);
    expect(await canResendVerification(u.id)).toBe(false);
  });

  it("platform admins are implicitly verified", async () => {
    const admin = await newUser("admin");
    expect(await isEmailVerified(admin.id)).toBe(true);
  });
});
