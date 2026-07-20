import { NextRequest, NextResponse } from "next/server";
import { checkMetaConnectionHealth } from "@/lib/meta-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron (see vercel.json): daily Meta token health check. Flips invalid
 * tokens to status="error" (the dashboard then shows a reconnect banner) and
 * healthy ones back to "active". FAIL CLOSED: no CRON_SECRET → 401.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await checkMetaConnectionHealth();
  return NextResponse.json({ ok: true, ...result });
}
