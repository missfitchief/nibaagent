import "server-only";
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "./db/client";
import {
  botSettings,
  businesses,
  catalogSnapshots,
  knowledgeSources,
  learningMemories,
  metaConnections,
  products,
  tenantConfigs,
  tenants
} from "./db/schema";
import { decryptToken } from "./crypto";
import { clientIdFor } from "./tenant";
import { logEvent } from "./meta";

/**
 * ── n8n RUNTIME DATA SYNC ────────────────────────────────────────────────────
 * The shared n8n workflow reads each tenant's runtime config / catalog / memories
 * from the flat tenant_configs, catalog_snapshots and learning_memories tables.
 * The app owns the source of truth in its normal tables; these helpers project a
 * denormalized, tenant-scoped, timestamped copy into the n8n tables. All writes
 * are parameterized upserts (drizzle onConflictDoUpdate) — never string-built SQL.
 * Idempotent: re-running produces the same rows. Stale rows are pruned so n8n
 * never sees a product/memory that was deleted.
 */

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

/** Runtime bot/business config → tenant_configs (one row per tenant). */
export async function syncTenantConfigForBusiness(businessId: string): Promise<void> {
  const d = db();
  const [biz] = await d.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) return;
  const [settings] = await d.select().from(botSettings).where(eq(botSettings.businessId, businessId)).limit(1);
  const conns = await d.select().from(metaConnections).where(eq(metaConnections.businessId, businessId));
  const metaConnected = conns.some((c) => c.status === "active" || c.status === "connected" || c.status === "partial");
  const clientId = clientIdFor(biz); // stable n8n tenant id (e.g. "starlight")

  const row = {
    clientId,
    businessId,
    businessName: biz.name,
    plan: biz.plan,
    aiEnabled: biz.aiEnabled,
    botMode: biz.aiMode,
    defaultLanguage: biz.defaultLanguage,
    tone: settings?.tone ?? biz.tone,
    persiranje: settings?.persiranje ?? true,
    aiStrategy: settings?.aiStrategy ?? "rules_first",
    aiProvider: settings?.aiProvider ?? "openai",
    selectedModel: biz.selectedModel ?? "",
    imageRecognitionEnabled: settings?.imageRecognitionEnabled ?? false,
    handoffEnabled: biz.handoffEnabled,
    handoffThreshold: settings?.handoffThreshold ?? 40,
    unknownBehavior: settings?.unknownBehavior ?? "offer_handoff",
    businessHours: (settings?.businessHours as Record<string, unknown>) ?? {},
    telegramConnected: Boolean(biz.telegramChannelId),
    metaConnected,
    updatedAt: new Date()
  };

  await d.insert(tenantConfigs).values(row).onConflictDoUpdate({ target: tenantConfigs.businessId, set: row });
}

/** Product catalog → catalog_snapshots (one row per product; prunes removed ones). */
export async function syncCatalogSnapshotForBusiness(businessId: string): Promise<void> {
  const d = db();
  const [biz] = await d.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const clientId = biz ? clientIdFor(biz) : businessId;
  const prods = await d.select().from(products).where(eq(products.businessId, businessId));
  for (const p of prods) {
    const row = {
      clientId,
      businessId,
      productId: p.id,
      title: p.title,
      description: p.description,
      price: p.price,
      currency: p.currency,
      stockStatus: p.stockStatus,
      stockQuantity: p.stockQuantity,
      sku: p.sku,
      category: p.category,
      tags: asStrings(p.tags),
      colors: asStrings(p.colors),
      sizes: asStrings(p.sizes),
      url: p.url,
      enabled: p.enabled,
      updatedAt: new Date()
    };
    await d
      .insert(catalogSnapshots)
      .values(row)
      .onConflictDoUpdate({ target: [catalogSnapshots.businessId, catalogSnapshots.productId], set: row });
  }
  const ids = prods.map((p) => p.id);
  await d.delete(catalogSnapshots).where(
    ids.length
      ? and(eq(catalogSnapshots.businessId, businessId), notInArray(catalogSnapshots.productId, ids))
      : eq(catalogSnapshots.businessId, businessId)
  );
}

interface Memory {
  sourceId: string;
  sourceType: string;
  title: string;
  content: string;
  sourceUrl: string;
  enabled: boolean;
}

