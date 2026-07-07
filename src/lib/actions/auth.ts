"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db/client";
import { businesses, users } from "../db/schema";
import { hashPassword, verifyPassword } from "../auth/password";
import { createSession, destroySession } from "../auth/session";
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
  await createSession({ userId: user.id, email: user.email, role: "client", name: user.name });
  redirect("/app/onboarding");
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

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
