import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "../env";

/**
 * Minimal, dependency-light credentials auth: bcrypt-verified login issues a
 * signed JWT in an httpOnly cookie. No third-party auth service — free at any
 * scale, and clients never need OAuth to log in (Meta OAuth is only for
 * connecting pages, not for signing in).
 */

const COOKIE = "niba_session";
const MAX_AGE_S = 60 * 60 * 24 * 14; // 14 days

export interface SessionUser {
  userId: string;
  email: string;
  role: "admin" | "client";
  name: string;
}

function secret(): Uint8Array {
  const e = env();
  const raw = e.AUTH_SECRET || e.ENCRYPTION_KEY || (e.NODE_ENV !== "production" ? "nibachat-dev-session-secret" : "");
  if (!raw) throw new Error("AUTH_SECRET or ENCRYPTION_KEY required");
  return new TextEncoder().encode(raw);
}

export async function createSession(user: SessionUser): Promise<void> {
  const jwt = await new SignJWT({ email: user.email, role: user.role, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    maxAge: MAX_AGE_S,
    path: "/"
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: String(payload.sub ?? ""),
      email: String(payload.email ?? ""),
      role: payload.role === "admin" ? "admin" : "client",
      name: String(payload.name ?? "")
    };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
