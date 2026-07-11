import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import { botSettings, products } from "../src/lib/db/schema";
import { setPlatform } from "../src/lib/platform";
import { setBusinessSecret } from "../src/lib/secrets";
import { diagnoseImageRecognition } from "../src/lib/engine";

function mockFetch(responses: { ok: boolean; body: unknown }[]) {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return { ok: r.ok, status: r.ok ? 200 : 400, json: async () => r.body } as unknown as Response;
    })
  );
}
afterEach(() => vi.unstubAllGlobals());

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
  await setPlatform("AI_USAGE_MODE", "business_key_allowed");
});

describe("diagnoseImageRecognition (admin Test image recognition)", () => {
  it("recognition DISABLED → reports disabled, never calls vision, asks for text", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await db.update(botSettings).set({ imageRecognitionEnabled: false }).where(eq(botSettings.businessId, business.id));
    await setBusinessSecret(business.id, "openai_api_key", "sk-x");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await diagnoseImageRecognition(business.id, "https://cdn.test/a.jpg", "");
    expect(r.recognitionEnabled).toBe(false);
    expect(r.error).toMatch(/isključeno/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.answer.toLowerCase()).toMatch(/opisati|naziv/); // asks for a name/link
  });

  it("recognition ENABLED + key + product → describes image, matches product, answers", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await db.update(botSettings).set({ imageRecognitionEnabled: true }).where(eq(botSettings.businessId, business.id));
    await setBusinessSecret(business.id, "openai_api_key", "sk-x");
    await db.insert(products).values({ businessId: business.id, title: "Crvena haljina", description: "pamučna", stockStatus: "available" });
    mockFetch([
      { ok: true, body: { choices: [{ message: { content: "crvena pamučna haljina" } }] } }, // vision
      { ok: true, body: { choices: [{ message: { content: "Da, crvena haljina je dostupna." } }], usage: { total_tokens: 20 } } } // grounded answer
    ]);
    const r = await diagnoseImageRecognition(business.id, "https://cdn.test/dress.jpg", "koliko kosta?");
    expect(r.visionOk).toBe(true);
    expect(r.description).toContain("crvena");
    expect(r.matchedProduct).toBe("Crvena haljina");
    expect(r.answer.length).toBeGreaterThan(0);
  });

  it("recognition ON but key missing under business_key_required → not ready, clear reason", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await setPlatform("AI_USAGE_MODE", "business_key_required");
    await db.update(botSettings).set({ imageRecognitionEnabled: true }).where(eq(botSettings.businessId, business.id));
    const r = await diagnoseImageRecognition(business.id, "https://cdn.test/a.jpg", "");
    expect(r.keyReady).toBe(false);
    expect(r.visionOk).toBe(false);
    expect(r.error).toMatch(/obavezan|ključ/i);
  });
});
