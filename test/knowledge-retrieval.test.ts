import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { KNOWLEDGE_CHUNK_MAX_CHARS, KNOWLEDGE_CHUNK_TOP_N, retrieveKnowledgeChunks } from "../src/lib/knowledge-retrieval";
import { runEngine } from "../src/lib/engine";
import { resetEnvCache } from "../src/lib/env";

/**
 * Knowledge retrieval: knowledge_chunks are ranked against the customer message
 * (normalized token overlap, same style as matchFaq) and the top chunks are
 * injected into the AI prompt. Businesses with NO chunks keep the legacy
 * whole-source injection. Chunks never cross tenant boundaries.
 */

process.env.OPENAI_API_KEY = "sk-test-key";

let db: TestDb;
beforeEach(async () => {
  resetEnvCache();
  db = await makeDb();
});

async function seedChunks(businessId: string, chunks: string[]) {
  const [source] = await db
    .insert(schema.knowledgeSources)
    .values({ businessId, type: "old_chats", title: "Imported", content: chunks.join("\n").slice(0, 20000), status: "active" })
    .returning();
  await db.insert(schema.knowledgeChunks).values(chunks.map((content) => ({ businessId, sourceId: source.id, content, metadata: { origin: "old_chats" } })));
}

describe("retrieveKnowledgeChunks", () => {
  it("ranks the relevant chunk above threshold, excludes the irrelevant one", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await seedChunks(business.id, [
      "Dostava se plaća 10 KM. Šaljemo brzom poštom svakog radnog dana.",
      "Politika povrata robe u roku od 14 dana bez objašnjenja."
    ]);
    const r = await retrieveKnowledgeChunks(business.id, "koliko košta dostava?");
    expect(r.hasChunks).toBe(true);
    expect(r.relevantChunks).toBe(1);
    expect(r.text).toContain("Dostava se plaća 10 KM");
    expect(r.text).not.toContain("povrata robe");
  });

  it("caps at TOP_N chunks and MAX_CHARS total", async () => {
    const { business } = await seedBusiness(db, "Shop");
    const fat = "dostava " + "x".repeat(600); // every chunk is relevant
    await seedChunks(business.id, [fat + " 1", fat + " 2", fat + " 3", fat + " 4", fat + " 5"]);
    const r = await retrieveKnowledgeChunks(business.id, "dostava cena");
    expect(r.relevantChunks).toBeLessThanOrEqual(KNOWLEDGE_CHUNK_TOP_N);
    expect(r.text.length).toBeLessThanOrEqual(KNOWLEDGE_CHUNK_MAX_CHARS + KNOWLEDGE_CHUNK_TOP_N); // + newline separators
  });

  it("no chunks at all → hasChunks=false (engine falls back to legacy sources)", async () => {
    const { business } = await seedBusiness(db, "Shop");
    const r = await retrieveKnowledgeChunks(business.id, "dostava?");
    expect(r).toEqual({ hasChunks: false, relevantChunks: 0, text: "" });
  });

  it("chunks from ANOTHER business are never selected", async () => {
    const a = await seedBusiness(db, "Alpha");
    const b = await seedBusiness(db, "Beta");
    await seedChunks(b.business.id, ["Dostava je 5 KM za Beta shop."]);
    const r = await retrieveKnowledgeChunks(a.business.id, "dostava?");
    expect(r.hasChunks).toBe(false);
    expect(r.text).toBe("");
  });
});

describe("engine prompt uses retrieved chunks", () => {
  it("relevant chunk reaches the AI system prompt; irrelevant does not", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr" }).where(eq(schema.businesses.id, business.id));
    await seedChunks(business.id, [
      "Dostava se plaća 10 KM. Šaljemo brzom poštom svakog radnog dana.",
      "Politika povrata robe u roku od 14 dana bez objašnjenja."
    ]);
    let systemSeen = "";
    const r = await runEngine(business.id, "koliko košta dostava?", {
      chatCompletion: async (input) => {
        systemSeen = input.system;
        return { text: "Dostava je 10 KM.", tokens: 10 };
      }
    });
    expect(r.aiCalled).toBe(true);
    expect(systemSeen).toContain("Dostava se plaća 10 KM");
    expect(systemSeen).not.toContain("povrata robe");
  });

  it("business WITHOUT chunks behaves as before (legacy whole-source injection)", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr" }).where(eq(schema.businesses.id, business.id));
    await db.insert(schema.knowledgeSources).values({
      businessId: business.id,
      type: "delivery",
      title: "Dostava",
      content: "Dostava je 10 KM za celu BiH.",
      status: "active"
    });
    let systemSeen = "";
    await runEngine(business.id, "koliko košta dostava?", {
      chatCompletion: async (input) => {
        systemSeen = input.system;
        return { text: "Dostava je 10 KM.", tokens: 10 };
      }
    });
    expect(systemSeen).toContain("- Dostava: Dostava je 10 KM za celu BiH."); // legacy format
  });
});
