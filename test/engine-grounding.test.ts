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

describe("per-variant stock grounding", () => {
  it("a color's OWN stock is stated, distinct from the product's general stock line", async () => {
    // Real prod bug: a customer asked "u srebrenoj boji mozda da li imate"
    // (do you have it in silver) and the bot confidently said "Nažalost,
    // trenutno nemamo dostupnu 'Mama' ogrlicu u srebrnoj boji" — but the
    // silver variant WAS in stock. variantFacts() listed color/price/size
    // per variant but never that variant's OWN stock status, so the AI had
    // no per-color signal and fell back to guessing from the product's one
    // general stock line, which doesn't necessarily reflect any one color.
    const { business } = await seedBusiness(db, "Nakit shop 4");
    await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr" }).where(eq(schema.businesses.id, business.id));
    const [product] = await db
      .insert(schema.products)
      .values({ businessId: business.id, title: "Mama ogrlica sa priveskom stopala", price: "45.90", currency: "BAM", stockStatus: "unknown" })
      .returning({ id: schema.products.id });
    await db.insert(schema.productVariants).values([
      { businessId: business.id, productId: product.id, name: "Srebrna", color: "srebrna", stockStatus: "available" },
      { businessId: business.id, productId: product.id, name: "Zlatna", color: "zlatna", stockStatus: "unavailable" }
    ]);

    const conversationKey = { channel: "facebook" as const, senderId: "cust-variant-stock" };
    await runEngine(business.id, "Koliko kosta mama ogrlica sa priveskom stopala?", {
      conversation: conversationKey,
      chatCompletion: async () => ({ text: "Cena je 45.90 BAM.", tokens: 10 })
    });

    let systemSeen = "";
    await runEngine(business.id, "U srebrenoj boji mozda da li imate?", {
      conversation: conversationKey,
      chatCompletion: async (input) => {
        systemSeen = input.system;
        return { text: "Da, imamo je u srebrnoj boji.", tokens: 10 };
      }
    });
    expect(systemSeen).toMatch(/srebrna[^;]*\(available to order\)/i);
    expect(systemSeen).toMatch(/zlatna[^;]*\(not available\)/i);
  });
});

describe("follow-up product grounding (no product name in the message)", () => {
  it("'Jel imate srebreni' after the item was already discussed still grounds on it, not a generic hedge", async () => {
    const { business } = await seedBusiness(db, "Nakit shop 2");
    await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr" }).where(eq(schema.businesses.id, business.id));
    const conversationKey = { channel: "facebook" as const, senderId: "cust-followup" };
    const [product] = await db
      .insert(schema.products)
      .values({ businessId: business.id, title: "Medaljon sa slikom", price: "38.90", currency: "KM", stockStatus: "available" })
      .returning({ id: schema.products.id });
    await db.insert(schema.productVariants).values([
      { businessId: business.id, productId: product.id, name: "Srebrni", color: "srebrna", stockStatus: "available" },
      { businessId: business.id, productId: product.id, name: "Zlatni", color: "zlatna", stockStatus: "unavailable" }
    ]);

    // Turn 1: the customer names the product — establishes productContext.
    await runEngine(business.id, "Koliko kosta medaljon sa slikom?", {
      conversation: conversationKey,
      chatCompletion: async () => ({ text: "Cena je 38.90 KM.", tokens: 10 })
    });

    // Turn 2: a color question that never repeats the product name — this is
    // the exact real prod message ("Jel imate srebreni") that used to reach
    // the AI with an empty productData block and trigger the system prompt's
    // own "say the team will check" fallback instead of answering from data.
    let systemSeen = "";
    await runEngine(business.id, "Jel imate srebreni", {
      conversation: conversationKey,
      chatCompletion: async (input) => {
        systemSeen = input.system;
        return { text: "Da, srebrna boja je dostupna.", tokens: 10 };
      }
    });
    expect(systemSeen).toContain("PRODUCTS");
    expect(systemSeen).toContain("Medaljon sa slikom");
    expect(systemSeen).toContain("variants:");
    expect(systemSeen).toContain("srebrna");
  });
});

describe("no confident/denied claims beyond what's grounded", () => {
  it("a personalized product's description reaches the AI, and the anti-hallucination rule covers customization claims", async () => {
    // Real prod bug: three separate live conversations where the bot
    // confidently answered customization questions WRONG in both
    // directions — claimed "our team confirmed" a finish that was never
    // confirmed, denied a charm-count option that the website actually
    // offers, and told a customer personalization wasn't available on a
    // product literally titled "Personalizovana narukvica" (Personalized
    // bracelet) — right after she'd sent full order details expecting it.
    const { business } = await seedBusiness(db, "Nakit shop 3");
    await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr" }).where(eq(schema.businesses.id, business.id));
    await db.insert(schema.products).values({
      businessId: business.id,
      title: "Moja Priča — Personalizovana narukvica od nerđajućeg čelika i kože",
      description: "Upišite željeno ime u napomenu. Dostupno sa 3 do 8 stopala.",
      price: "37.90",
      currency: "BAM",
      stockStatus: "available"
    });

    let systemSeen = "";
    await runEngine(business.id, "Da li mogu da dodam ime na narukvicu?", {
      chatCompletion: async (input) => {
        systemSeen = input.system;
        return { text: "Da, možete dodati ime.", tokens: 10 };
      }
    });
    expect(systemSeen).toContain("Upišite željeno ime");
    expect(systemSeen).toContain("3 do 8 stopala");
    expect(systemSeen).toMatch(/customization\/variant questions/i);
    expect(systemSeen).toMatch(/never claim ['’]the team confirmed['’]/i);
  });
});

