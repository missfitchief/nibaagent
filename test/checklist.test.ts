import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import { metaConnections } from "../src/lib/db/schema";
import { missingSetup, setupChecklist } from "../src/lib/checklist";

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
});

const channelDone = async (businessId: string) => (await setupChecklist(businessId)).find((i) => i.key === "channel")!.done;

describe("setup checklist — Facebook/Instagram connected", () => {
  it("is TRUE when a connection has status 'active' (the bug: was matching only 'connected')", async () => {
    const { business } = await seedBusiness(db, "StarLight");
    await db.insert(metaConnections).values({ businessId: business.id, clientId: "starlight", pageId: "p1", status: "active", connectionType: "oauth" });
    expect(await channelDone(business.id)).toBe(true);
    expect(await missingSetup(business.id)).not.toContain("Facebook/Instagram connected");
  });

  it("still TRUE for legacy 'connected'/'partial' statuses", async () => {
    const a = await seedBusiness(db, "A");
    const b = await seedBusiness(db, "B");
    await db.insert(metaConnections).values({ businessId: a.business.id, clientId: "a", pageId: "pa", status: "connected", connectionType: "oauth" });
    await db.insert(metaConnections).values({ businessId: b.business.id, clientId: "b", pageId: "pb", status: "partial", connectionType: "oauth" });
    expect(await channelDone(a.business.id)).toBe(true);
    expect(await channelDone(b.business.id)).toBe(true);
  });

  it("is FALSE when there is no connection, or it is disconnected", async () => {
    const { business } = await seedBusiness(db, "Empty");
    expect(await channelDone(business.id)).toBe(false);
    await db.insert(metaConnections).values({ businessId: business.id, clientId: "empty", pageId: "px", status: "disconnected", connectionType: "oauth" });
    expect(await channelDone(business.id)).toBe(false);
    expect(await missingSetup(business.id)).toContain("Facebook/Instagram connected");
  });
});
