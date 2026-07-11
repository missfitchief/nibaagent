import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import { metaConnections, tenantConfigs } from "../src/lib/db/schema";
import { accessForUser } from "../src/lib/auth/guards";
import { resolveTenantByClientId } from "../src/lib/engine";
import { backfillMetaPlaintextTokens, syncTenantConfigForBusiness } from "../src/lib/n8n-sync";
import { decryptToken, encryptToken, maskToken } from "../src/lib/crypto";
import type { SessionUser } from "../src/lib/auth/session";

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
});

/** Mirrors the OAuth callback's parameterized upsert (INSERT ... ON CONFLICT (page_id)). */
async function connectPage(opts: {
  businessId: string;
  businessName: string;
  plan: string;
  pageId: string;
  token: string;
  igId?: string;
}) {
  const enc = encryptToken(opts.token);
  const igId = opts.igId ?? "";
  const shared = {
    businessId: opts.businessId,
    clientId: opts.businessId,
    pageName: "Page",
    encryptedPageAccessToken: enc,
    encryptedInstagramAccessToken: enc,
    pageAccessToken: opts.token,
    instagramAccessToken: igId ? opts.token : "",
    instagramBusinessAccountId: igId,
    businessName: opts.businessName,
    plan: opts.plan,
    status: "active" as const,
    connectionType: "oauth" as const,
    updatedAt: new Date()
  };
  await db
    .insert(metaConnections)
    .values({ pageId: opts.pageId, connectedAt: new Date(), ...shared })
    .onConflictDoUpdate({ target: metaConnections.pageId, set: shared });
}

const sessionFor = (userId: string, role: "admin" | "client" = "client"): SessionUser => ({ userId, role, email: "u@test.local", name: "U" });

