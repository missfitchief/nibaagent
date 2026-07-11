"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db/client";
import { businesses, users } from "../db/schema";
import { hashPassword, verifyPassword } from "../auth/password";
import { createSession, destroySession, getSession } from "../auth/session";
import { canResendVerification, createVerificationToken, isEmailVerified } from "../verification";
import { sendVerificationEmail } from "../email";
import { resolvePlatform } from "../platform";
import { logEvent } from "../meta";
import { env } from "../env";

export interface AuthState {
  error?: string;
}

const Credentials = z.object({
  email: z.string().email().max(200).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(200)
});

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = Credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const name = String(formData.get("name") ?? "").slice(0, 120);
  if (!parsed.success) return { error: "Enter a valid email and a password of at least 8 characters." };

  const existing = await db().select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing[0]) return { error: "An account with this email already exists. Try logging in." };

  const [user] = await db()
    .insert(users)
    .values({ email: parsed.data.email, name, passwordHash: await hashPassword(parsed.data.password), role: "client" })
    .returning();

  // Create the account UNVERIFIED and send a verification email. We still start a
  // session so we know who they are, but the /app layout gates the dashboard
  // until email_verified_at is set.
  const appUrl = (await resolvePlatform("APP_URL")).value || "https://nibaagent.vercel.app";
  const token = await createVerificationToken(user.id, user.email);
  const verifyUrl = `${appUrl.replace(/\/$/, "")}/verify-email?token=${token}`;
  const mail = await sendVerificationEmail(user.email, name, verifyUrl);
  // Sanitized log (dev mode records the link so an operator can verify manually).
  await logEvent(null, mail.sent ? "info" : "warn", "system", `Verifikacioni email (${mail.mode}) za ${user.email}: ${mail.note}`, { email: user.email, mode: mail.mode, sent: mail.sent });

  await createSession({ userId: user.id, email: user.email, role: "client", name: user.name });
  redirect("/app");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = Credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Invalid email or password." };

  const [user] = await db().select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Invalid email or password." };
  }
  // The public login form never elevates to admin — admins use the hidden route.
  if (user.role === "admin") return { error: "Invalid email or password." };

  await createSession({ userId: user.id, email: user.email, role: user.role, name: user.name });
  const hasBusiness = await db().select({ id: businesses.id }).from(businesses).where(eq(businesses.ownerUserId, user.id)).limit(1);
  redirect(hasBusiness[0] ? "/app" : "/app/onboarding");
}

export async function adminLoginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = Credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Invalid credentials." };

  // Path 1: seeded DB admin. Path 2: env-configured break-glass admin.
  const [user] = await db().select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (user && user.role === "admin" && (await verifyPassword(parsed.data.password, user.passwordHash))) {
    await createSession({ userId: user.id, email: user.email, role: "admin", name: user.name || "Admin" });
    redirect("/admin");
  }
  const e = env();
  if (
    e.ADMIN_EMAIL &&
    e.ADMIN_PASSWORD_HASH &&
    parsed.data.email === e.ADMIN_EMAIL.toLowerCase() &&
    (await verifyPassword(parsed.data.password, e.ADMIN_PASSWORD_HASH))
  ) {
    // Ensure a DB row exists so audit logs can reference the admin.
    const [row] =
      (await db().select().from(users).where(eq(users.email, parsed.data.email)).limit(1)) ??
      [];
    const admin =
      row ??
      (await db()
        .insert(users)
        .values({ email: parsed.data.email, name: "Admin", passwordHash: e.ADMIN_PASSWORD_HASH, role: "admin" })
        .returning())[0];
    await createSession({ userId: admin.id, email: admin.email, role: "admin", name: "Admin" });
    redirect("/admin");
  }
  return { error: "Invalid credentials." };
}

export interface ResendState {
  ok?: boolean;
  error?: string;
  note?: string;
}

/** Resend the verification email to the signed-in user. Rate-limited (60s). */
export async function resendVerificationAction(_prev: ResendState, _formData: FormData): Promise<ResendState> {
  const session = await getSession();
  if (!session) return { error: "Prijavite se ponovo." };
  if (await isEmailVerified(session.userId)) return { ok: true, note: "Email je već potvrđen." };
  if (!(await canResendVerification(session.userId))) {
    return { error: "Sačekajte minut pre ponovnog slanja." };
  }
  const appUrl = (await resolvePlatform("APP_URL")).value || "https://nibaagent.vercel.app";
  const token = await createVerificationToken(session.userId, session.email);
  const verifyUrl = `${appUrl.replace(/\/$/, "")}/verify-email?token=${token}`;
  const mail = await sendVerificationEmail(session.email, session.name, verifyUrl);
  await logEvent(null, mail.sent ? "info" : "warn", "system", `Ponovni verifikacioni email (${mail.mode}) za ${session.email}: ${mail.note}`, { email: session.email, mode: mail.mode });
  return { ok: true, note: mail.sent ? "Email je ponovo poslat." : "Slanje emaila nije konfigurisano (dev režim). Link je u logovima." };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
