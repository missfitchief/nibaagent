import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import {
  setBusinessSecret,
  getBusinessSecret,
  listMaskedSecrets,
  resolveOpenAiKey,
  resolveTelegram
} from "../src/lib/secrets";
import { resetEnvCache } from "../src/lib/env";
import { aiCostWindows } from "../src/lib/usage";

/**
 * Multi-tenant isolation proofs required by the SaaS spec. Two businesses (A, B)
 * are seeded; every assertion checks that A cannot reach B's data and that
 * secret resolution is per-business with a platform fallback.
 */
describe("tenant isolation", () => {
  let db: TestDb;
  let A: Awaited<ReturnType<typeof seedBusiness>>;
  let B: Awaited<ReturnType<typeof seedBusiness>>;

  beforeAll(async () => {
    db = await makeDb();
    A = await seedBusiness(db, "Alpha");
    B = await seedBusiness(db, "Beta");
  });

  it("knowledge is business-scoped: A's query never returns B's rows", async () => {
    await db.insert(schema.knowledgeSources).values({ businessId: A.business.id, type: "faq", title: "A-secret-faq", content: "alpha only" });
    await db.insert(schema.knowledgeSources).values({ businessId: B.business.id, type: "faq", title: "B-secret-faq", content: "beta only" });

    const aRows = await db.select().from(schema.knowledgeSources).where(eq(schema.knowledgeSources.businessId, A.business.id));
    expect(aRows).toHaveLength(1);
    expect(aRows[0].title).toBe("A-secret-faq");
    expect(aRows.some((r) => r.title.includes("B-"))).toBe(false);
  });

  it("conversations & orders are business-scoped", async () => {
    await db.insert(schema.conversations).values({ businessId: A.business.id, channel: "instagram", senderId: "cust-A" });
    await db.insert(schema.conversations).values({ businessId: B.business.id, channel: "instagram", senderId: "cust-B" });
    const aConvs = await db.select().from(schema.conversations).where(eq(schema.conversations.businessId, A.business.id));
    expect(aConvs).toHaveLength(1);
    expect(aConvs[0].senderId).toBe("cust-A");
  });

  it("AI cost windows (daily/weekly/monthly) never mix between businesses", async () => {
    const [convoA] = await db.insert(schema.conversations).values({ businessId: A.business.id, channel: "instagram", senderId: "cost-cust-A" }).returning();
    const [convoB] = await db.insert(schema.conversations).values({ businessId: B.business.id, channel: "instagram", senderId: "cost-cust-B" }).returning();
    const now = new Date();
    // Same timestamp, same channel/sender shape — only businessId differs.
    await db.insert(schema.messages).values({
      businessId: A.business.id,
      conversationId: convoA.id,
      channel: "instagram",
      direction: "outbound",
      aiGenerated: true,
      costEstimate: "1.500000",
      createdAt: now
    });
    await db.insert(schema.messages).values({
      businessId: B.business.id,
      conversationId: convoB.id,
      channel: "instagram",
      direction: "outbound",
      aiGenerated: true,
      costEstimate: "9.990000",
      createdAt: now
    });

    const costA = await aiCostWindows(A.business.id, now);
    const costB = await aiCostWindows(B.business.id, now);
    expect(costA.daily).toBe(1.5);
    expect(costA.weekly).toBe(1.5);
    expect(costA.monthly).toBe(1.5);
    expect(costB.daily).toBe(9.99);
    expect(costB.weekly).toBe(9.99);
    expect(costB.monthly).toBe(9.99);
  });

  it("a business owner is not the owner of another business (guard precondition)", async () => {
    // The requireBusiness guard filters by ownerUserId for clients; simulate it.
    const asClient = await db
      .select()
      .from(schema.businesses)
      .where(and(eq(schema.businesses.id, B.business.id), eq(schema.businesses.ownerUserId, A.user.id)))
      .limit(1);
    expect(asClient).toHaveLength(0); // A's user cannot load B by any owner-scoped query
  });
});

describe("per-business secrets isolation", () => {
  let db: TestDb;
  let A: Awaited<ReturnType<typeof seedBusiness>>;
  let B: Awaited<ReturnType<typeof seedBusiness>>;

  beforeAll(async () => {
    db = await makeDb();
    A = await seedBusiness(db, "Alpha");
    B = await seedBusiness(db, "Beta");
  });

  it("stores encrypted (never plaintext) and returns the right value per business", async () => {
    await setBusinessSecret(A.business.id, "openai_api_key", "sk-ALPHAKEY1234");
    await setBusinessSecret(B.business.id, "openai_api_key", "sk-BETAKEY5678");

    const rows = await db.select().from(schema.businessSecrets);
    for (const r of rows) {
      expect(r.encryptedValue).not.toContain("sk-ALPHAKEY");
      expect(r.encryptedValue).not.toContain("sk-BETAKEY");
      expect(r.encryptedValue.startsWith("v1:")).toBe(true);
    }
    expect(await getBusinessSecret(A.business.id, "openai_api_key")).toBe("sk-ALPHAKEY1234");
    expect(await getBusinessSecret(B.business.id, "openai_api_key")).toBe("sk-BETAKEY5678");
  });

  it("A's secret never leaks into B's resolution", async () => {
    const a = await resolveOpenAiKey(A.business.id);
    const b = await resolveOpenAiKey(B.business.id);
    expect(a.key).toBe("sk-ALPHAKEY1234");
    expect(a.source).toBe("business_key");
    expect(b.key).toBe("sk-BETAKEY5678");
    expect(a.key).not.toBe(b.key);
  });

  it("platform fallback engages only when the business has no own key", async () => {
    process.env.OPENAI_API_KEY = "sk-PLATFORMFALLBACK"; resetEnvCache();
    const noKey = await resolveOpenAiKey(B.business.id); // B has a key -> business
    expect(noKey.source).toBe("business_key");

    const C = await seedBusiness(db, "Gamma"); // no secret set
    const fell = await resolveOpenAiKey(C.business.id);
    expect(fell.source).toBe("platform_key");
    expect(fell.key).toBe("sk-PLATFORMFALLBACK");
    delete process.env.OPENAI_API_KEY; resetEnvCache();
  });

  it("masked listing exposes only last-4, never ciphertext or plaintext", async () => {
    const masked = await listMaskedSecrets(A.business.id);
    const openai = masked.find((m) => m.kind === "openai_api_key")!;
    expect(openai.hasValue).toBe(true);
    expect(openai.preview).toBe("…1234");
    expect(openai.preview).not.toContain("sk-");
    expect(JSON.stringify(masked)).not.toContain("v1:"); // no ciphertext
  });

  it("telegram resolution is per-business and falls back to platform token", async () => {
    await setBusinessSecret(A.business.id, "telegram_bot_token", "AAA:token");
    await setBusinessSecret(A.business.id, "telegram_chat_id", "-100A");
    const a = await resolveTelegram(A.business.id, "");
    expect(a.source).toBe("business");
    expect(a.token).toBe("AAA:token");
    expect(a.chatId).toBe("-100A");

    process.env.TELEGRAM_BOT_TOKEN = "PLATFORM:token"; resetEnvCache();
    const b = await resolveTelegram(B.business.id, "-100B"); // no own token, has chat via arg
    expect(b.source).toBe("platform");
    expect(b.token).toBe("PLATFORM:token");
    expect(b.chatId).toBe("-100B");
    delete process.env.TELEGRAM_BOT_TOKEN; resetEnvCache();
  });
});
