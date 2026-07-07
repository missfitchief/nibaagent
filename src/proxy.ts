import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Edge route protection (Next 16 proxy, formerly middleware): /app/* requires a session, /admin/* requires the
 * admin role. Server actions re-check authorization on every call — this is
 * the UX layer, guards.ts is the security layer.
 */

function secret(): Uint8Array {
  const raw =
    process.env.AUTH_SECRET ||
    process.env.ENCRYPTION_KEY ||
    (process.env.NODE_ENV !== "production" ? "nibachat-dev-session-secret" : "");
  return new TextEncoder().encode(raw);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = pathname.startsWith("/app") || pathname.startsWith("/admin");
  if (!needsAuth) return NextResponse.next();

  const token = request.cookies.get("niba_session")?.value;
  const login = new URL(pathname.startsWith("/admin") ? "/admin-login" : "/login", request.url);
  if (!token) return NextResponse.redirect(login);
  try {
    const { payload } = await jwtVerify(token, secret());
    if (pathname.startsWith("/admin") && payload.role !== "admin") return NextResponse.redirect(login);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(login);
  }
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"]
};
