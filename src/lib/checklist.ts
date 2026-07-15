import "server-only";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "./db/client";
import { businesses, knowledgeSources, metaConnections, products } from "./db/schema";
import { businessSecrets } from "./db/schema";
import { resolveProviderRuntimeConfig } from "./ai-runtime";

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  hint: string;
}

/** A Meta connection counts as "connected" for any non-disconnected/error status. */
export const CONNECTED_STATUSES = ["active", "connected", "partial"] as const;

/**
 * Per-business setup validation — powers the client onboarding checklist and
 * the admin "missing setup items" view. Pure reads, business-scoped.
 */
export async function setupChecklist(businessId: string): Promise<ChecklistItem[]> {
  const d = db();
  const [biz] = await d.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) return [];

  // A saved connection has status 'active' (n8n convention); older rows may be
  // 'connected'/'partial'. Count any of them — NOT just 'connected'.
  const [conn] = await d
    .select({ n: count() })
    .from(metaConnections)
    .where(and(eq(metaConnections.businessId, businessId), inArray(metaConnections.status, [...CONNECTED_STATUSES])));
  const [know] = await d
    .select({ n: count() })
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.businessId, businessId), eq(knowledgeSources.status, "active")));
  const [prod] = await d.select({ n: count() }).from(products).where(and(eq(products.businessId, businessId), eq(products.enabled, true)));
  const secrets = await d.select({ kind: businessSecrets.kind }).from(businessSecrets).where(eq(businessSecrets.businessId, businessId));
  const hasTelegram = secrets.some((s) => s.kind === "telegram_bot_token");
  // Resolve the AI key the way the engine does (business key OR platform key from
  // App Settings/env, honoring the usage mode) — not just process.env.
  const ai = await resolveProviderRuntimeConfig(businessId);

  return [
    { key: "channel", label: "Facebook/Instagram connected", done: (conn?.n ?? 0) > 0, hint: "Connect a page so the bot can receive messages." },
    {
      key: "ai_key",
      label: "AI key available",
      done: ai.ready,
      hint: ai.ready
        ? ai.keySource === "business_key"
          ? "Using this business's own AI key."
          : "Using the platform AI key (fallback)."
        : "No AI key — add one in Integrations (business) or Admin → App Settings (platform)."
    },
    { key: "knowledge", label: "Knowledge added", done: (know?.n ?? 0) > 0, hint: "Add FAQs, delivery/payment info or a website." },
    { key: "products", label: "Products added", done: (prod?.n ?? 0) > 0, hint: "Add your catalog so the bot quotes real prices." },
    { key: "live", label: "Bot live", done: biz.aiMode === "live", hint: `Bot is ${biz.aiMode}. Set to live when ready.` },
    { key: "telegram", label: "Telegram notifications (optional)", done: hasTelegram, hint: "Optional — get handoff/order alerts." }
  ];
}

/** Admin "missing setup items" — just the not-done, non-optional entries. */
export async function missingSetup(businessId: string): Promise<string[]> {
  const items = await setupChecklist(businessId);
  return items.filter((i) => !i.done && i.key !== "telegram").map((i) => i.label);
}
