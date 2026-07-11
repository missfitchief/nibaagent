import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import { botSettings, businesses, eventLogs, learningMemories, metaConnections, products, tenantConfigs } from "../src/lib/db/schema";
import { purgeBusinessData } from "../src/lib/actions/danger";
import { runEngine } from "../src/lib/engine";

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
});

async function fill(businessId: string) {
  await db.insert(products).values({ businessId, title: "P", stockStatus: "available" });
  await db.insert(eventLogs).values({ businessId, level: "info", area: "admin", message: "x" });
  await db.insert(metaConnections).values({ businessId, clientId: businessId, pageId: `page-${businessId.slice(0, 8)}`, status: "active", connectionType: "manual" });
  await db.insert(tenantConfigs).values({ clientId: businessId, businessId });
  await db.insert(learningMemories).values({ clientId: businessId, businessId, sourceId: "s1", sourceType: "faq", title: "t", content: "c" });
}

describe("hard delete (purgeBusinessData)", () => {
  it("removes every tenant table for the target and leaves other tenants intact (FK-safe)", async () => {
    const a = await seedBusiness(db, "Alpha");
    const b = await seedBusiness(db, "Beta");
    await fill(a.business.id);
    await fill(b.business.id);

    await purgeBusinessData(a.business.id); // must NOT throw despite FKs (bot_settings, event_logs, etc.)

    // A is fully gone…
    expect(await db.select().from(businesses).where(eq(businesses.id, a.business.id))).toHaveLength(0);
    expect(await db.select().from(products).where(eq(products.businessId, a.business.id))).toHaveLength(0);
    expect(await db.select().from(eventLogs).where(eq(eventLogs.businessId, a.business.id))).toHaveLength(0);
    expect(await db.select().from(botSettings).where(eq(botSettings.businessId, a.business.id))).toHaveLength(0);
    expect(await db.select().from(metaConnections).where(eq(metaConnections.businessId, a.business.id))).toHaveLength(0);
    expect(await db.select().from(tenantConfigs).where(eq(tenantConfigs.businessId, a.business.id))).toHaveLength(0);
    expect(await db.select().from(learningMemories).where(eq(learningMemories.businessId, a.business.id))).toHaveLength(0);

    // …B is untouched (tenant-scoped).
    expect(await db.select().from(businesses).where(eq(businesses.id, b.business.id))).toHaveLength(1);
    expect(await db.select().from(products).where(eq(products.businessId, b.business.id))).toHaveLength(1);
    expect(await db.select().from(tenantConfigs).where(eq(tenantConfigs.businessId, b.business.id))).toHaveLength(1);
  });

  it("an archived (aiEnabled=false) business does not run the bot", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await db.update(businesses).set({ status: "inactive", aiEnabled: false, aiMode: "paused" }).where(eq(businesses.id, business.id));
    const r = await runEngine(business.id, "zdravo");
    expect(r.intent).toBe("no_ai");
    expect(r.shouldSend).toBe(false);
  });
});
