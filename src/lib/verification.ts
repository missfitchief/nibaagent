import "server-only";
import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "./db/client";
import { emailVerificationTokens, users } from "./db/schema";

/**
 * Email-verification tokens. The RAW token is emailed and never stored; only its
 * sha256 hash lives in the DB. Tokens are single-use and expire in 24h. Resend is
 * rate-limited to one per 60s per user.
 */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function createVerificationToken(userId: string, email: string): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  await db().insert(emailVerificationTokens).values({
    userId,
    email,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS)
  });
  return raw;
}

/** True if the user may request another verification email (cooldown elapsed). */
export async function canResendVerification(userId: string): Promise<boolean> {
  const [last] = await db()
    .select({ createdAt: emailVerificationTokens.createdAt })
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId))
    .orderBy(desc(emailVerificationTokens.createdAt))
    .limit(1);
  if (!last) return true;
  return Date.now() - last.createdAt.getTime() > RESEND_COOLDOWN_MS;
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
}

export async function verifyEmailToken(raw: string): Promise<VerifyResult> {
  if (!raw || raw.length < 16) return { ok: false, error: "Neispravan verifikacioni link." };
  const [row] = await db().select().from(emailVerificationTokens).where(eq(emailVerificationTokens.tokenHash, hashToken(raw))).limit(1);
  if (!row) return { ok: false, error: "Neispravan verifikacioni link." };
  if (row.usedAt) return { ok: false, error: "Ovaj link je već iskorišćen." };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: "Link je istekao. Zatražite novi verifikacioni email." };
  await db().update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, row.userId));
  await db().update(emailVerificationTokens).set({ usedAt: new Date() }).where(eq(emailVerificationTokens.id, row.id));
  return { ok: true };
}

export async function isEmailVerified(userId: string): Promise<boolean> {
  const [u] = await db().select({ v: users.emailVerifiedAt, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  // Platform admins are implicitly verified (created out-of-band).
  return Boolean(u && (u.v || u.role === "admin"));
}
