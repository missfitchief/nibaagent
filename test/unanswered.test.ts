import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { runEngine } from "../src/lib/engine";
import { listOpenUnanswered, recordUnansweredQuestion, resolveUnansweredWithSource } from "../src/lib/unanswered";
import { resetEnvCache } from "../src/lib/env";

/**
 * "Bot nije znao" loop: when the AI answers WITHOUT knowledge coverage (no
 * relevant chunk, no source, no FAQ), the customer's question is recorded for
 * the dashboard; when knowledge covers the answer, nothing is recorded.
 * Dedupe: same normalized question within 24h is stored once.
 */

// Platform-fallback key so the AI branch is reachable; the seam intercepts it.
process.env.OPENAI_API_KEY = "sk-test-key";

let db: TestDb;
beforeEach(async () => {
  resetEnvCache();
  db = await makeDb();
});

async function liveBusinessWithProduct() {
  const s = await seedBusiness(db, "Shop");
  await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr" }).where(eq(schema.businesses.id, s.business.id));
  // A confident product match is what gets the message to the AI branch at all
  // (no handoff word, no FAQ, no order intent, no knowledge coverage).
  await db.insert(schema.products).values({ businessId: s.business.id, title: "Haljina Anabel", stockStatus: "available" });
  return s;
}

const QUESTION = "Haljina Anabel — da li je imate na stanju?";

async function openRows(businessId: string) {
  return db.select().from(schema.unansweredQuestions).where(eq(schema.unansweredQuestions.businessId, businessId));
}

describe("engine records unanswered questions", () => {
  it("records the question when the AI answers with NO knowledge coverage", async () => {
    const { business } = await liveBusinessWithProduct();
    const r = await runEngine(business.id, QUESTION, {
      conversation: { channel: "facebook", senderId: "uq-sender-1" },
      chatCompletion: async () => ({ text: "Proverićemo i javiti Vam.", tokens: 10 })
    });
    expect(r.intent).toBe("ai");
    expect(r.aiCalled).toBe(true);

    await vi.waitFor(async () => {
      const rows = await openRows(business.id);
      expect(rows).toHaveLength(1);
    });
    const [row] = await openRows(business.id);
    expect(row.questionText).toBe(QUESTION);
    expect(row.conversationId).toBe(r.conversationId);
    expect(row.resolvedAt).toBeNull();
  });

  it("does NOT record when knowledge covers the answer", async () => {
    const { business } = await liveBusinessWithProduct();
    await db.insert(schema.knowledgeSources).values({
      businessId: business.id,
      type: "delivery",
      title: "Dostava",
      content: "Dostava je 10 KM za celu BiH.",
      status: "active"
    });
    const r = await runEngine(business.id, QUESTION, {
      conversation: { channel: "facebook", senderId: "uq-sender-2" },
      chatCompletion: async () => ({ text: "Dostava je 10 KM.", tokens: 10 })
    });
    expect(r.intent).toBe("ai");
    await new Promise((res) => setTimeout(res, 30)); // give fire-and-forget a chance
    expect(await openRows(business.id)).toHaveLength(0);
  });

  it("dedupes the same normalized question within 24h (case/diacritics/whitespace-insensitive)", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await recordUnansweredQuestion({ businessId: business.id, conversationId: null, questionText: "Koliko košta dostava?" });
    await recordUnansweredQuestion({ businessId: business.id, conversationId: null, questionText: "koliko   kosta dostava?" }); // normalized twin
    await recordUnansweredQuestion({ businessId: business.id, conversationId: null, questionText: "Koliko KOŠTA   dostava?" });
    await recordUnansweredQuestion({ businessId: business.id, conversationId: null, questionText: "Da li radite nedeljom?" }); // different → kept
    const rows = await openRows(business.id);
    expect(rows).toHaveLength(2);
  });

  it("resolveUnansweredWithSource marks the row and hides it from the open list", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await recordUnansweredQuestion({ businessId: business.id, conversationId: null, questionText: "Da li radite nedeljom?" });
    const [source] = await db
      .insert(schema.knowledgeSources)
      .values({ businessId: business.id, type: "manual", title: "Radno vreme", content: "Nedeljom ne radimo.", status: "active" })
      .returning();
    const [row] = await openRows(business.id);
    expect(await listOpenUnanswered(business.id)).toHaveLength(1);

    await resolveUnansweredWithSource(business.id, row.id, source.id);

    expect(await listOpenUnanswered(business.id)).toHaveLength(0);
    const [after] = await db.select().from(schema.unansweredQuestions).where(eq(schema.unansweredQuestions.id, row.id));
    expect(after.resolvedAt).not.toBeNull();
    expect(after.resolvedByKnowledgeSourceId).toBe(source.id);
  });

  it("resolve is tenant-scoped: another business cannot resolve the row", async () => {
    const a = await seedBusiness(db, "Alpha");
    const b = await seedBusiness(db, "Beta");
    await recordUnansweredQuestion({ businessId: a.business.id, conversationId: null, questionText: "Da li radite nedeljom?" });
    const [row] = await openRows(a.business.id);
    await resolveUnansweredWithSource(b.business.id, row.id, crypto.randomUUID());
    const [after] = await db.select().from(schema.unansweredQuestions).where(eq(schema.unansweredQuestions.id, row.id));
    expect(after.resolvedAt).toBeNull(); // untouched
  });
});
