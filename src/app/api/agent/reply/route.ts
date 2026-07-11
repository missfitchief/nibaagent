import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runEngineForInbound } from "@/lib/engine";
import { logEvent } from "@/lib/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound reply endpoint for the shared n8n workflow. n8n forwards only:
 *   { client_id, message, image_url? }
 * The app resolves the tenant from client_id, loads THAT tenant's config /
 * catalog / knowledge, and — if the image URL is present AND the tenant has
 * image recognition enabled — describes the image with the tenant's own vision
 * key. Recognition never runs when disabled; nothing ever crosses tenants.
 *
 * Optional shared-secret gate: set AGENT_WEBHOOK_SECRET and have n8n send it in
 * the `x-agent-secret` header. Never returns tokens or secrets.
 */
const Payload = z.object({
  client_id: z.string().min(1).max(200),
  message: z.string().max(4000).optional().default(""),
  image_url: z.string().url().max(2000).optional()
});

export async function POST(request: NextRequest) {
  const secret = process.env.AGENT_WEBHOOK_SECRET ?? "";
  if (secret && (request.headers.get("x-agent-secret") ?? "") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = Payload.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  const { client_id, message, image_url } = parsed.data;

  try {
    const r = await runEngineForInbound({ clientId: client_id, message, imageUrl: image_url });
    return NextResponse.json({
      ok: true,
      businessId: r.businessId,
      intent: r.intent,
      reply: r.reply,
      handoff: r.handoffTriggered,
      launchMode: r.launchMode,
      shouldSend: r.shouldSend,
      replyDelaySeconds: r.replyDelaySeconds,
      aiCalled: r.aiCalled
    });
  } catch (err) {
    const msg = (err as Error).message ?? "error";
    if (msg === "unknown client_id") return NextResponse.json({ error: "unknown client_id" }, { status: 404 });
    await logEvent(null, "error", "ai_reply", `agent reply failed: ${msg}`);
    return NextResponse.json({ error: "reply failed" }, { status: 500 });
  }
}
