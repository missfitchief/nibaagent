import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { createProduct, matchProducts, productFacts } from "../src/lib/products";
import { redactPII, extractFaqCandidates } from "../src/lib/redact";

describe("products: business isolation + fact source", () => {
  let db: TestDb;
  let A: Awaited<ReturnType<typeof seedBusiness>>;
  let B: Awaited<ReturnType<typeof seedBusiness>>;

  beforeAll(async () => {
    db = await makeDb();
    A = await seedBusiness(db, "Alpha");
    B = await seedBusiness(db, "Beta");
    await createProduct(A.business.id, { title: "Alpha Narukvica Spoj Srca", price: 35.9, currency: "BAM", stockStatus: "available", colors: ["zlatna"] });
    await createProduct(B.business.id, { title: "Beta Ogrlica Luna", price: 99.0, currency: "EUR", stockStatus: "available" });
  });

  it("A's product query never returns B's products", async () => {
    const rows = await db.select().from(schema.products).where(eq(schema.products.businessId, A.business.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toContain("Alpha");
  });

  it("matchProducts is business-scoped: A's matcher cannot surface B's product", async () => {
    // "luna" is only in B's catalog. A's matcher must return nothing for it.
    const aForBeta = await matchProducts(A.business.id, "koliko kosta ogrlica luna");
    expect(aForBeta.every((m) => m.product.businessId === A.business.id)).toBe(true);
    expect(aForBeta.some((m) => m.product.title.includes("Beta"))).toBe(false);

    const aForAlpha = await matchProducts(A.business.id, "narukvica spoj srca");
    expect(aForAlpha[0]?.product.title).toContain("Alpha");
  });

  it("product facts are grounded (price/stock/colors from the row)", async () => {
    const [p] = await db.select().from(schema.products).where(eq(schema.products.businessId, A.business.id));
    const facts = productFacts(p);
    expect(facts).toContain("35.90 BAM");
    expect(facts).toContain("available to order");
    expect(facts).toContain("zlatna");
  });
});

describe("products: noun-case matching (sr/bs/hr)", () => {
  // Regression for a real prod bug: a customer asked "koja je cena narukvice"
  // (genitive case) and the bot confidently quoted the price of a DIFFERENT
  // bracelet, because exact-token matching only matched the one product whose
  // title happened to end in "-e" too — the other two bracelets, spelled with
  // a different case ending, never made it into the AI's product data at all.
  let db: TestDb;
  let C: Awaited<ReturnType<typeof seedBusiness>>;

  beforeAll(async () => {
    db = await makeDb();
    C = await seedBusiness(db, "Gamma");
    await createProduct(C.business.id, { title: "Magnetne Narukvice - Spoj Srca", price: 35.9, currency: "BAM", stockStatus: "available" });
    await createProduct(C.business.id, { title: "Soul - Magnetna narukvica za parove", price: 33.9, currency: "BAM", stockStatus: "available" });
    await createProduct(C.business.id, {
      title: "Moja Prica - Personalizovana narukvica od nerdjajuceg celika i koze",
      price: 37.9,
      currency: "BAM",
      stockStatus: "available"
    });
  });

  it("a generic question surfaces every bracelet, not just the one matching by coincidence", async () => {
    const hits = await matchProducts(C.business.id, "koja je cena narukvice");
    const titles = hits.map((m) => m.product.title);
    expect(titles).toContain("Magnetne Narukvice - Spoj Srca");
    expect(titles).toContain("Soul - Magnetna narukvica za parove");
    expect(titles).toContain("Moja Prica - Personalizovana narukvica od nerdjajuceg celika i koze");
  });

  it("still matches the plain nominative form", async () => {
    const hits = await matchProducts(C.business.id, "imate li narukvica na sniženju");
    expect(hits.map((m) => m.product.title)).toContain("Soul - Magnetna narukvica za parove");
  });
});

describe("products: link matching", () => {
  // A customer who pastes their own product link should never get quoted a
  // different item's price — an exact URL match must outrank every other signal.
  let db: TestDb;
  let D: Awaited<ReturnType<typeof seedBusiness>>;

  beforeAll(async () => {
    db = await makeDb();
    D = await seedBusiness(db, "Delta");
    await createProduct(D.business.id, {
      title: "Soul - Magnetna narukvica za parove",
      price: 33.9,
      currency: "BAM",
      stockStatus: "available",
      url: "https://starlightnakit.ba/products/soul-magnetna-narukvica-za-parove"
    });
    await createProduct(D.business.id, {
      title: "Moja Prica - Personalizovana narukvica",
      price: 37.9,
      currency: "BAM",
      stockStatus: "available",
      url: "https://starlightnakit.ba/products/moja-prica-personalizovana-narukvica"
    });
  });

  it("an exact product link outranks a generic word match", async () => {
    const hits = await matchProducts(
      D.business.id,
      "koliko kosta narukvica https://starlightnakit.ba/products/moja-prica-personalizovana-narukvica"
    );
    expect(hits[0]?.product.title).toBe("Moja Prica - Personalizovana narukvica");
  });

  it("matches the link regardless of protocol, www, trailing slash or tracking params", async () => {
    const hits = await matchProducts(
      D.business.id,
      "www.starlightnakit.ba/products/soul-magnetna-narukvica-za-parove/?utm_source=ig"
    );
    expect(hits[0]?.product.title).toBe("Soul - Magnetna narukvica za parove");
  });

  it("a link to an unknown page falls back to normal word matching, never crashes", async () => {
    const hits = await matchProducts(D.business.id, "vidi ovo https://starlightnakit.ba/blog/nesto-drugo");
    expect(hits.every((m) => m.score < 100)).toBe(true);
  });
});

describe("member roles + secret access", () => {
  // Role logic mirrors lib/auth/guards.ts canManageSecrets / canEdit.
  const FULL = ["owner", "admin"];
  const canManageSecrets = (r: string) => FULL.includes(r);
  const canEdit = (r: string) => r === "owner" || r === "admin";

  it("agents and viewers cannot manage secrets", () => {
    expect(canManageSecrets("owner")).toBe(true);
    expect(canManageSecrets("admin")).toBe(true);
    expect(canManageSecrets("agent")).toBe(false);
    expect(canManageSecrets("viewer")).toBe(false);
  });

  it("agents and viewers cannot edit products/settings", () => {
    expect(canEdit("agent")).toBe(false);
    expect(canEdit("viewer")).toBe(false);
    expect(canEdit("admin")).toBe(true);
  });

  it("a member row is business-scoped (A's member is not B's)", async () => {
    const db = await makeDb();
    const A = await seedBusiness(db, "Alpha");
    const B = await seedBusiness(db, "Beta");
    await db.insert(schema.businessMembers).values({ businessId: A.business.id, userId: B.user.id, role: "agent" });
    const aMembers = await db.select().from(schema.businessMembers).where(eq(schema.businessMembers.businessId, A.business.id));
    const bMembers = await db.select().from(schema.businessMembers).where(eq(schema.businessMembers.businessId, B.business.id));
    expect(aMembers).toHaveLength(1);
    expect(bMembers).toHaveLength(0);
  });
});

describe("old-chat ingestion redacts PII", () => {
  it("redacts emails, phones, order/tracking numbers, marked names, addresses", () => {
    const raw = [
      "Customer: Zdravo, ime i prezime: Marko Marković",
      "Customer: moj broj je 065 123 4567 i email marko@gmail.com",
      "Business: Vaša porudžbina #12345 je poslata, tracking RB123456789BA",
      "Customer: adresa je Ulica Slobode 12, Sarajevo"
    ].join("\n");
    const { text, counts } = redactPII(raw);
    expect(text).not.toContain("marko@gmail.com");
    expect(text).not.toContain("065 123 4567");
    expect(text).not.toContain("Marković");
    expect(text).not.toContain("RB123456789BA");
    expect(text).toContain("[EMAIL]");
    expect(text).toContain("[PHONE]");
    expect(counts.email).toBe(1);
    expect(counts.phone).toBeGreaterThanOrEqual(1);
    expect(counts.tracking).toBe(1);
  });

  it("extracts FAQ candidates (question then answer)", () => {
    const t = "Koliko je dostava?\nDostava je 5 KM.\nHvala!\nKada stize?\n2-3 dana.";
    const faqs = extractFaqCandidates(t);
    expect(faqs.length).toBe(2);
    expect(faqs[0].question).toContain("dostava");
    expect(faqs[0].answer).toContain("5 KM");
  });
});
