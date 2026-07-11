import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import {
  botSettings,
  businesses,
  catalogSnapshots,
  knowledgeSources,
  learningMemories,
  products,
  tenantConfigs
} from "../src/lib/db/schema";
import {
  syncAllN8nRuntimeDataForBusiness,
  syncCatalogSnapshotForBusiness,
  syncLearningMemoriesForBusiness,
  syncTenantConfigForBusiness
} from "../src/lib/n8n-sync";
import { runEngine, runEngineForInbound } from "../src/lib/engine";
import { clientIdFor } from "../src/lib/tenant";

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
});

async function addProduct(businessId: string, title: string, extra: Partial<typeof products.$inferInsert> = {}) {
  const [p] = await db.insert(products).values({ businessId, title, ...extra }).returning();
  return p;
}

describe("n8n runtime data sync", () => {
  it("upserts exactly one tenant_configs row and is idempotent", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await syncTenantConfigForBusiness(business.id);
    await syncTenantConfigForBusiness(business.id);
    const rows = await db.select().from(tenantConfigs).where(eq(tenantConfigs.businessId, business.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].clientId).toBe(clientIdFor(business)); // n8n tenant id (slug of name), not the UUID
  });

  it("projects runtime bot/business settings into tenant_configs", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await db.update(businesses).set({ aiMode: "live", defaultLanguage: "sr", plan: "pro" }).where(eq(businesses.id, business.id));
    await db
      .update(botSettings)
      .set({ tone: "luxury", persiranje: false, aiStrategy: "ai_heavy", imageRecognitionEnabled: true, handoffThreshold: 70 })
      .where(eq(botSettings.businessId, business.id));
    await syncTenantConfigForBusiness(business.id);
    const [cfg] = await db.select().from(tenantConfigs).where(eq(tenantConfigs.businessId, business.id));
    expect(cfg.botMode).toBe("live");
    expect(cfg.plan).toBe("pro");
    expect(cfg.tone).toBe("luxury");
    expect(cfg.persiranje).toBe(false);
    expect(cfg.aiStrategy).toBe("ai_heavy");
    expect(cfg.imageRecognitionEnabled).toBe(true);
    expect(cfg.handoffThreshold).toBe(70);
    expect(cfg.defaultLanguage).toBe("sr");
  });

  it("writes one catalog_snapshots row per product with core fields", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await addProduct(business.id, "Red Dress", { price: "49.90", currency: "BAM", stockStatus: "available", colors: ["red"], sizes: ["M", "L"] });
    await syncCatalogSnapshotForBusiness(business.id);
    const [snap] = await db.select().from(catalogSnapshots).where(eq(catalogSnapshots.businessId, business.id));
    expect(snap.title).toBe("Red Dress");
    expect(snap.price).toBe("49.90");
    expect(snap.stockStatus).toBe("available");
    expect(snap.colors).toEqual(["red"]);
    expect(snap.sizes).toEqual(["M", "L"]);
    expect(snap.clientId).toBe(clientIdFor(business)); // n8n tenant id, not the UUID
  });

  it("prunes catalog snapshots when a product is deleted", async () => {
    const { business } = await seedBusiness(db, "Shop");
    const p1 = await addProduct(business.id, "Keep");
    const p2 = await addProduct(business.id, "Remove");
    await syncCatalogSnapshotForBusiness(business.id);
    expect(await db.select().from(catalogSnapshots).where(eq(catalogSnapshots.businessId, business.id))).toHaveLength(2);
    await db.delete(products).where(eq(products.id, p2.id));
    await syncCatalogSnapshotForBusiness(business.id);
    const rows = await db.select().from(catalogSnapshots).where(eq(catalogSnapshots.businessId, business.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].productId).toBe(p1.id);
  });

  it("keeps catalog snapshots tenant-scoped (A's sync never writes B's products)", async () => {
    const a = await seedBusiness(db, "Alpha");
    const b = await seedBusiness(db, "Beta");
    await addProduct(a.business.id, "A-item");
    await addProduct(b.business.id, "B-item");
    await syncCatalogSnapshotForBusiness(a.business.id);
    const rows = await db.select().from(catalogSnapshots);
    expect(rows).toHaveLength(1);
    expect(rows[0].businessId).toBe(a.business.id);
    expect(rows[0].title).toBe("A-item");
  });

  it("maps knowledge_sources types into learning_memories source_type", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await db.insert(knowledgeSources).values([
      { businessId: business.id, type: "faq", title: "Dostava?", content: "Za 2 dana.", status: "active" },
      { businessId: business.id, type: "url", title: "O nama", content: "Sadržaj sajta", sourceUrl: "https://x.test", status: "active" },
      { businessId: business.id, type: "old_chats", title: "Stari razgovori", content: "...", status: "active" }
    ]);
    await syncLearningMemoriesForBusiness(business.id);
    const rows = await db.select().from(learningMemories).where(eq(learningMemories.businessId, business.id));
    const types = rows.map((r) => r.sourceType);
    expect(types).toContain("faq");
    expect(types).toContain("website");
    expect(types).toContain("old_chats");
  });

  it("synthesizes learning_memories from bot settings (instructions/oldchats/faq/tone)", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await db
      .update(botSettings)
      .set({
        customInstructions: "Uvek budi ljubazan.",
        oldChatsSummary: "Kupci pitaju za dostavu.",
        faq: [{ q: "Radno vreme?", a: "9-17h" }],
        tone: "friendly"
      })
      .where(eq(botSettings.businessId, business.id));
    await syncLearningMemoriesForBusiness(business.id);
    const rows = await db.select().from(learningMemories).where(eq(learningMemories.businessId, business.id));
    const ids = rows.map((r) => r.sourceId);
    expect(ids).toContain(`${business.id}:instructions`);
    expect(ids).toContain(`${business.id}:oldchats`);
    expect(ids).toContain(`${business.id}:faq`);
    expect(ids).toContain(`${business.id}:tone`);
    expect(rows.find((r) => r.sourceId === `${business.id}:faq`)!.content).toContain("Radno vreme?");
  });

  it("marks archived knowledge sources as disabled memories (kept, not shown)", async () => {
    const { business } = await seedBusiness(db, "Shop");
    const [src] = await db
      .insert(knowledgeSources)
      .values({ businessId: business.id, type: "manual", title: "Politika", content: "x", status: "active" })
      .returning();
    await syncLearningMemoriesForBusiness(business.id);
    expect((await db.select().from(learningMemories).where(eq(learningMemories.sourceId, src.id)))[0].enabled).toBe(true);
    await db.update(knowledgeSources).set({ status: "archived" }).where(eq(knowledgeSources.id, src.id));
    await syncLearningMemoriesForBusiness(business.id);
    expect((await db.select().from(learningMemories).where(eq(learningMemories.sourceId, src.id)))[0].enabled).toBe(false);
  });

  it("keeps learning_memories tenant-scoped", async () => {
    const a = await seedBusiness(db, "Alpha");
    const b = await seedBusiness(db, "Beta");
    await db.insert(knowledgeSources).values({ businessId: a.business.id, type: "faq", title: "A-faq", content: "a", status: "active" });
    await db.insert(knowledgeSources).values({ businessId: b.business.id, type: "faq", title: "B-faq", content: "b", status: "active" });
    await syncLearningMemoriesForBusiness(a.business.id);
    const rows = await db.select().from(learningMemories);
    expect(rows.every((r) => r.businessId === a.business.id)).toBe(true);
  });

  it("syncAllN8nRuntimeDataForBusiness populates all three tables at once", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await addProduct(business.id, "Item");
    await db.insert(knowledgeSources).values({ businessId: business.id, type: "faq", title: "Q", content: "A", status: "active" });
    await syncAllN8nRuntimeDataForBusiness(business.id);
    expect(await db.select().from(tenantConfigs).where(eq(tenantConfigs.businessId, business.id))).toHaveLength(1);
    expect((await db.select().from(catalogSnapshots).where(eq(catalogSnapshots.businessId, business.id))).length).toBeGreaterThan(0);
    expect((await db.select().from(learningMemories).where(eq(learningMemories.businessId, business.id))).length).toBeGreaterThan(0);
  });

  it("image recognition DISABLED → asks for a text description and never calls vision", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await db.update(botSettings).set({ imageRecognitionEnabled: false }).where(eq(botSettings.businessId, business.id));
    const describeImage = vi.fn(async () => "crvena haljina");
    const r = await runEngine(business.id, "", { imageUrl: "https://cdn.test/a.jpg", describeImage });
    expect(describeImage).not.toHaveBeenCalled();
    expect(r.reply.toLowerCase()).toMatch(/opisati|describe/);
  });

  it("image recognition ENABLED → calls the tenant vision describer with the URL", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await db.update(botSettings).set({ imageRecognitionEnabled: true }).where(eq(botSettings.businessId, business.id));
    const describeImage = vi.fn(async () => "crvena haljina");
    await runEngine(business.id, "", { imageUrl: "https://cdn.test/a.jpg", describeImage });
    expect(describeImage).toHaveBeenCalledTimes(1);
    expect(describeImage).toHaveBeenCalledWith("https://cdn.test/a.jpg");
  });

  it("runEngineForInbound resolves the tenant by client_id and returns its businessId", async () => {
    const { business } = await seedBusiness(db, "Shop");
    const r = await runEngineForInbound({ clientId: business.id, message: "zdravo" });
    expect(r.businessId).toBe(business.id);
  });

  it("runEngineForInbound rejects an unknown client_id (no tenant guessing)", async () => {
    await seedBusiness(db, "Shop");
    await expect(runEngineForInbound({ clientId: "totally-unknown", message: "hi" })).rejects.toThrow(/unknown client_id/);
  });
});