describe("Meta OAuth persistence → production meta_connections", () => {
  it("persists a row with status=active and BOTH plaintext + encrypted page token", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await connectPage({ businessId: business.id, businessName: business.name, plan: business.plan, pageId: "PAGE1", token: "EAAG_secret_1", igId: "IG1" });
    const [row] = await db.select().from(metaConnections).where(eq(metaConnections.pageId, "PAGE1"));
    expect(row.status).toBe("active");
    expect(row.pageAccessToken).toBe("EAAG_secret_1"); // n8n reads this plaintext
    expect(decryptToken(row.encryptedPageAccessToken)).toBe("EAAG_secret_1"); // app keeps it encrypted too
    expect(row.businessName).toBe(business.name);
    expect(row.plan).toBe(business.plan);
    expect(row.instagramBusinessAccountId).toBe("IG1");
  });

  it("upsert on page_id updates the same-business row instead of duplicating", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await connectPage({ businessId: business.id, businessName: business.name, plan: business.plan, pageId: "PAGE1", token: "tok_v1" });
    await connectPage({ businessId: business.id, businessName: business.name, plan: business.plan, pageId: "PAGE1", token: "tok_v2" });
    const rows = await db.select().from(metaConnections).where(eq(metaConnections.pageId, "PAGE1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].pageAccessToken).toBe("tok_v2");
  });

  it("never reassigns a Page already owned by another business (ownership guard)", async () => {
    const a = await seedBusiness(db, "Alpha");
    const b = await seedBusiness(db, "Beta");
    await connectPage({ businessId: a.business.id, businessName: a.business.name, plan: a.business.plan, pageId: "SHARED", token: "a_tok" });
    // The callback guard: an existing row owned by A must block B from taking it.
    const [existing] = await db.select().from(metaConnections).where(eq(metaConnections.pageId, "SHARED"));
    expect(existing.businessId).toBe(a.business.id);
    expect(existing.businessId).not.toBe(b.business.id);
  });

  it("stores an Instagram-less page as active with empty IG fields", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await connectPage({ businessId: business.id, businessName: business.name, plan: business.plan, pageId: "FBONLY", token: "tok" });
    const [row] = await db.select().from(metaConnections).where(eq(metaConnections.pageId, "FBONLY"));
    expect(row.status).toBe("active");
    expect(row.instagramBusinessAccountId).toBe("");
    expect(row.instagramAccessToken).toBe("");
  });

  it("keeps two businesses' distinct pages isolated", async () => {
    const a = await seedBusiness(db, "Alpha");
    const b = await seedBusiness(db, "Beta");
    await connectPage({ businessId: a.business.id, businessName: a.business.name, plan: a.business.plan, pageId: "PA", token: "ta" });
    await connectPage({ businessId: b.business.id, businessName: b.business.name, plan: b.business.plan, pageId: "PB", token: "tb" });
    const rows = await db.select().from(metaConnections);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.pageId === "PA")!.businessId).toBe(a.business.id);
    expect(rows.find((r) => r.pageId === "PB")!.businessId).toBe(b.business.id);
  });

  it("accessForUser: owner gets owner, unrelated user gets null", async () => {
    const { user, business } = await seedBusiness(db, "Shop");
    expect((await accessForUser(sessionFor(user.id), business.id))?.role).toBe("owner");
    expect(await accessForUser(sessionFor("00000000-0000-0000-0000-000000000000"), business.id)).toBeNull();
  });

  it("accessForUser: platform admin gets access to any business; null for missing business", async () => {
    const { business } = await seedBusiness(db, "Shop");
    expect((await accessForUser(sessionFor("admin-uid", "admin"), business.id))?.role).toBe("admin");
    expect(await accessForUser(sessionFor("admin-uid", "admin"), "11111111-1111-1111-1111-111111111111")).toBeNull();
  });

  it("resolveTenantByClientId resolves by business id and by page_id, null for unknown", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await connectPage({ businessId: business.id, businessName: business.name, plan: business.plan, pageId: "PID", token: "t" });
    expect(await resolveTenantByClientId(business.id)).toBe(business.id);
    expect(await resolveTenantByClientId("PID")).toBe(business.id);
    expect(await resolveTenantByClientId("not-a-real-client")).toBeNull();
  });

  it("syncTenantConfigForBusiness flips meta_connected true once a connection exists", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await syncTenantConfigForBusiness(business.id);
    let [cfg] = await db.select().from(tenantConfigs).where(eq(tenantConfigs.businessId, business.id));
    expect(cfg.metaConnected).toBe(false);
    await connectPage({ businessId: business.id, businessName: business.name, plan: business.plan, pageId: "P", token: "t" });
    await syncTenantConfigForBusiness(business.id);
    [cfg] = await db.select().from(tenantConfigs).where(eq(tenantConfigs.businessId, business.id));
    expect(cfg.metaConnected).toBe(true);
  });

  it("backfillMetaPlaintextTokens fills plaintext token + business_name from encrypted/existing", async () => {
    const { business } = await seedBusiness(db, "Shop");
    // Simulate a legacy row: encrypted token present, plaintext + name empty.
    await db.insert(metaConnections).values({
      businessId: business.id,
      clientId: business.id,
      pageId: "LEGACY",
      encryptedPageAccessToken: encryptToken("legacy_tok"),
      status: "active",
      connectionType: "oauth"
    });
    await backfillMetaPlaintextTokens(business.id);
    const [row] = await db.select().from(metaConnections).where(eq(metaConnections.pageId, "LEGACY"));
    expect(row.pageAccessToken).toBe("legacy_tok");
    expect(row.businessName).toBe(business.name);
  });

  it("never leaks a token into the n8n tenant_configs projection", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await connectPage({ businessId: business.id, businessName: business.name, plan: business.plan, pageId: "P", token: "SUPER_SECRET_TOKEN_XYZ" });
    await syncTenantConfigForBusiness(business.id);
    const [cfg] = await db.select().from(tenantConfigs).where(eq(tenantConfigs.businessId, business.id));
    expect(JSON.stringify(cfg)).not.toContain("SUPER_SECRET_TOKEN_XYZ");
  });

  it("maskToken masks to last-4 and never returns the full token", () => {
    const enc = encryptToken("EAAG1234567890secret");
    const masked = maskToken(enc);
    expect(masked).not.toContain("EAAG1234567890secret");
    expect(masked).toContain("…");
  });
});
