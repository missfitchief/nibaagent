import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { metaConnections } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only verification endpoint. Returns ONLY safe, non-secret columns from
 * meta_connections so an operator can confirm a tenant persisted correctly —
 * the exact projection is a hard allow-list; NO token/secret column is ever
 * selected or returned. Optional ?businessId=<uuid> filter.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
  const safe = {
    id: metaConnections.id,
    clientId: metaConnections.clientId,
    businessId: metaConnections.businessId,
    businessName: metaConnections.businessName,
    pageId: metaConnections.pageId,
    pageName: metaConnections.pageName,
    instagramBusinessAccountId: metaConnections.instagramBusinessAccountId,
    status: metaConnections.status,
    plan: metaConnections.plan,
    connectionType: metaConnections.connectionType,
    connectedAt: metaConnections.connectedAt,
    updatedAt: metaConnections.updatedAt
  };

  const base = db().select(safe).from(metaConnections);
  const rows = businessId
    ? await base.where(eq(metaConnections.businessId, businessId)).orderBy(desc(metaConnections.updatedAt))
    : await base.orderBy(desc(metaConnections.updatedAt)).limit(200);

  return NextResponse.json({ ok: true, count: rows.length, connections: rows });
}