/** Knowledge (FAQ / website / policy / old-chats / instructions / tone) → learning_memories. */
export async function syncLearningMemoriesForBusiness(businessId: string): Promise<void> {
  const d = db();
  const [biz] = await d.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const clientId = biz ? clientIdFor(biz) : businessId;
  const [settings] = await d.select().from(botSettings).where(eq(botSettings.businessId, businessId)).limit(1);
  const sources = await d.select().from(knowledgeSources).where(eq(knowledgeSources.businessId, businessId));

  const mems: Memory[] = [];
  for (const s of sources) {
    const sourceType = s.type === "faq" ? "faq" : s.type === "url" ? "website" : s.type === "old_chats" ? "old_chats" : "knowledge";
    mems.push({ sourceId: s.id, sourceType, title: s.title, content: s.content, sourceUrl: s.sourceUrl, enabled: s.status === "active" });
  }
  if (settings?.customInstructions?.trim()) {
    mems.push({ sourceId: `${businessId}:instructions`, sourceType: "instructions", title: "Custom instructions", content: settings.customInstructions, sourceUrl: "", enabled: true });
  }
  if (settings?.oldChatsSummary?.trim()) {
    mems.push({ sourceId: `${businessId}:oldchats`, sourceType: "old_chats", title: "Old chats summary", content: settings.oldChatsSummary, sourceUrl: "", enabled: true });
  }
  const faq = ((settings?.faq as Array<{ q: string; a: string }>) ?? []).filter((f) => f?.q && f?.a);
  if (faq.length) {
    const content = faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
    mems.push({ sourceId: `${businessId}:faq`, sourceType: "faq", title: "FAQ", content, sourceUrl: "", enabled: true });
  }
  if (settings?.tone) {
    mems.push({ sourceId: `${businessId}:tone`, sourceType: "tone", title: "Tone", content: settings.tone, sourceUrl: "", enabled: true });
  }

  for (const m of mems) {
    const row = { clientId, businessId, ...m, updatedAt: new Date() };
    await d
      .insert(learningMemories)
      .values(row)
      .onConflictDoUpdate({ target: [learningMemories.businessId, learningMemories.sourceId], set: row });
  }
  const keep = mems.map((m) => m.sourceId);
  await d.delete(learningMemories).where(
    keep.length
      ? and(eq(learningMemories.businessId, businessId), notInArray(learningMemories.sourceId, keep))
      : eq(learningMemories.businessId, businessId)
  );
}

/**
 * Fill the plaintext token / business_name / plan columns for existing rows that
 * predate this migration (decrypting what's stored). Never logs token material.
 */
export async function backfillMetaPlaintextTokens(businessId: string): Promise<void> {
  const d = db();
  const [biz] = await d.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const rows = await d.select().from(metaConnections).where(eq(metaConnections.businessId, businessId));
  for (const r of rows) {
    const patch: Partial<typeof metaConnections.$inferInsert> = {};
    if (!r.pageAccessToken && r.encryptedPageAccessToken) {
      try {
        patch.pageAccessToken = decryptToken(r.encryptedPageAccessToken);
      } catch {
        /* skip undecryptable */
      }
    }
    if (!r.instagramAccessToken && r.encryptedInstagramAccessToken) {
      try {
        patch.instagramAccessToken = decryptToken(r.encryptedInstagramAccessToken);
      } catch {
        /* skip */
      }
    }
    if (biz && !r.businessName) patch.businessName = biz.name;
    if (biz && (!r.plan || r.plan === "free")) patch.plan = biz.plan;
    if (Object.keys(patch).length) {
      await d.update(metaConnections).set(patch).where(eq(metaConnections.id, r.id));
    }
  }
}

/** Business → tenants registry (n8n looks a tenant up by client_id). Upsert by business_id. */
export async function syncTenantForBusiness(businessId: string): Promise<void> {
  const d = db();
  const [biz] = await d.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) return;
  const row = { businessId, clientId: clientIdFor(biz), name: biz.name, plan: biz.plan, status: biz.status, updatedAt: new Date() };
  await d.insert(tenants).values(row).onConflictDoUpdate({ target: tenants.businessId, set: row });
}

/**
 * Propagate a business's client_id to EVERY table that stores it, so n8n stays
 * consistent when an admin renames the tenant id. Idempotent.
 */
export async function propagateClientId(businessId: string, clientId: string): Promise<void> {
  const d = db();
  await d.update(metaConnections).set({ clientId, updatedAt: new Date() }).where(eq(metaConnections.businessId, businessId));
  await d.update(tenantConfigs).set({ clientId, updatedAt: new Date() }).where(eq(tenantConfigs.businessId, businessId));
  await d.update(catalogSnapshots).set({ clientId, updatedAt: new Date() }).where(eq(catalogSnapshots.businessId, businessId));
  await d.update(learningMemories).set({ clientId, updatedAt: new Date() }).where(eq(learningMemories.businessId, businessId));
  await syncTenantForBusiness(businessId);
}

/** Sync everything n8n reads for one tenant (tenant registry + config + catalog + memories). */
export async function syncAllN8nRuntimeDataForBusiness(businessId: string): Promise<void> {
  await syncTenantForBusiness(businessId);
  await syncTenantConfigForBusiness(businessId);
  await syncCatalogSnapshotForBusiness(businessId);
  await syncLearningMemoriesForBusiness(businessId);
}

/**
 * Best-effort wrappers for use inside user-facing actions: a sync failure must
 * NEVER break the underlying save. Errors are logged (sanitized) and swallowed.
 */
async function runSafely(businessId: string, label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    await logEvent(businessId, "warn", "n8n_sync", `${label} failed: ${(err as Error).message}`.slice(0, 300));
  }
}

export const safeSyncTenantConfig = (businessId: string) => runSafely(businessId, "tenant_config sync", () => syncTenantConfigForBusiness(businessId));
export const safeSyncCatalog = (businessId: string) => runSafely(businessId, "catalog sync", () => syncCatalogSnapshotForBusiness(businessId));
export const safeSyncLearningMemories = (businessId: string) => runSafely(businessId, "memories sync", () => syncLearningMemoriesForBusiness(businessId));
export const safeSyncAllN8n = (businessId: string) => runSafely(businessId, "full n8n sync", () => syncAllN8nRuntimeDataForBusiness(businessId));
export const safePropagate = (businessId: string, clientId: string) => runSafely(businessId, "client_id propagate", () => propagateClientId(businessId, clientId));
