import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { getSession } from "@/lib/auth/session";

/**
 * Read-only production DB diagnostics. Inspects BOTH the pooled connection the
 * app uses (DATABASE_URL) and the direct/unpooled one (DATABASE_URL_UNPOOLED)
 * so we can detect a branch/DB split (app writes one, migrations read another).
 * Token/secret columns are REDACTED. No writes, no arbitrary SQL.
 * Auth: platform-admin session OR x-bootstrap-secret header (BOOTSTRAP_SECRET).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET_KEY = /token|secret|password|passwd/i;
function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = SECRET_KEY.test(k) ? (v ? "‹set›" : "‹empty›") : v;
  return out;
}

async function inspect(url: string) {
  if (!url) return { configured: false as const };
  let host = "unparseable";
  let database = "";
  try {
    const u = new URL(url);
    host = u.hostname;
    database = u.pathname.replace(/^\//, "");
  } catch {
    /* ignore */
  }
  const pool = new Pool({ connectionString: url, max: 2, ssl: { rejectUnauthorized: false } });
  const q = async (sql: string, params: unknown[] = []) => {
    try {
      const r = await pool.query(sql, params);
      return r.rows;
    } catch (e) {
      return [{ error: (e as Error).message }];
    }
  };
  try {
    const countRows = await q("SELECT count(*)::int AS n FROM meta_connections");
    const metaCount = (countRows[0] as { n?: number; error?: string }).n ?? countRows[0];
    const starlight = (await q("SELECT * FROM meta_connections WHERE client_id = $1 ORDER BY updated_at DESC", ["starlight"])).map((r) => redactRow(r as Record<string, unknown>));
    const recent = (await q("SELECT client_id, business_id, page_id, page_name, status, connection_type, updated_at FROM meta_connections ORDER BY updated_at DESC LIMIT 10")).map((r) => redactRow(r as Record<string, unknown>));
    const tenants = await q("SELECT client_id, name, plan, status FROM tenants ORDER BY created_at DESC LIMIT 10");
    const logs = await q("SELECT level, area, message, created_at FROM event_logs WHERE area IN ('meta_oauth','webhook_subscribe') ORDER BY created_at DESC LIMIT 25");
    return { configured: true as const, host, database, meta_count: metaCount, meta_connections_starlight: starlight, meta_recent: recent, tenants, recent_meta_logs: logs };
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  const secret = process.env.BOOTSTRAP_SECRET ?? "";
  const bySecret = Boolean(secret) && (request.headers.get("x-bootstrap-secret") ?? "") === secret;
  if (session?.role !== "admin" && !bySecret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const appUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || "";
  const [appDb, directDb] = await Promise.all([inspect(appUrl), inspect(directUrl)]);
  const sameHost = appDb.configured && directDb.configured && appDb.host === directDb.host && appDb.database === directDb.database;

  return NextResponse.json({
    ok: true,
    app_db_DATABASE_URL: appDb, // what the OAuth callback writes to
    direct_db_UNPOOLED: directDb, // what migrations/bootstrap use
    same_database: sameHost
  });
}
