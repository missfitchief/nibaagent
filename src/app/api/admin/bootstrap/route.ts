import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

/**
 * ONE-TIME setup endpoint. Runs the SQL migrations and seeds an admin user,
 * using the runtime database URL (readable in the Vercel runtime even though
 * `vercel env pull` redacts integration-managed vars). Guarded by
 * BOOTSTRAP_SECRET so it can't be triggered by anyone else. Idempotent: safe
 * to call more than once. Remove BOOTSTRAP_SECRET (or this file) after setup.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dbUrl(): string {
  // Unpooled/direct connection is safest for DDL (pooled = pgbouncer txn mode).
  return (
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ""
  );
}

export async function POST(request: NextRequest) {
  const secret = process.env.BOOTSTRAP_SECRET ?? "";
  const provided = request.headers.get("x-bootstrap-secret") ?? "";
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = dbUrl();
  if (!url) return NextResponse.json({ error: "no database url in runtime env" }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string; seedDemo?: boolean };
  const email = (body.email ?? process.env.ADMIN_EMAIL ?? "").toLowerCase().trim();
  const password = body.password ?? process.env.ADMIN_PASSWORD ?? "";

  const pool = new Pool({ connectionString: url, max: 2, ssl: { rejectUnauthorized: false } });
  const applied: string[] = [];
  try {
    // ---- migrations ----
    const dir = path.join(process.cwd(), "drizzle");
    await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const done = new Set((await pool.query("SELECT name FROM _migrations")).rows.map((r: { name: string }) => r.name));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), "utf8").split("--> statement-breakpoint").join(";\n");
      await pool.query(sql);
      await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
      applied.push(file);
    }

    // ---- admin seed (optional) ----
    let adminResult = "skipped (no email/password provided)";
    if (email && password) {
      const hash = await bcrypt.hash(password, 11);
      const existing = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
      if (existing.rows[0]) {
        await pool.query("UPDATE users SET password_hash = $1, role = 'admin' WHERE email = $2", [hash, email]);
        adminResult = `updated admin ${email}`;
      } else {
        await pool.query("INSERT INTO users (email, name, password_hash, role) VALUES ($1, 'Admin', $2, 'admin')", [email, hash]);
        adminResult = `created admin ${email}`;
      }
    }

    // ---- optional demo business (so a fresh prod isn't empty) ----
    let demoResult = "not requested";
    if (body.seedDemo && email) {
      const owner = (await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [email])).rows[0] as { id: string } | undefined;
      if (owner) {
        const exists = (await pool.query("SELECT id FROM businesses WHERE slug = $1 LIMIT 1", ["demo-shop"])).rows[0];
        if (exists) {
          demoResult = "demo business already exists";
        } else {
          const biz = (
            await pool.query(
              "INSERT INTO businesses (owner_user_id, name, slug, default_language) VALUES ($1, 'Demo Shop', 'demo-shop', 'sr') RETURNING id",
              [owner.id]
            )
          ).rows[0] as { id: string };
          await pool.query("INSERT INTO bot_settings (business_id, tone) VALUES ($1, 'friendly')", [biz.id]);
          await pool.query("INSERT INTO subscriptions (business_id, plan, status) VALUES ($1, 'free', 'trial')", [biz.id]);
          await pool.query(
            "INSERT INTO products (business_id, title, description, price, currency, stock_status, enabled) VALUES ($1, 'Demo Necklace', 'Sample product', 29.90, 'BAM', 'available', true)",
            [biz.id]
          );
          await pool.query(
            "INSERT INTO knowledge_sources (business_id, type, title, content, status) VALUES ($1, 'faq', 'What is delivery price?', 'Delivery is 5 KM, free over 50 KM.', 'active')",
            [biz.id]
          );
          demoResult = "demo business created";
        }
      } else {
        demoResult = "admin owner not found — seed admin first";
      }
    }

    const migrationsCount = (await pool.query("SELECT count(*)::int AS n FROM _migrations")).rows[0].n;
    return NextResponse.json({ ok: true, appliedNow: applied, totalMigrations: migrationsCount, admin: adminResult, demo: demoResult });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
