import { describe, it, expect, beforeAll } from "vitest";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import {
  parseShopify,
  parseJsonLd,
  parseWoo,
  parseGenericHtml,
  extractJsonLdScripts,
  dedupeKey,
  importScanned,
  type ScannedProduct
} from "../src/lib/importer";
import { listProducts } from "../src/lib/products";

describe("importer parsers (pure)", () => {
  it("parseShopify maps fields and stock (available/unavailable/unknown)", () => {
    const json = {
      products: [
        {
          title: "Silver Ring",
          handle: "silver-ring",
          body_html: "<p>Nice <b>ring</b></p>",
          product_type: "Rings",
          tags: ["silver", "gift"],
          options: [{ name: "Size", values: ["S", "M", "L"] }, { name: "Color", values: ["Silver"] }],
          variants: [{ price: "29.90", sku: "SR-1", available: true, inventory_quantity: 5 }],
          images: [{ src: "https://cdn/x.jpg" }]
        },
        {
          title: "Sold Out Necklace",
          handle: "sold-out",
          variants: [{ price: "50", available: false }]
        },
        {
          title: "Mystery Item",
          handle: "mystery",
          variants: [{ price: "10" }] // no `available` field → unknown
        }
      ]
    };
    const out = parseShopify(json, "https://shop.example");
    expect(out).toHaveLength(3);
    const ring = out[0];
    expect(ring.title).toBe("Silver Ring");
    expect(ring.description).toBe("Nice ring");
    expect(ring.price).toBe(29.9);
    expect(ring.stockStatus).toBe("available");
    expect(ring.stockQuantity).toBe(5);
    expect(ring.sku).toBe("SR-1");
    expect(ring.sizes).toEqual(["S", "M", "L"]);
    expect(ring.colors).toEqual(["Silver"]);
    expect(ring.url).toBe("https://shop.example/products/silver-ring");
    expect(out[1].stockStatus).toBe("unavailable");
    expect(out[2].stockStatus).toBe("unknown"); // stays unknown when source is silent
    expect(out[2].stockQuantity).toBeNull();
  });

  it("parseJsonLd reads Product with offers + availability", () => {
    const script = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Gold Bracelet",
      description: "18k",
      sku: "GB-9",
      image: ["https://img/1.jpg"],
      offers: { "@type": "Offer", price: "120.00", priceCurrency: "EUR", availability: "https://schema.org/InStock", url: "https://x/p/gb" }
    });
    const out = parseJsonLd([script], "https://x");
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Gold Bracelet");
    expect(out[0].price).toBe(120);
    expect(out[0].currency).toBe("EUR");
    expect(out[0].stockStatus).toBe("available");
    expect(out[0].sku).toBe("GB-9");
  });

  it("extractJsonLdScripts + @graph traversal", () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"X"},{"@type":"Product","name":"Graph Item","offers":{"price":"9","availability":"https://schema.org/OutOfStock"}}]}</script>
    </head></html>`;
    const scripts = extractJsonLdScripts(html);
    expect(scripts).toHaveLength(1);
    const out = parseJsonLd(scripts, "https://x");
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Graph Item");
    expect(out[0].stockStatus).toBe("unavailable");
  });

  it("parseWoo divides by currency minor unit and reads stock", () => {
    const json = [
      { name: "Woo Mug", permalink: "https://w/mug", sku: "WM", is_in_stock: true, prices: { price: "1599", currency_code: "USD", currency_minor_unit: 2 }, images: [{ src: "https://w/m.jpg" }] },
      { name: "Woo Gone", permalink: "https://w/gone", is_in_stock: false, prices: { price: "500", currency_minor_unit: 2 } }
    ];
    const out = parseWoo(json, "https://w");
    expect(out[0].price).toBe(15.99);
    expect(out[0].currency).toBe("USD");
    expect(out[0].stockStatus).toBe("available");
    expect(out[1].stockStatus).toBe("unavailable");
  });

  it("parseGenericHtml pulls a product from OG/product meta", () => {
    const html = `<html><head>
      <meta property="og:title" content="OG Lamp"/>
      <meta property="og:type" content="product"/>
      <meta property="product:price:amount" content="42.50"/>
      <meta property="product:price:currency" content="BAM"/>
      <meta property="product:availability" content="instock"/>
      <meta property="og:image" content="https://o/l.jpg"/>
    </head></html>`;
    const out = parseGenericHtml(html, "https://o/lamp");
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("OG Lamp");
    expect(out[0].price).toBe(42.5);
    expect(out[0].stockStatus).toBe("available");
  });

  it("parseGenericHtml skips non-product pages", () => {
    const html = `<html><head><title>Blog post</title><meta property="og:title" content="Blog post"/></head></html>`;
    expect(parseGenericHtml(html, "https://o/blog")).toHaveLength(0);
  });

  it("dedupeKey prefers url → handle → sku → slug", () => {
    expect(dedupeKey({ title: "A", url: "https://x/p/1/" })).toBe("url:https://x/p/1");
    expect(dedupeKey({ title: "A", handle: "hh" })).toBe("handle:hh");
    expect(dedupeKey({ title: "A", sku: "SK" })).toBe("sku:sk");
    expect(dedupeKey({ title: "Some Title" })).toBe("slug:some-title");
  });
});

describe("importScanned (create/update/dedup, stock-unknown stays unknown)", () => {
  let db: TestDb;
  let A: Awaited<ReturnType<typeof seedBusiness>>;
  let B: Awaited<ReturnType<typeof seedBusiness>>;

  beforeAll(async () => {
    db = await makeDb();
    A = await seedBusiness(db, "ImpA");
    B = await seedBusiness(db, "ImpB");
  });

  const mk = (over: Partial<ScannedProduct>): ScannedProduct => ({
    title: "P",
    stockStatus: "unknown",
    imageUrls: [],
    ...over
  });

  it("creates, dedups by url on re-import, and keeps unknown stock unknown", async () => {
    const first = await importScanned(A.business.id, [
      mk({ title: "Ring", url: "https://a/p/ring", price: 10, stockStatus: "unknown" }),
      mk({ title: "Chain", url: "https://a/p/chain", price: 20, stockStatus: "available" })
    ]);
    expect(first.created).toBe(2);
    expect(first.updated).toBe(0);

    // Re-import same URLs with updated price → update, not duplicate
    const second = await importScanned(A.business.id, [mk({ title: "Ring v2", url: "https://a/p/ring", price: 15, stockStatus: "unknown" })]);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);

    const rows = await listProducts(A.business.id);
    expect(rows).toHaveLength(2);
    const ring = rows.find((r) => r.url === "https://a/p/ring")!;
    expect(ring.title).toBe("Ring v2");
    expect(Number(ring.price)).toBe(15);
    expect(ring.stockStatus).toBe("unknown"); // never fabricated
  });

  it("is business-scoped: B never sees A's imports", async () => {
    await importScanned(B.business.id, [mk({ title: "Bracelet", url: "https://b/p/bra", stockStatus: "available" })]);
    const aRows = await listProducts(A.business.id);
    const bRows = await listProducts(B.business.id);
    expect(bRows).toHaveLength(1);
    expect(aRows.some((r) => r.url === "https://b/p/bra")).toBe(false);
  });
});
