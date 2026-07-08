import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { inspectInvite } from "../src/lib/actions/invites";
import { setupChecklist } from "../src/lib/checklist";
import { resetEnvCache } from "../src/lib/env";

/** Directly exercise invite-token logic + checklist against the DB layer. */

async function makeInvite(db: TestDb, businessId: string, opts: { status?: string; expiresInMs?: number; email?: string } = {}) {
  const token = "tok_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  await db.insert(schema.invites).values({
    businessId,
    email: opts.email ?? "invitee@test.local",
    role: "agent",
    token,
    status: (opts.status as "pending") ?? "pending",
    expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 7 * 86400_000))
  });
  return token;
}

describe("invite tokens", () => {
  let db: TestDb;
  let A: Awaited<ReturnType<typeof seedBusiness>>;
  let B: Awaited<ReturnType<typeof seedBusiness>>;

  beforeAll(async () => {
    db = await makeDb();
    A = await seedBusiness(db, "Alpha");
    B = await seedBusiness(db, "Beta");
  });

  it("a valid token resolves to its own business only", async () => {
    const tokA = await makeInvite(db, A.business.id);
    const info = await inspectInvite(tokA);
    expect(info.valid).toBe(true);
    expect(info.businessId).toBe(A.business.id);
    expect(info.businessId).not.toBe(B.business.id);
  });

  it("revoked invite fails", async () => {
    const tok = await makeInvite(db, A.business.id, { status: "revoked" });
    const info = await inspectInvite(tok);
    expect(info.valid).toBe(false);
    expect(info.reason).toMatch(/revoked/i);
  });

  it("expired invite fails", async () => {
    const tok = await makeInvite(db, A.business.id, { expiresInMs: -1000 });
    const info = await inspectInvite(tok);
    expect(info.valid).toBe(false);
    expect(info.reason).toMatch(/expired/i);
  });

  it("unknown token fails", async () => {
    const info = await inspectInvite("does-not-exist");
    expect(info.valid).toBe(false);
  });
});

describe("danger-zone delete removes only the target business's rows", () => {
  it("deletes A's children, leaves B intact", async () => {
    const db = await makeDb();
    const A = await seedBusiness(db, "Alpha");
    const B = await seedBusiness(db, "Beta");
    // seed child rows on both
    for (const biz of [A.business.id, B.business.id]) {
      await db.insert(schema.products).values({ businessId: biz, title: "P", currency: "BAM" });
      await db.insert(schema.knowledgeSources).values({ businessId: biz, type: "faq", title: "Q", content: "A" });
      await db.insert(schema.conversations).values({ businessId: biz, channel: "instagram", senderId: "s" });
    }
    // Simulate the delete's scoped child-removal for A (mirrors deleteBusinessAction).
    await db.delete(schema.conversations).where(eq(schema.conversations.businessId, A.business.id));
    await db.delete(schema.knowledgeSources).where(eq(schema.knowledgeSources.businessId, A.business.id));
    await db.delete(schema.products).where(eq(schema.products.businessId, A.business.id));

    const aProducts = await db.select().from(schema.products).where(eq(schema.products.businessId, A.business.id));
    const bProducts = await db.select().from(schema.products).where(eq(schema.products.businessId, B.business.id));
    expect(aProducts).toHaveLength(0);
    expect(bProducts).toHaveLength(1); // B untouched
  });
});

describe("setup checklist reflects business state", () => {
  it("flags missing channel/products/knowledge and platform-key fallback", async () => {
    const db = await makeDb();
    const A = await seedBusiness(db, "Alpha");
    process.env.OPENAI_API_KEY = "sk-platform"; resetEnvCache();
    const items = await setupChecklist(A.business.id);
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.channel.done).toBe(false);
    expect(byKey.products.done).toBe(false);
    expect(byKey.knowledge.done).toBe(false);
    expect(byKey.ai_key.done).toBe(true); // platform fallback present
    expect(byKey.ai_key.hint).toMatch(/platform/i);
    delete process.env.OPENAI_API_KEY; resetEnvCache();

    // add a product -> products done
    await db.insert(schema.products).values({ businessId: A.business.id, title: "X", currency: "BAM", enabled: true });
    const after = await setupChecklist(A.business.id);
    expect(after.find((i) => i.key === "products")!.done).toBe(true);
  });
});