describe("weak/ambiguous product match — ask which one instead of stonewalling", () => {
  it("a term that only appears in the description (not the title) still surfaces the product as a candidate", async () => {
    // Real prod bug, seen live: a customer asked "Zanima me da li imate na
    // stanju srebrni lančić na kojem bi se ugravirao portret te za koliko bi
    // stigao na adresu?" (silver chain with an engraved portrait, price with
    // delivery). Nothing matched confidently — matchProducts() only looked at
    // product TITLES, and the relevant words ("lančić", "portret") lived only
    // in the product's description — so the bot told her it had "no
    // information" and would check with the team, a dead end, instead of
    // recognizing the store's own matching item or asking which one she meant.
    const { business } = await seedBusiness(db, "Nakit shop 7");
    await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr" }).where(eq(schema.businesses.id, business.id));
    await db.insert(schema.products).values({
      businessId: business.id,
      title: "Personalizovana ogrlica",
      description: "Srebrni lančić sa gravurom po želji, moguć i portret.",
      price: "42.90",
      currency: "BAM",
      stockStatus: "available"
    });

    let systemSeen = "";
    let aiCalled = false;
    await runEngine(
      business.id,
      "Zanima me da li imate na stanju srebrni lančić na kojem bi se ugravirao portret te za koliko bi stigao na adresu?",
      {
        chatCompletion: async (input) => {
          aiCalled = true;
          systemSeen = input.system;
          return { text: "Imamo srebrni lančić sa gravurom — da li mislite na personalizovanu ogrlicu?", tokens: 10 };
        }
      }
    );
    expect(aiCalled).toBe(true);
    expect(systemSeen).toMatch(/POSSIBLE MATCHES/i);
    expect(systemSeen).toContain("Personalizovana ogrlica");
    expect(systemSeen).toMatch(/ask the customer which one they mean/i);
  });
});

describe("order intent + a real question in the same first message", () => {
  it("answers the question via the AI instead of the static collection template when nothing is known yet", async () => {
    // Real prod bug, seen live: a customer's very first message was
    // "...željela bih da naručim 'zlatni' medaljon sa ugraviranom slikom
    // dječaka i djevojčice... Da li Može i koliko je sa dostavom?" — a real
    // question (is it possible, what's the price with delivery) riding
    // along with order intent. The bot's ONLY reply was the static "send us
    // your details" collection template, completely ignoring the question,
    // both on this message and again after she sent reference photos.
    const { business } = await seedBusiness(db, "Nakit shop 5");
    await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr" }).where(eq(schema.businesses.id, business.id));
    await db.insert(schema.products).values({
      businessId: business.id,
      title: "Medaljon sa slikom",
      description: "Ugravirana slika po želji.",
      price: "38.90",
      currency: "BAM",
      stockStatus: "available"
    });

    let systemSeen = "";
    let aiCalled = false;
    const result = await runEngine(
      business.id,
      "Poštovani željela bih da naručim \"zlatni\" medaljon sa ugraviranom slikom dječaka i djevojčice a na pozadini natpis \"duše moje\".Da li Može i koliko je sa dostavom?",
      {
        conversation: { channel: "facebook", senderId: "cust-question-order" },
        chatCompletion: async (input) => {
          aiCalled = true;
          systemSeen = input.system;
          return { text: "Da, možemo! Cena sa dostavom je 48.90 BAM. Za porudžbinu nam pošaljite ime, adresu i telefon.", tokens: 10 };
        }
      }
    );
    expect(aiCalled).toBe(true);
    expect(result.reply).not.toMatch(/^Super! Za porudžbinu nam pošaljite/i);
    // The AI must see that an order is already in progress with everything missing.
    expect(systemSeen).toMatch(/ORDER IN PROGRESS/i);
    expect(systemSeen).toMatch(/ime i prezime/i);
  });

  it("still uses the fast static template when there's bare intent and no question", async () => {
    const { business } = await seedBusiness(db, "Nakit shop 6");
    await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr" }).where(eq(schema.businesses.id, business.id));

    const result = await runEngine(business.id, "Zelim da naručim narukvicu", {
      conversation: { channel: "facebook", senderId: "cust-bare-intent" },
      chatCompletion: async () => {
        throw new Error("AI should not be called for bare order intent with no question");
      }
    });
    expect(result.reply).toMatch(/Za porudžbinu nam pošaljite/i);
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
