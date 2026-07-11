import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import { businesses, catalogSnapshots, learningMemories, metaConnections, tenantConfigs, tenants } from "../src/lib/db/schema";
import { propagateClientId, syncTenantForBusiness } from "../src/lib/n8n-sync";
import { safeReturnUrl } from "../src/lib/tenant";

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
});

describe("tenants registry sync", () => {
  it("upserts one tenants row per business, keyed by business_id (idempotent)", async () => {
    const { business } = await seedBusiness(db, "StarLight");
    await syncTenantForBusiness(business.id);
    await syncTenantForBusiness(business.id);
    const rows = await db.select().from(tenants).where(eq(tenants.businessId, business.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].clientId).toBe("starlight");
    expect(rows[0].name).toBe("StarLight");
  });
});

describe("propagateClientId", () => {
  it("rewrites client_id across meta_connections + all n8n tables + tenants", async () => {
    const { business } = await seedBusiness(db, "Old Name");
    // Rows currently under the old auto-slug client id.
    await db.insert(metaConnections).values({ businessId: business.id, clientId: "old-name", pageId: "p1", status: "active", connectionType: "oauth" });
    await db.insert(tenantConfigs).values({ businessId: business.id, clientId: "old-name" });
    await db.insert(catalogSnapshots).values({ businessId: business.id, clientId: "old-name", productId: "x" });
    await db.insert(learningMemories).values({ businessId: business.id, clientId: "old-name", sourceId: "s", sourceType: "faq", title: "t", content: "c" });
    await db.update(businesses).set({ clientId: "starlight" }).where(eq(businesses.id, business.id));

    await propagateClientId(business.id, "starlight");

    expect((await db.select().from(metaConnections).where(eq(metaConnections.businessId, business.id)))[0].clientId).toBe("starlight");
    expect((await db.select().from(tenantConfigs).where(eq(tenantConfigs.businessId, business.id)))[0].clientId).toBe("starlight");
    expect((await db.select().from(catalogSnapshots).where(eq(catalogSnapshots.businessId, business.id)))[0].clientId).toBe("starlight");
    expect((await db.select().from(learningMemories).where(eq(learningMemories.businessId, business.id)))[0].clientId).toBe("starlight");
    expect((await db.select().from(tenants).where(eq(tenants.businessId, business.id)))[0].clientId).toBe("starlight");
  });
});

describe("safeReturnUrl (fixes post-connect business jump / open redirect)", () => {
  const fb = "/admin/businesses/abc?tab=channels";
  it("accepts same-origin /app and /admin paths", () => {
    expect(safeReturnUrl("/app/connect", fb)).toBe("/app/connect");
    expect(safeReturnUrl("/admin/businesses/xyz?tab=channels", fb)).toBe("/admin/businesses/xyz?tab=channels");
  });
  it("rejects external / protocol-relative / traversal / other paths → fallback", () => {
    expect(safeReturnUrl("https://evil.com", fb)).toBe(fb);
    expect(safeReturnUrl("//evil.com", fb)).toBe(fb);
    expect(safeReturnUrl("/etc/passwd", fb)).toBe(fb);
    expect(safeReturnUrl("/login", fb)).toBe(fb);
    expect(safeReturnUrl("", fb)).toBe(fb);
    expect(safeReturnUrl(null, fb)).toBe(fb);
    expect(safeReturnUrl("/app//x", fb)).toBe(fb); // no double slash
  });
});
