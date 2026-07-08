import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { requireBusiness } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { META_OAUTH_SCOPES, metaCreds, resolvedRedirectUri } from "@/lib/meta";

/** Kicks off Facebook Login. State = short-lived signed JWT with businessId (CSRF-safe). */
export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
  if (!businessId) return NextResponse.redirect(new URL("/app/connect?error=missing_business", request.url));
  const { business } = await requireBusiness(businessId); // redirects if not owner/admin

  // Resolve Meta app creds from platform settings (DB) with env fallback.
  const { appId, appSecret } = await metaCreds();
  if (!appId || !appSecret) {
    return NextResponse.redirect(new URL("/app/connect?error=" + encodeURIComponent("Meta app is not configured yet (App ID/Secret). Ask support."), request.url));
  }

  const e = env();
  const secret = new TextEncoder().encode(e.AUTH_SECRET || e.ENCRYPTION_KEY || "nibachat-dev-session-secret");
  const state = await new SignJWT({ businessId: business.id })
    .setProtectedHeader({ alg: "HS256" })
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
