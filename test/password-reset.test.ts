import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, type TestDb } from "./helpers";
import { passwordResetTokens, users } from "../src/lib/db/schema";
import {
  canRequestPasswordReset,
  createPasswordResetToken,
  inspectPasswordResetToken,
  resetPasswordWithToken
} from "../src/lib/password-reset";
import { verifyPassword } from "../src/lib/auth/password";
import { sendPasswordResetEmail } from "../src/lib/email";
import { resetEnvCache } from "../src/lib/env";

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
  resetEnvCache();
});

async function newUser() {
  const [u] = await db
    .insert(users)
    .values({ email: `u${Math.round(performance.now() * 1000)}@t.local`, name: "U", passwordHash: "x", role: "client" })
    .returning();
  return u;
}

describe("password reset tokens", () => {
  it("stores a hash of the token, never the raw token", async () => {
    const u = await newUser();
    const raw = await createPasswordResetToken(u.id, u.email);
    const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, u.id));
    expect(row.tokenHash).not.toBe(raw);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(row.usedAt).toBeNull();
  });

  it("a valid token sets the new password and is single-use", async () => {
    const u = await newUser();
    const raw = await createPasswordResetToken(u.id, u.email);
    expect(await resetPasswordWithToken(raw, "nova-lozinka-123")).toEqual({ ok: true });
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(await verifyPassword("nova-lozinka-123", after.passwordHash)).toBe(true);
    // Second use fails — token is burned.
    const second = await resetPasswordWithToken(raw, "druga-lozinka-123");
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/iskorišćen/i);
    expect(await verifyPassword("nova-lozinka-123", after.passwordHash)).toBe(true);
  });

  it("an expired token fails and does not change the password", async () => {
    const u = await newUser();
    const raw = await createPasswordResetToken(u.id, u.email);
    await db.update(passwordResetTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(passwordResetTokens.userId, u.id));
    const r = await resetPasswordWithToken(raw, "nova-lozinka-123");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/istekao/i);
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(after.passwordHash).toBe("x");
  });

  it("an invalid/unknown token fails", async () => {
    const r = await resetPasswordWithToken("deadbeefdeadbeefdeadbeef", "nova-lozinka-123");
    expect(r.ok).toBe(false);
    expect((await inspectPasswordResetToken("deadbeefdeadbeefdeadbeef")).valid).toBe(false);
  });

  it("rejects a short password even with a valid token", async () => {
    const u = await newUser();
    const raw = await createPasswordResetToken(u.id, u.email);
    const r = await resetPasswordWithToken(raw, "short");
    expect(r.ok).toBe(false);
    // Token NOT burned by a failed attempt — the user can retry the same link.
    expect((await inspectPasswordResetToken(raw)).valid).toBe(true);
  });

  it("requests are rate-limited right after a token is issued", async () => {
    const u = await newUser();
    expect(await canRequestPasswordReset(u.id)).toBe(true);
    await createPasswordResetToken(u.id, u.email);
    expect(await canRequestPasswordReset(u.id)).toBe(false);
  });

  it("dev email mode never sends and never touches the network", async () => {
    // EMAIL_MODE unset → dev: returns the link in the note, sent=false.
    const r = await sendPasswordResetEmail("owner@t.local", "Owner", "https://app.example/reset-password?token=abc123");
    expect(r.sent).toBe(false);
    expect(r.mode).toBe("dev");
    expect(r.note).toContain("https://app.example/reset-password?token=abc123");
  });
});
