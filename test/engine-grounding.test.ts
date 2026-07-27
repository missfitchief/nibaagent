import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { runEngine } from "../src/lib/engine";
import { resetEnvCache } from "../src/lib/env";

/**
 * Real prod bug: a customer asked "Ako moze u srebrnoj boji?" (locative case
 * of "boja"/color). The variant-lookup trigger only matched exact words
 * ("boja"/"boje"/"boju"), missed "boji", so the AI never received per-color
 * stock data and hedged with "we'll check availability" — even though the
 * silver variant was in stock. Separately, when the answering model sees a
 * customer's product photo directly, it sometimes hedges about not being
 * able to identify a person in the shot, which is irrelevant — the customer
 * is showing the product, not asking for a person ID.
 */
process.env.OPENAI_API_KEY = "sk-test-key";

let db: TestDb;
beforeEach(async () => {
  resetEnvCache();
  db = await makeDb();
});

describe("variant/color grounding", () => {
  it("an inflected color word ('u srebrnoj boji') still surfaces per-variant stock to the AI", async () => {
    const { business } = await seedBusiness(db, "Nakit shop");
    await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr" }).where(eq(schema.businesses.id, business.id));
    const [product] = await db
      .insert(schema.products)
      .values({ businessId: business.id, title: "Narukvica sa priveskom", stockStatus: "available" })
      .returning({ id: schema.products.id });
    await db.insert(schema.productVariants).values([
      { businessId: business.id, productId: product.id, name: "Srebrna", color: "srebrna", stockStatus: "available" },
      { businessId: business.id, productId: product.id, name: "Zlatna", color: "zlatna", stockStatus: "unavailable" }
    ]);

    let systemSeen = "";
    await runEngine(business.id, "Imate li narukvicu sa priveskom u srebrnoj boji?", {
      chatCompletion: async (input) => {
        systemSeen = input.system;
        return { text: "Da, srebrna boja je dostupna.", tokens: 10 };
      }
    });
    expect(systemSeen).toContain("variants:");
    expect(systemSeen).toContain("srebrna");
  });
});

describe("vision-attached prompt", () => {
  it("tells the model to ignore any person in the photo and focus on the product", async () => {
    const { business } = await seedBusiness(db, "Nakit shop");
    await db
      .update(schema.businesses)
      .set({ aiMode: "live", defaultLanguage: "sr", selectedModel: "gpt-4o" })
      .where(eq(schema.businesses.id, business.id));
    await db.update(schema.botSettings).set({ imageRecognitionEnabled: true }).where(eq(schema.botSettings.businessId, business.id));
    await db.insert(schema.products).values({ businessId: business.id, title: "Narukvica", stockStatus: "available" });

    let systemSeen = "";
    await runEngine(business.id, "narukvica", {
      imageUrl: "https://cdn.meta/narukvica.jpg",
      describeImage: async () => "narukvica, srebrne boje",
      chatCompletion: async (input) => {
        systemSeen = input.system;
        return { text: "Super, vidim narukvicu!", tokens: 10 };
      }
    });
    expect(systemSeen).toMatch(/person|osob/i);
    expect(systemSeen).toMatch(/never comment on being unable to see/i);
  });
});
