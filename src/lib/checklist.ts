import "server-only";
import { and, count, eq } from "drizzle-orm";
import { db } from "./db/client";
import { businesses, knowledgeSources, metaConnections, products } from "./db/schema";
import { businessSecrets } from "./db/schema";
import { env } from "./env";

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  hint: string;
}

/**
 * Per-business setup validation — powers the client onboarding checklist and
 * the admin "missing setup items" view. Pure reads, business-scoped.
 */
export async function setupChecklist(businessId: string): Promise<ChecklistItem[]> {
  const d = db();
  const [biz] = await d.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) return [];

  const [conn] = await d
    .select({ n: count() })
    .from(metaConnections)
    .where(and(eq(metaConnections.businessId, businessId), eq(metaConnections.status, "connected")));
  const [know] = await d
    .select({ n: count() })
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.businessId, businessId), eq(knowledgeSources.status, "active")));
  const [prod] = await d.select({ n: count() }).from(products).where(and(eq(products.businessId, businessId), eq(products.enabled, true)));
  const secrets = await d.select({ kind: businessSecrets.kind }).from(businessSecrets).where(eq(businessSecrets.businessId, businessId));
  const hasOwnKey = secrets.some((s) => s.kind === "openai_api_key");
  const hasTelegram = secrets.some((s) => s.kind === "telegram_bot_token");
  const platformKey = Boolean(env().OPENAI_API_KEY);

  return [
    { key: "channel", label: "Facebook/Instagram connected", done: (conn?.n ?? 0) > 0, hint: "Connect a page so the bot can receive messages." },
    {
      key: "ai_key",
      label: "AI key available",
      done: hasOwnKey || platformKey,
      hint: hasOwnKey ? "Using this business's own OpenAI key." : platformKey ? "Using platform OpenAI key (fallback)." : "No OpenAI key — add one in Integrations."
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
