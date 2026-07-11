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
import { exchangeCodeForToken, fetchGrantedPages, logEvent, resolvedRedirectUri, subscribePageToApp, toLongLivedToken } from "@/lib/meta";
import { safeSyncAllN8n, syncTenantConfigForBusiness } from "@/lib/n8n-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta OAuth callback — persists each granted Page to the PRODUCTION
 * meta_connections table (via process.env.DATABASE_URL). n8n reads by
 * client_id (the stable tenant id, e.g. "starlight"); business_id stays the
 * app's internal UUID. Success is shown ONLY after the DB upsert succeeds; a DB
 * failure surfaces the real error in the UI. Every stage is logged; tokens are
 * NEVER logged.
 */
export async function GET(request: NextRequest) {
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));
  const fail = (msg: string) => redirectTo(`/app/connect?error=${encodeURIComponent(msg.slice(0, 200))}`);
  // Per-stage, sanitized server log helper (never receives a token).
  const slog = (level: "info" | "warn" | "error", msg: string, meta: Record<string, unknown> = {}, biz: string | null = null) =>
    logEvent(biz, level, "meta_oauth", msg, meta);

  await slog("info", "Meta OAuth callback started"); // req #6: callback route started

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const metaError = request.nextUrl.searchParams.get("error_description");
  if (metaError) return fail(metaError);
  if (!code || !state) return fail("Facebook did not return a login code.");

  // 1. Verify the signed state → internal business UUID (never trust an unsigned param).
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

  // 2. Caller must be signed in AND have access to this tenant (loads name/plan server-side).
  const session = await getSession();
  if (!session) return fail("Please sign in again, then reconnect Facebook.");
  const access = await accessForUser(session, businessId);
  if (!access) {
    await slog("warn", "callback rejected: caller has no access to tenant", {}, businessId);
    return fail("You don't have access to this account. Sign in with the right account and try again.");
  }
  const business = access.business;
  const clientId = clientIdFor(business); // stable n8n tenant id, e.g. "starlight"
  await slog("info", `tenant resolved: client_id=${clientId} (business=${business.name})`, { clientId }, businessId); // req #6: tenant id

  try {
    // 3. Token exchange (short → long-lived) → granted pages. req #6: exchange success/failure.
    let longToken: string;
    try {
      const shortToken = await exchangeCodeForToken(code, await resolvedRedirectUri());
      longToken = await toLongLivedToken(shortToken);
      await slog("info", "Meta access token exchange succeeded", {}, businessId);
    } catch (err) {
      await slog("error", `Meta access token exchange FAILED: ${(err as Error).message}`, {}, businessId);
      return fail(`Meta token exchange failed: ${(err as Error).message}`);
    }

    const pages = await fetchGrantedPages(longToken);
    await slog("info", `/me/accounts returned ${pages.length} page(s)`, { pageCount: pages.length }, businessId); // req #6: page count
    if (!pages.length) {
      await slog("warn", "OAuth completed but no pages were granted", {}, businessId);
      return fail("No Facebook Page was granted. In the Facebook popup, make sure you SELECT your page (and Instagram account).");
    }

    let connectedAny = false;
    let webhookFailed = false;
    for (const page of pages) {
      const igId = page.instagram_business_account?.id ?? "";
      await slog("info", `selected page_id=${page.id} page_name=${page.name ?? ""}`, { pageId: page.id, pageName: page.name ?? "" }, businessId); // req #6
      await slog("info", `instagram_business_account_id=${igId || "(none)"}`, { instagramBusinessAccountId: igId }, businessId); // req #6

      // Ownership guard: never reassign a Page already connected to another tenant.
      const existing = await db().select().from(metaConnections).where(eq(metaConnections.pageId, page.id)).limit(1);
      if (existing[0] && existing[0].businessId !== businessId) {
        await slog("warn", `page ${page.id} already belongs to another account — skipped`, {}, businessId);
        continue;
      }

      const encrypted = encryptToken(page.access_token);
      // Exact columns (req #10). client_id = tenant id; business_id = internal UUID.
      const shared = {
        businessId, // internal UUID (FK)
        clientId, // n8n tenant id, e.g. "starlight"
        pageName: page.name ?? "",
        encryptedPageAccessToken: encrypted,
        encryptedInstagramAccessToken: encrypted,
        pageAccessToken: page.access_token, // PLAINTEXT for n8n
        instagramAccessToken: igId ? page.access_token : "",
        instagramBusinessAccountId: igId,
        businessName: business.name,
        plan: business.plan,
        status: "active" as const,
        connectionType: "oauth" as const,
        updatedAt: new Date()
      };

      // req #4/#5/#6: the DB write is the gate. Failure = real error in UI, no success.
      try {
        await db()
          .insert(metaConnections)
          .values({ pageId: page.id, connectedAt: new Date(), ...shared })
          .onConflictDoUpdate({ target: metaConnections.pageId, set: shared });
        await slog("info", `meta_connections upsert OK (page ${page.id}, client_id=${clientId})`, { pageId: page.id, clientId }, businessId);
      } catch (err) {
        await slog("error", `meta_connections upsert FAILED (page ${page.id}): ${(err as Error).message}`, { pageId: page.id }, businessId);
        return fail(`Database write failed: ${(err as Error).message}`);
      }
      connectedAny = true;

      // 4. Subscribe the page to the app. On failure KEEP the row + warn (don't discard the token).
      try {
        await subscribePageToApp(page.id, page.access_token);
        await slog("info", `page ${page.id} subscribed to app`, {}, businessId);
      } catch (err) {
        webhookFailed = true;
        await slog("error", `subscribed_apps failed for ${page.id}: ${(err as Error).message}`, {}, businessId);
      }
    }

    if (!connectedAny) return fail("That page is already connected to a different account.");

    // 5. Project this tenant's runtime data into the n8n tables (keyed by the same client_id).
    await syncTenantConfigForBusiness(businessId);
    await safeSyncAllN8n(businessId);

    return redirectTo(webhookFailed ? "/app/connect?connected=1&warning=webhook_subscription_failed" : "/app/connect?connected=1");
  } catch (err) {
    const msg = (err as Error).message ?? "unknown error";
    await slog("error", `OAuth flow failed: ${msg}`, {}, businessId);
    return fail(msg);
  }
}
