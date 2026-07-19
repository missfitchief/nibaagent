import { NextRequest, NextResponse, after } from "next/server";
import crypto from "node:crypto";
import { resolvePlatform } from "@/lib/platform";
import { logEvent, metaCreds } from "@/lib/meta";
import { processMetaWebhook } from "@/lib/meta-webhook-processor";

/**
 * Meta webhook endpoint — the app owns the whole message loop (no n8n).
 *
 *  GET  — the subscription handshake. Meta calls with hub.verify_token; we echo
 *         hub.challenge only when the token matches the RESOLVED verify token
 *         (DB platform setting → env fallback).
 *  POST — inbound events. We verify the X-Hub-Signature-256 against the RESOLVED
 *         app secret (when META_REQUIRE_SIGNATURE is on), answer 200 immediately
 *         (Meta retries on slow webhooks), then process the events after the
 *         response: dedupe → tenant resolve → conversation memory → engine →
 *         send the reply through the Meta Send API.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token") ?? "";
  const challenge = p.get("hub.challenge") ?? "";
  const expected = (await resolvePlatform("META_VERIFY_TOKEN")).value;
  if (mode === "subscribe" && expected && token === expected) {
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const require = (await resolvePlatform("META_REQUIRE_SIGNATURE")).value !== "false";
  if (require) {
    const { appSecret } = await metaCreds();
    const sig = request.headers.get("x-hub-signature-256") ?? "";
    if (!appSecret || !verifySignature(raw, sig, appSecret)) {
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }
  }
  // Acknowledge immediately so Meta never retries, then run the reply pipeline
  // after the response has been sent.
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // unparseable → ack and drop
  }
  const payload = body;
  after(async () => {
    try {
      const res = await processMetaWebhook(payload);
      if (res.received > 0) {
        await logEvent(null, "info", "webhook_receive", `Processed ${res.received} event(s), replied to ${res.replied}`);
      }
    } catch (err) {
      await logEvent(null, "error", "webhook_receive", `Webhook processing crashed: ${(err as Error).message}`);
    }
  });
  return NextResponse.json({ ok: true });
}

/** Constant-time compare of sha256=<hex> against HMAC of the raw body. */
function verifySignature(body: string, header: string, appSecret: string): boolean {
  if (!header.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(body, "utf8").digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
