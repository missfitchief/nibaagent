import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { metaConnections } from "@/lib/db/schema";
import { encryptToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { accessForUser } from "@/lib/auth/guards";
import { clientIdFor } from "@/lib/tenant";
import { exchangeCodeForToken, fetchGrantedPages, logEvent, META_TOKEN_TTL_MS, resolvedRedirectUri, subscribePageToApp, toLongLivedToken } from "@/lib/meta";
import { safeSyncAllN8n } from "@/lib/n8n-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same-origin /app|/admin only (no open redirect). */
function safePath(raw: string, fallback: string): string {
  if (!raw || !/^\/(app|admin)(\/|\?|$)/.test(raw) || raw.includes("//") || raw.includes("\\") || raw.length > 300) return fallback;
  return raw;
}

/**
 * Meta OAuth callback. Persists each granted Page to the PRODUCTION
 * meta_connections table (process.env.DATABASE_URL). n8n reads by client_id (the
 * stable tenant id, e.g. "starlight"); business_id stays the internal UUID.
 *   - returns to the EXACT page that started the connect (signed returnUrl)
 *   - shows success ONLY after the DB write is READ BACK
 *   - a Page owned by another tenant is not silently reassigned (admin can move)
 *   - every stage logged; tokens NEVER logged.
 */
export async function GET(request: NextRequest) {
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));
  const slog = (level: "info" | "warn" | "error", msg: string, meta: Record<string, unknown> = {}, biz: string | null = null) =>
    logEvent(biz, level, "meta_oauth", msg, meta);

  await slog("info", "Meta OAuth callback started");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const metaError = request.nextUrl.searchParams.get("error_description");
  // Until state is verified, we don't know the returnUrl → default to the client connect page.
  let backTo = "/app/connect";
  const failTo = (msg: string) => redirectTo(`${backTo}${backTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg.slice(0, 200))}`);
  if (metaError) return failTo(metaError);
  if (!code || !state) return failTo("Facebook did not return a login code.");

  // 1. Verify signed state → businessId + clientId + returnUrl (never trust unsigned params).
  const e = env();
  let businessId = "";
  let stateReturn = "";
  try {
    const secret = new TextEncoder().encode(e.AUTH_SECRET || e.ENCRYPTION_KEY || "nibachat-dev-session-secret");
    const { payload } = await jwtVerify(state, secret);
    businessId = String(payload.businessId ?? "");
    stateReturn = String(payload.returnUrl ?? "");
  } catch {
    return failTo("Login session expired or invalid — please try connecting again.");
  }
  if (!businessId) return failTo("Invalid connect state.");

  // 2. Caller must be signed in AND have access to this tenant (loads name/plan server-side).
  const session = await getSession();
  if (!session) return failTo("Please sign in again, then reconnect Facebook.");
  const access = await accessForUser(session, businessId);
  if (!access) {
    await slog("warn", "callback rejected: caller has no access to tenant", {}, businessId);
    return failTo("You don't have access to this account. Sign in with the right account and try again.");
  }
  const business = access.business;
  const clientId = clientIdFor(business); // authoritative tenant id from DB, e.g. "starlight"
  // Now that the tenant is known, return to the exact page that started the connect.
  backTo = safePath(stateReturn, `/admin/businesses/${businessId}?tab=channels`);
  await slog("info", `tenant resolved: client_id=${clientId} (business=${business.name}); returnUrl=${backTo}`, { clientId }, businessId);

  try {
    // 3. Token exchange (short → long-lived) → granted pages.
    let longToken: string;
    try {
      const shortToken = await exchangeCodeForToken(code, await resolvedRedirectUri());
      longToken = await toLongLivedToken(shortToken);
      await slog("info", "Meta access token exchange succeeded", {}, businessId);
    } catch (err) {
      await slog("error", `Meta access token exchange FAILED: ${(err as Error).message}`, {}, businessId);
      return failTo(`Meta token exchange failed: ${(err as Error).message}`);
    }

    const pages = await fetchGrantedPages(longToken);
    await slog("info", `/me/accounts returned ${pages.length} page(s)`, { pageCount: pages.length }, businessId);
    // req #10: no false success — no pages means no success.
    if (!pages.length) {
      await slog("warn", "OAuth completed but no pages were granted", {}, businessId);
      return failTo("No Facebook Page was granted. In the popup, SELECT your Page (and its Instagram account).");
    }

    let connectedAny = false;
    let webhookFailed = false;
    for (const page of pages) {
      const igId = page.instagram_business_account?.id ?? "";
      await slog("info", `selected page_id=${page.id} page_name=${page.name ?? ""}; ig=${igId || "(none)"}`, { pageId: page.id, pageName: page.name ?? "", instagramBusinessAccountId: igId }, businessId);

      // Page-already-connected to a DIFFERENT tenant → don't reassign silently; admin can move.
      const existing = await db().select().from(metaConnections).where(eq(metaConnections.pageId, page.id)).limit(1);
      if (existing[0] && existing[0].businessId !== businessId) {
        await slog("warn", `page ${page.id} already connected to client_id=${existing[0].clientId} — not reassigned`, {}, businessId);
        return redirectTo(`${backTo}${backTo.includes("?") ? "&" : "?"}error=page_in_use&pageId=${encodeURIComponent(page.id)}&otherClient=${encodeURIComponent(existing[0].clientId)}`);
      }

      const encrypted = encryptToken(page.access_token);
      const shared = {
        businessId,
        clientId,
        pageName: page.name ?? "",
        encryptedPageAccessToken: encrypted,
        encryptedInstagramAccessToken: encrypted,
        pageAccessToken: page.access_token,
        instagramAccessToken: igId ? page.access_token : "",
        instagramBusinessAccountId: igId,
        businessName: business.name,
        plan: business.plan,
        status: "active" as const,
        connectionType: "oauth" as const,
        // Long-lived tokens last ~60 days — stamp the expiry so the health
        // cron and the UI can warn before it lapses.
        tokenExpiresAt: new Date(Date.now() + META_TOKEN_TTL_MS),
        updatedAt: new Date()
      };
      try {
        await db()
          .insert(metaConnections)
          .values({ pageId: page.id, connectedAt: new Date(), ...shared })
          .onConflictDoUpdate({ target: metaConnections.pageId, set: shared });
      } catch (err) {
        await slog("error", `meta_connections upsert FAILED (page ${page.id}): ${(err as Error).message}`, { pageId: page.id }, businessId);
        return failTo(`Database write failed: ${(err as Error).message}`);
      }

      // req #10: READ BACK the row before claiming success.
      const [saved] = await db().select().from(metaConnections).where(eq(metaConnections.pageId, page.id)).limit(1);
      if (!saved || saved.businessId !== businessId || saved.clientId !== clientId || saved.status !== "active") {
        await slog("error", `read-back verification FAILED for page ${page.id}`, { pageId: page.id }, businessId);
        return failTo("Saved connection could not be verified in the database. Please try again.");
      }
      await slog("info", `meta_connections upsert OK + read-back verified (page ${page.id}, client_id=${clientId})`, { pageId: page.id, clientId }, businessId);
      connectedAny = true;

      // 4. Subscribe the page to the app. On failure KEEP the row + warn.
      try {
        await subscribePageToApp(page.id, page.access_token);
        await slog("info", `page ${page.id} subscribed to app`, {}, businessId);
      } catch (err) {
        webhookFailed = true;
        await slog("error", `subscribed_apps failed for ${page.id}: ${(err as Error).message}`, {}, businessId);
      }
    }

    if (!connectedAny) return failTo("No page could be connected.");

    // 5. Project runtime data into the n8n tables + tenants registry (keyed by client_id).
    await safeSyncAllN8n(businessId);

    return redirectTo(`${backTo}${backTo.includes("?") ? "&" : "?"}connected=1${webhookFailed ? "&warning=webhook_subscription_failed" : ""}`);
  } catch (err) {
    const msg = (err as Error).message ?? "unknown error";
    await slog("error", `OAuth flow failed: ${msg}`, {}, businessId);
    return failTo(msg);
  }
}
