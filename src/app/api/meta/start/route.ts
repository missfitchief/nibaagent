import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { SignJWT } from "jose";
import { requireBusiness } from "@/lib/auth/guards";
import { clientIdFor, safeReturnUrl } from "@/lib/tenant";
import { env } from "@/lib/env";
import { META_OAUTH_SCOPES, metaCreds, resolvedRedirectUri } from "@/lib/meta";

/**
 * Kicks off Facebook Login. The signed state (CSRF-safe, 15-min) carries the
 * internal businessId, the tenant client_id, a nonce, and a validated returnUrl
 * so the callback comes back to the EXACT page that started the connect (fixes
 * "jumps to another business"). Only same-origin /app or /admin paths are allowed.
 */
export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
  if (!businessId) return NextResponse.redirect(new URL("/app/connect?error=missing_business", request.url));
  const { business } = await requireBusiness(businessId); // redirects if not owner/admin
  const returnUrl = safeReturnUrl(request.nextUrl.searchParams.get("returnUrl"), `/admin/businesses/${businessId}?tab=channels`);

  // Resolve Meta app creds from platform settings (DB) with env fallback.
  const { appId, appSecret } = await metaCreds();
  if (!appId || !appSecret) {
    return NextResponse.redirect(new URL(`${returnUrl}${returnUrl.includes("?") ? "&" : "?"}error=` + encodeURIComponent("Meta app is not configured yet (App ID/Secret). Ask support."), request.url));
  }

  const e = env();
  const secret = new TextEncoder().encode(e.AUTH_SECRET || e.ENCRYPTION_KEY || "nibachat-dev-session-secret");
  const state = await new SignJWT({ businessId: business.id, clientId: clientIdFor(business), returnUrl, nonce: crypto.randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);

  const url = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", await resolvedRedirectUri());
  url.searchParams.set("scope", META_OAUTH_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  return NextResponse.redirect(url);
}
