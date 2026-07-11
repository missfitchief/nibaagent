import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { metaConnections } from "@/lib/db/schema";
import { encryptToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { accessForUser } from "@/lib/auth/guards";
import { exchangeCodeForToken, fetchGrantedPages, logEvent, resolvedRedirectUri, subscribePageToApp, toLongLivedToken } from "@/lib/meta";
import { safeSyncAllN8n, syncTenantConfigForBusiness } from "@/lib/n8n-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth callback. Persists each granted Page to the PRODUCTION meta_connections
 * table so the shared n8n workflow can read it:
 *   code -> user token -> LONG-LIVED token -> granted pages (task-access fallback)
 *   -> parameterized upsert ON CONFLICT (page_id):
 *        page_access_token   (PLAINTEXT, n8n reads this)
 *        instagram_access_token (PLAINTEXT)
 *        encrypted_* mirrors (app keeps tokens encrypted at rest too)
 *        status='active'      (n8n treats active = connected)
 *        client_id/business_id/business_name/plan loaded SERVER-SIDE from the DB
 *   -> subscribe page to app  -> project runtime data into the n8n tables.
 *
 * Tenant is resolved ONLY from the signed state + the caller's session — never
 * from a page name or request param, and a Page owned by another tenant is never
 * reassigned. Logs are sanitized: no tokens, secrets, code or connection strings.
 */
export async function GET(request: NextRequest) {
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));
  const fail = (msg: string) => redirectTo(`/app/connect?error=${encodeURIComponent(msg.slice(0, 180))}`);

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const metaError = request.nextUrl.searchParams.get("error_description");
  if (metaError) return fail(metaError);
  if (!code || !state) return fail("Facebook did not return a login code.");

  // 1. Verify the signed state → tenant id (never trust an unsigned param).
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

  // 2. The caller must be signed in AND have access to this exact tenant. This
  //    also loads the tenant server-side (name/plan) — rejecting unknown tenants.
  const session = await getSession();
  if (!session) return fail("Please sign in again, then reconnect Facebook.");
  const access = await accessForUser(session, businessId);
  if (!access) {
    await logEvent(businessId, "warn", "meta_oauth", "callback rejected: caller has no access to tenant");
    return fail("You don't have access to this account. Sign in with the right account and try again.");
  }
  const business = access.business;

  try {
    // 3. Token exchange (short → long-lived) → granted pages.
    const shortToken = await exchangeCodeForToken(code, await resolvedRedirectUri());
    const longToken = await toLongLivedToken(shortToken);
    const pages = await fetchGrantedPages(longToken);
    await logEvent(businessId, "info", "meta_oauth", `token exchange ok; ${pages.length} page(s) granted`);
    if (!pages.length) {
      await logEvent(businessId, "warn", "meta_oauth", "OAuth completed but no pages were granted");
      return fail("No Facebook Page was granted. In the Facebook popup, make sure you SELECT your page (and Instagram account).");
    }

    let connectedAny = false;
    let webhookFailed = false;
    for (const page of pages) {
      const igId = page.instagram_business_account?.id ?? "";

      // Ownership guard: never reassign a Page already connected to another tenant.
      const existing = await db().select().from(metaConnections).where(eq(metaConnections.pageId, page.id)).limit(1);
      if (existing[0] && existing[0].businessId !== businessId) {
        await logEvent(businessId, "warn", "meta_oauth", `page ${page.id} already belongs to another account — skipped`);
        continue;
      }

      const encrypted = encryptToken(page.access_token);
      // Parameterized upsert (drizzle → INSERT ... ON CONFLICT (page_id) DO UPDATE).
      const shared = {
        businessId,
        clientId: businessId,
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
        updatedAt: new Date()
      };
      await db()
        .insert(metaConnections)
        .values({ pageId: page.id, connectedAt: new Date(), ...shared })
        .onConflictDoUpdate({ target: metaConnections.pageId, set: shared });
      await logEvent(businessId, "info", "meta_oauth", `stored connection for page ${page.id}${igId ? " (+IG)" : " (FB only)"}`);
      connectedAny = true;

      // 4. Subscribe the page to the app. On failure KEEP the row (it's stored),
      //    log a sanitized error and surface a warning — do not discard the token.
      try {
        await subscribePageToApp(page.id, page.access_token);
        await logEvent(businessId, "info", "webhook_subscribe", `page ${page.id} subscribed${igId ? ", IG " + igId : ", no IG"}`);
      } catch (err) {
        webhookFailed = true;
        await logEvent(businessId, "error", "webhook_subscribe", `subscribed_apps failed for ${page.id}: ${(err as Error).message}`);
      }
    }

    if (!connectedAny) return fail("That page is already connected to a different account.");

    // 5. Project this tenant's runtime data into the n8n tables.
    await syncTenantConfigForBusiness(businessId);
    await safeSyncAllN8n(businessId);

    return redirectTo(webhookFailed ? "/app/connect?connected=1&warning=webhook_subscription_failed" : "/app/connect?connected=1");
  } catch (err) {
    const msg = (err as Error).message ?? "unknown error";
    await logEvent(businessId, "error", "meta_oauth", `OAuth flow failed: ${msg}`);
    return fail(msg);
  }
}
