import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import { businesses, metaConnections } from "../src/lib/db/schema";
import { clientIdFor, slugify } from "../src/lib/tenant";
import { resolveTenantByClientId } from "../src/lib/engine";

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
});

/** Mirror the callback/manual upsert shape: client_id = tenant id, business_id = UUID. */
async function connect(businessId: string, clientId: string, businessName: string) {
  await db.insert(metaConnections).values({
    businessId,
    clientId,
    pageId: `page-${businessId.slice(0, 8)}`,
    pageName: "Page",
    businessName,
    plan: "free",
    status: "active",
    connectionType: "oauth"
  });
}

describe("tenant client id", () => {
  it("slugify + clientIdFor produce 'starlight' from 'StarLight'", () => {
    expect(slugify("StarLight")).toBe("starlight");
    expect(slugify("Star Light Nakit")).toBe("star-light-nakit");
    expect(clientIdFor({ name: "StarLight" })).toBe("starlight"); // no explicit client id → name slug
    expect(clientIdFor({ clientId: "starlight", name: "Whatever" })).toBe("starlight"); // explicit wins
    expect(clientIdFor({ clientId: "  ", name: "Acme Shop" })).toBe("acme-shop");
  });

  it("a StarLight business writes client_id='starlight', keeps business_id as the UUID", async () => {
    const { business } = await seedBusiness(db, "StarLight");
    const clientId = clientIdFor(business); // '' explicit → slug of name → 'starlight'
    expect(clientId).toBe("starlight");
    await connect(business.id, clientId, business.name);

    // The user's verification query (by client_id) returns exactly one row.
    const rows = await db.select().from(metaConnections).where(eq(metaConnections.clientId, "starlight"));
    expect(rows).toHaveLength(1);
    expect(rows[0].clientId).toBe("starlight");
    expect(rows[0].businessId).toBe(business.id); // internal UUID preserved
    expect(rows[0].businessName).toBe("StarLight");
    expect(rows[0].status).toBe("active");
  });

  it("an explicit client_id on the business overrides the name slug", async () => {
    const { business } = await seedBusiness(db, "Star Light Nakit");
    await db.update(businesses).set({ clientId: "starlight" }).where(eq(businesses.id, business.id));
    const [biz] = await db.select().from(businesses).where(eq(businesses.id, business.id));
    expect(clientIdFor(biz)).toBe("starlight");
  });

  it("resolveTenantByClientId('starlight') resolves to the internal business id (n8n lookup)", async () => {
    const { business } = await seedBusiness(db, "StarLight");
    await connect(business.id, "starlight", business.name);
    expect(await resolveTenantByClientId("starlight")).toBe(business.id);
  });
});
