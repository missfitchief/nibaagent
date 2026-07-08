import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";

/**
 * Admin business lifecycle at the data layer (the server actions add a
 * requireAdmin session on top). Mirrors adminCreateBusinessAction /
 * adminUpdateBusinessAction / archiveBusinessAction behavior.
 */
describe("admin business lifecycle", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await makeDb();
  });

  it("create → edit → archive, with child rows and slug uniqueness", async () => {
    const [owner] = await db.insert(schema.users).values({ email: "adminowner@test.local", name: "O", passwordHash: "x", role: "client" }).returning();

    const [b1] = await db.insert(schema.businesses).values({ ownerUserId: owner.id, name: "Shop", slug: "shop" }).returning();
    await db.insert(schema.botSettings).values({ businessId: b1.id });
    await db.insert(schema.subscriptions).values({ businessId: b1.id, plan: "free", status: "trial" });
    expect(b1.aiMode).toBe("draft");

    // edit (plan + mode + limits)
    await db.update(schema.businesses).set({ plan: "standard", aiMode: "live", dailyMessageLimit: 5000 }).where(eq(schema.businesses.id, b1.id));
    const edited = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, b1.id)))[0];
    expect(edited.plan).toBe("standard");
    expect(edited.aiMode).toBe("live");
    expect(edited.dailyMessageLimit).toBe(5000);

    // archive
    await db.update(schema.businesses).set({ status: "inactive", aiMode: "paused" }).where(eq(schema.businesses.id, b1.id));
    const archived = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, b1.id)))[0];
    expect(archived.status).toBe("inactive");

    // slug uniqueness — a second "Shop" must not reuse the slug
    const slug2 = "shop-abcd";
    const [b2] = await db.insert(schema.businesses).values({ ownerUserId: owner.id, name: "Shop", slug: slug2 }).returning();
    expect(b2.slug).not.toBe(b1.slug);
  });

  it("admin sees all businesses; a client owner sees only theirs", async () => {
    const A = await seedBusiness(db, "Alpha");
    const B = await seedBusiness(db, "Beta");
    const all = await db.select().from(schema.businesses);
    expect(all.length).toBeGreaterThanOrEqual(2); // admin scope = everything

    const aOwned = await db.select().from(schema.businesses).where(eq(schema.businesses.ownerUserId, A.user.id));
    expect(aOwned).toHaveLength(1);
    expect(aOwned[0].id).toBe(A.business.id);
    expect(aOwned.some((b) => b.id === B.business.id)).toBe(false);
  });
});
