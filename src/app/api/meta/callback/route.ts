import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { metaConnections } from "@/lib/db/schema";
import { encryptToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { exchangeCodeForToken, fetchGrantedPages, logEvent, resolvedRedirectUri, subscribePageToApp, toLongLivedToken } from "@/lib/meta";

/**
 * OAuth callback: code -> user token -> LONG-LIVED token -> granted pages
 * (with task-access fallback) -> store encrypted page token + IG id ->
 * subscribe page to app. Multiple pages: connect all granted ones (each page
 * id is unique platform-wide, so no cross-tenant risk).
 */
export async function GET(request: NextRequest) {
  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/app/connect?error=${encodeURIComponent(msg.slice(0, 180))}`, request.url));

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const metaError = request.nextUrl.searchParams.get("error_description");
  if (metaError) return fail(metaError);
  if (!code || !state) return fail("Facebook did not return a login code.");

  const e = env();
  let businessId = "";
  try {
    const secret = new TextEncoder().encode(e.AUTH_SECRET || e.ENCRYPTION_KEY || "nibachat-dev-session-secret");
    const { payload } = await jwtVerify(state, secret);
    businessId = String(payload.businessId ?? "");
  } catch {
    return fail("Login session expired — please try connecting again.");
  }
  if (!businessId) return fail("Invalid connect state.");

  try {
    const shortToken = await exchangeCodeForToken(code, await resolvedRedirectUri());
    const longToken = await toLongLivedToken(shortToken);
    const pages = await fetchGrantedPages(longToken);
    if (!pages.length) {
      await logEvent(businessId, "warn", "meta_oauth", "OAuth completed but no pages were granted");
      return fail("No Facebook Page was granted. In the Facebook popup, make sure you SELECT your page (and Instagram account).");
    }

    let connectedAny = false;
    for (const page of pages) {
      const igId = page.instagram_business_account?.id ?? "";
      const existing = await db().select().from(metaConnections).where(eq(metaConnections.pageId, page.id)).limit(1);
      if (existing[0] && existing[0].businessId !== businessId) {
        await logEvent(businessId, "warn", "meta_oauth", `Page ${page.id} already belongs to another business — skipped`);
        continue;
      }
      const values = {
        businessId,
        clientId: businessId,
        pageId: page.id,
        pageName: page.name ?? "",
        encryptedPageAccessToken: encryptToken(page.access_token),
        instagramBusinessAccountId: igId,
        status: (igId ? "connected" : "partial") as "connected" | "partial",
        connectionType: "oauth" as const,
        updatedAt: new Date()
      };
      if (existing[0]) await db().update(metaConnections).set(values).where(eq(metaConnections.id, existing[0].id));
      else await db().insert(metaConnections).values(values);

      try {
        await subscribePageToApp(page.id, page.access_token);
        await logEvent(businessId, "info", "webhook_subscribe", `Page ${page.name} (${page.id}) subscribed to app${igId ? ", IG " + igId : ", no IG linked"}`);
      } catch (err) {
        await db()
          .update(metaConnections)
          .set({ status: "error", updatedAt: new Date() })
          .where(eq(metaConnections.pageId, page.id));
        await logEvent(businessId, "error", "webhook_subscribe", `subscribed_apps failed for ${page.id}: ${(err as Error).message}`);
        return fail(`Connected the page but webhook subscription failed: ${(err as Error).message}`);
      }
      connectedAny = true;
    }
    if (!connectedAny) return fail("That page is already connected to a different NibaChat business.");
    return NextResponse.redirect(new URL("/app/connect?connected=1", request.url));
  } catch (err) {
    const msg = (err as Error).message ?? "unknown error";
    await logEvent(businessId, "error", "meta_oauth", `OAuth flow failed: ${msg}`);
    return fail(msg);
  }
}
