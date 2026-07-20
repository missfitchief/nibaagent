import "server-only";
import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "./db/client";
import { passwordResetTokens, users } from "./db/schema";
import { hashPassword } from "./auth/password";

/**
 * Password-reset tokens. Same discipline as email verification (see
 * verification.ts): the RAW token is emailed and never stored; only its sha256
 * hash lives in the DB. Tokens are single-use and expire in 1h. Requests are
 * rate-limited to one per 60s per user.
 */
const TOKEN_TTL_MS = 60 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 60 * 1000;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function createPasswordResetToken(userId: string, email: string): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  await db().insert(passwordResetTokens).values({
    userId,
    email,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS)
  });
  return raw;
}

/** True if the user may request another reset email (cooldown elapsed). */
export async function canRequestPasswordReset(userId: string): Promise<boolean> {
  const [last] = await db()
    .select({ createdAt: passwordResetTokens.createdAt })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId))
    .orderBy(desc(passwordResetTokens.createdAt))
    .limit(1);
  if (!last) return true;
  return Date.now() - last.createdAt.getTime() > REQUEST_COOLDOWN_MS;
}

export interface ResetResult {
  ok: boolean;
  error?: string;
}

/** Validate a raw token; on success set the new password and burn the token. */
export async function resetPasswordWithToken(raw: string, newPassword: string): Promise<ResetResult> {
  if (!raw || raw.length < 16) return { ok: false, error: "Neispravan link za resetovanje." };
  if (!newPassword || newPassword.length < 8 || newPassword.length > 200) {
    return { ok: false, error: "Lozinka mora imati najmanje 8 karaktera." };
  }
  const [row] = await db().select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, hashToken(raw))).limit(1);
  if (!row) return { ok: false, error: "Neispravan link za resetovanje." };
  if (row.usedAt) return { ok: false, error: "Ovaj link je već iskorišćen." };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: "Link je istekao. Zatražite novi link za resetovanje." };
  await db().update(users).set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() }).where(eq(users.id, row.userId));
  await db().update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
  return { ok: true };
}

/** Non-consuming validity check for the reset page (so the form can fail fast). */
export async function inspectPasswordResetToken(raw: string): Promise<{ valid: boolean; error?: string }> {
  if (!raw || raw.length < 16) return { valid: false, error: "Neispravan link za resetovanje." };
  const [row] = await db().select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, hashToken(raw))).limit(1);
  if (!row) return { valid: false, error: "Neispravan link za resetovanje." };
  if (row.usedAt) return { valid: false, error: "Ovaj link je već iskorišćen." };
  if (row.expiresAt.getTime() < Date.now()) return { valid: false, error: "Link je istekao. Zatražite novi link za resetovanje." };
  return { valid: true };
}
