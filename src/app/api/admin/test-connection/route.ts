import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { metaConnections } from "@/lib/db/schema";
import { decryptToken } from "@/lib/crypto";
import { getSession } from "@/lib/auth/session";
import { accessForUser } from "@/lib/auth/guards";

/**
 * Validate a saved Meta connection against the Graph API. Reads meta_connections
 * (by client_id or businessId), uses the stored page token to check the Facebook
 * Page and the linked Instagram business account, and reports OK/Error for each.
 * NEVER returns a token. Auth: admin session, business owner/admin, or the
 * x-bootstrap-secret header (for scripted verification during setup).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const G = "https://graph.facebook.com/v25.0";

async function graphOk(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "NibaChatAgent/1.0" } });
    const body = (await res.json()) as { name?: string; username?: string; id?: string; error?: { message?: string } };
    if (!res.ok || body.error) return { ok: false, detail: body.error?.message ?? `graph_${res.status}` };
    return { ok: true, detail: body.name || body.username || body.id || "ok" };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  const secret = process.env.BOOTSTRAP_SECRET ?? "";
  const bySecret = Boolean(secret) && (request.headers.get("x-bootstrap-secret") ?? "") === secret;
  const clientId = request.nextUrl.searchParams.get("clientId") ?? "";
  const businessId = request.nextUrl.searchParams.get("businessId") ?? "";

  // Access: platform admin / bootstrap secret, or a caller with access to the business.
  let allowed = session?.role === "admin" || bySecret;
  if (!allowed && session && businessId) allowed = Boolean(await accessForUser(session, businessId));
  if (!allowed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Which database is the app actually connected to? (host/name only, never password.)
  let dbHost = "";
  try {
    const u = new URL(process.env.DATABASE_URL || "");
    dbHost = `${u.hostname}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    dbHost = "unknown";
  }
  const [{ n: metaCount }] = await db().select({ n: sql<number>`count(*)::int` }).from(metaConnections);

  const where = clientId ? eq(metaConnections.clientId, clientId) : businessId ? eq(metaConnections.businessId, businessId) : undefined;
  if (!where) return NextResponse.json({ error: "provide clientId or businessId" }, { status: 400 });

  const [conn] = await db()
    .select()
    .from(metaConnections)
    .where(and(where))
    .orderBy(desc(metaConnections.updatedAt))
    .limit(1);
  if (!conn) return NextResponse.json({ ok: false, connected: false, db_host: dbHost, meta_connections_total: metaCount, error: "No meta_connections row for this tenant." });

  // Tokens live ONLY in the encrypted columns — decrypt at runtime.
  let pageToken = "";
  if (conn.encryptedPageAccessToken) {
    try {
      pageToken = decryptToken(conn.encryptedPageAccessToken);
    } catch {
      pageToken = "";
    }
  }
  if (!pageToken) {
    return NextResponse.json({
      ok: false,
      connected: true,
      client_id: conn.clientId,
      page_id: conn.pageId,
      facebookMessenger: "Error",
      instagramDirect: conn.instagramBusinessAccountId ? "Error" : "N/A",
      error: "No page access token stored."
    });
  }

  const fb = await graphOk(`${G}/${conn.pageId}?fields=name&access_token=${encodeURIComponent(pageToken)}`);
  const ig = conn.instagramBusinessAccountId
    ? await graphOk(`${G}/${conn.instagramBusinessAccountId}?fields=username&access_token=${encodeURIComponent(pageToken)}`)
    : null;

  return NextResponse.json({
    ok: true,
    connected: true,
    db_host: dbHost,
    meta_connections_total: metaCount,
    client_id: conn.clientId,
    business_name: conn.businessName,
    page_id: conn.pageId,
    page_name: conn.pageName,
    instagram_business_account_id: conn.instagramBusinessAccountId || null,
    status: conn.status,
    updated_at: conn.updatedAt,
    facebookMessenger: fb.ok ? "OK" : "Error",
    facebookDetail: fb.ok ? fb.detail : fb.detail.slice(0, 160),
    instagramDirect: ig ? (ig.ok ? "OK" : "Error") : "N/A",
    instagramDetail: ig ? (ig.ok ? ig.detail : ig.detail.slice(0, 160)) : "no IG account linked"
  });
}
