import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { getSession } from "@/lib/auth/session";

/**
 * Read-only production DB verification. Runs a FIXED set of SELECTs against the
 * runtime Neon database (process.env.DATABASE_URL) and returns the rows with all
 * token/secret columns REDACTED (shown as "‹set›"/"‹empty›", never the value).
 *
 * Auth: a logged-in platform admin (session) OR the x-bootstrap-secret header
 * (matching BOOTSTRAP_SECRET) so it can be run from a script during setup.
 * No writes, no arbitrary SQL, no tokens ever leave here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dbUrl(): string {
  return (
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ""
  );
}

const SECRET_KEY = /token|secret|password|passwd/i;
function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = SECRET_KEY.test(k) ? (v ? "‹set›" : "‹empty›") : v;
  }
  return out;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  const secret = process.env.BOOTSTRAP_SECRET ?? "";
  const provided = request.headers.get("x-bootstrap-secret") ?? "";
  const isAdmin = session?.role === "admin";
  const bySecret = Boolean(secret) && provided === secret;
  if (!isAdmin && !bySecret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = dbUrl();
  if (!url) return NextResponse.json({ error: "no database url in runtime env" }, { status: 500 });

  // Safe DB identity (host + database name only — never user/password).
  let dbInfo: Record<string, string> = {};
  try {
    const u = new URL(url);
    dbInfo = { host: u.hostname, database: u.pathname.replace(/^\//, ""), source: process.env.DATABASE_URL ? "DATABASE_URL" : "other" };
  } catch {
    dbInfo = { host: "unparseable", database: "" };
  }

  const pool = new Pool({ connectionString: url, max: 2, ssl: { rejectUnauthorized: false } });
  const safe = async (label: string, sql: string, params: unknown[] = []) => {
    try {
      const r = await pool.query(sql, params);
      return { rows: r.rows.map((row) => redactRow(row)), count: r.rowCount };
    } catch (err) {
      return { error: `${label}: ${(err as Error).message}` };
    }
  };
  const tenantsOrdered = async () => {
    const a = await safe("tenants", "SELECT * FROM tenants ORDER BY created_at DESC LIMIT 20");
    return "error" in a ? await safe("tenants", "SELECT * FROM tenants LIMIT 20") : a;
  };

  try {
    const tables = await safe(
      "tables",
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    );
    const [tenants, metaAll, metaStarlight, businesses] = await Promise.all([
      tenantsOrdered(),
      safe("meta_connections", "SELECT * FROM meta_connections ORDER BY updated_at DESC LIMIT 20"),
      safe("meta_starlight", "SELECT * FROM meta_connections WHERE client_id = $1 ORDER BY updated_at DESC", ["starlight"]),
      safe("businesses", "SELECT id, name, slug, client_id, plan, status FROM businesses ORDER BY created_at DESC LIMIT 20")
    ]);
    return NextResponse.json({
      ok: true,
      db: dbInfo,
      tables,
      tenants,
      meta_connections: metaAll,
      meta_connections_starlight: metaStarlight,
      businesses
    });
  } finally {
    await pool.end().catch(() => {});
  }
}
