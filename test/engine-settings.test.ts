import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { runEngine } from "../src/lib/engine";

/**
 * The engine must actually consume per-business settings. These assertions stay
 * out of the network AI branch (no OpenAI/Anthropic key set), so they are
 * deterministic. When grounded data + a key would be needed, the engine returns
 * a "no_ai" note instead of calling out — which still proves the branch taken.
 */
describe("engine honors per-business settings", () => {
  let db: TestDb;
  let biz: string;

  const setBiz = (patch: Partial<typeof schema.businesses.$inferInsert>) => db.update(schema.businesses).set(patch).where(eq(schema.businesses.id, biz));
  const setBot = (patch: Partial<typeof schema.botSettings.$inferInsert>) => db.update(schema.botSettings).set(patch).where(eq(schema.botSettings.businessId, biz));

  beforeAll(async () => {
    db = await makeDb();
    const s = await seedBusiness(db, "EngineCo");
    biz = s.business.id;
    await setBiz({ aiMode: "live", defaultLanguage: "sr" });
  });

  it("paused = never reply", async () => {
    await setBiz({ aiMode: "paused" });
    const r = await runEngine(biz, "koliko kosta prsten?");
    expect(r.intent).toBe("no_ai");
    expect(r.reply).toBe("");
    expect(r.shouldSend).toBe(false);
    await setBiz({ aiMode: "live" });
  });

  it("draft = prepared but not sent; live = sent", async () => {
    await setBot({ handoffWords: ["agent"] });
    await setBiz({ aiMode: "draft" });
    const draft = await runEngine(biz, "hoću da pričam sa agent");
    expect(draft.intent).toBe("handoff");
    expect(draft.reply.length).toBeGreaterThan(0);
    expect(draft.shouldSend).toBe(false); // draft holds

    await setBiz({ aiMode: "live" });
    const live = await runEngine(biz, "hoću da pričam sa agent");
    expect(live.shouldSend).toBe(true);
  });

  it("business hours: outside hours sends the off-hours message", async () => {
    await setBot({ businessHours: { enabled: true, openHour: 9, closeHour: 17, offHoursMessage: "Radno vreme 9-17h." } });
    const night = new Date(2026, 6, 6, 23, 0, 0);
    const r = await runEngine(biz, "imate li dostavu?", { now: night });
    expect(r.intent).toBe("off_hours");
    expect(r.reply).toBe("Radno vreme 9-17h.");
    await setBot({ businessHours: { enabled: false } });
  });

  it("unknownBehavior: offer_handoff vs ask_rephrase when there is no grounding", async () => {
    await setBot({ handoffWords: [], unknownBehavior: "offer_handoff" });
    const off = await runEngine(biz, "asdfqwer zxcv"); // matches nothing
    expect(off.intent).toBe("unknown");
    expect(off.handoffTriggered).toBe(true);

    await setBot({ unknownBehavior: "ask_rephrase" });
    const re = await runEngine(biz, "asdfqwer zxcv");
    expect(re.intent).toBe("unknown");
    expect(re.handoffTriggered).toBe(false);
  });

  it("FAQ short-circuits in rules_first but is skipped in ai_heavy", async () => {
    await db.insert(schema.knowledgeSources).values({ businessId: biz, type: "faq", title: "Kolika je cena dostave?", content: "Dostava je 5 KM.", status: "active" });
    await setBot({ aiStrategy: "rules_first" });
    const faq = await runEngine(biz, "kolika je cena dostave?");
    expect(faq.intent).toBe("faq");
    expect(faq.reply).toBe("Dostava je 5 KM.");

    await setBot({ aiStrategy: "ai_heavy" });
    const heavy = await runEngine(biz, "kolika je cena dostave?");
    expect(heavy.intent).not.toBe("faq"); // ai_heavy bypasses the FAQ shortcut
  });

  it("image sent while recognition disabled → asks for text description", async () => {
    await setBot({ aiStrategy: "rules_first", imageRecognitionEnabled: false });
    const r = await runEngine(biz, "", { hasImage: true });
    expect(r.intent).toBe("no_ai");
    expect(r.reply.length).toBeGreaterThan(0);
    await setBot({ imageRecognitionEnabled: true });
  });

  it("confident product match reaches grounded branch (proves product-table wins over 'unknown')", async () => {
    await db.insert(schema.products).values({ businessId: biz, title: "Zlatni Prsten Kleopatra", price: "99", currency: "BAM", stockStatus: "available", enabled: true });
    await setBot({ aiStrategy: "rules_first", unknownBehavior: "offer_handoff" });
    const r = await runEngine(biz, "koliko kosta Kleopatra prsten?");
    // No AI key configured → engine stops at "no_ai" (key missing) rather than "unknown",
    // which proves the product provided grounding.
    expect(r.intent).toBe("no_ai");
    expect(r.note ?? "").toMatch(/ključ|key/i); // "Nema … ključa …" (Serbian note)
  });

  it("custom / future model name is stored and surfaced (no allow-list)", async () => {
    await setBiz({ selectedModel: "gpt-6-turbo-2028" });
    const row = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, biz)))[0];
    expect(row.selectedModel).toBe("gpt-6-turbo-2028");
  });
});
