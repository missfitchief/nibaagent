import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { requireBusiness } from "@/lib/auth/guards";
import { env, metaRedirectUri } from "@/lib/env";
import { META_OAUTH_SCOPES } from "@/lib/meta";

/** Kicks off Facebook Login. State = short-lived signed JWT with businessId (CSRF-safe). */
export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
  if (!businessId) return NextResponse.redirect(new URL("/app/connect?error=missing_business", request.url));
  const { business } = await requireBusiness(businessId); // redirects if not owner/admin

  const e = env();
  if (!e.META_APP_ID || !e.META_APP_SECRET) {
    return NextResponse.redirect(new URL("/app/connect?error=" + encodeURIComponent("Meta app is not configured yet (META_APP_ID/SECRET). Ask support."), request.url));
  }

  const secret = new TextEncoder().encode(e.AUTH_SECRET || e.ENCRYPTION_KEY || "nibachat-dev-session-secret");
  const state = await new SignJWT({ businessId: business.id })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .sign(secret);

  const url = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  url.searchParams.set("client_id", e.META_APP_ID);
  url.searchParams.set("redirect_uri", metaRedirectUri());
  url.searchParams.set("scope", META_OAUTH_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  return NextResponse.redirect(url);
}
