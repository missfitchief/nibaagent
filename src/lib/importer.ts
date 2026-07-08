import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { products } from "./db/schema";
import { createProduct, updateProduct, addProductImage, type ProductInput } from "./products";
import type { StockStatus } from "./db/schema";

/**
 * Product catalog importer. Given a shop URL it tries, in order:
 *   1. Shopify  — {origin}/products.json
 *   2. JSON-LD  — <script type="application/ld+json"> Product / ItemList
 *   3. WooCommerce — {origin}/wp-json/wc/store/v1/products (public Store API)
 *   4. Generic HTML — Open Graph / product meta on the page
 *
 * Parsers are PURE (take raw text/JSON, return ScannedProduct[]) so they are
 * unit-testable without the network; only scanShopUrl() does fetching.
 *
 * Stock rule (spec): stock stays "unknown" unless the source states it. Only
 * "available" means orderable. Quantity is set only when a real number exists.
 */

export type ImportSource = "shopify" | "jsonld" | "woocommerce" | "html";

export interface ScannedProduct {
  title: string;
  description?: string;
  price?: number | null;
  currency?: string;
  stockStatus: StockStatus;
  stockQuantity?: number | null;
  sku?: string;
  category?: string;
  tags?: string[];
  colors?: string[];
  sizes?: string[];
  url?: string;
  handle?: string;
  imageUrls: string[];
}

export interface ScanResult {
  ok: boolean;
  source: ImportSource | null;
  shopUrl: string;
  origin: string;
  products: ScannedProduct[];
  log: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// small utils
// ---------------------------------------------------------------------------

export function originOf(raw: string): string {
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

export function slugify(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stripHtml(html: string): string {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Dedup identity for a scanned product: url → sku → title-slug. */
export function dedupeKey(p: { url?: string; handle?: string; sku?: string; title: string }): string {
  if (p.url) return `url:${p.url.replace(/\/$/, "").toLowerCase()}`;
  if (p.handle) return `handle:${p.handle.toLowerCase()}`;
  if (p.sku) return `sku:${p.sku.toLowerCase()}`;
  return `slug:${slugify(p.title)}`;
}

// ---------------------------------------------------------------------------
// PURE parsers
// ---------------------------------------------------------------------------

interface ShopifyVariant {
  price?: string | number;
  sku?: string;
  available?: boolean;
  inventory_quantity?: number | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
}
interface ShopifyProduct {
  title: string;
  handle?: string;
  body_html?: string;
  product_type?: string;
  tags?: string[] | string;
  variants?: ShopifyVariant[];
  options?: Array<{ name?: string; values?: string[] }>;
  images?: Array<{ src?: string }>;
}

export function parseShopify(json: unknown, origin: string): ScannedProduct[] {
  const list = (json as { products?: ShopifyProduct[] })?.products;
  if (!Array.isArray(list)) return [];
  return list.map((p) => {
    const variants = p.variants ?? [];
    const prices = variants.map((v) => num(v.price)).filter((n): n is number => n != null);
    const anyAvailable = variants.some((v) => v.available === true);
    const allKnownUnavailable = variants.length > 0 && variants.every((v) => v.available === false);
    const stockStatus: StockStatus = anyAvailable ? "available" : allKnownUnavailable ? "unavailable" : "unknown";
    // quantity only when every variant reports a real number
    const qtys = variants.map((v) => v.inventory_quantity).filter((q): q is number => typeof q === "number");
    const stockQuantity = qtys.length === variants.length && variants.length > 0 ? qtys.reduce((a, b) => a + b, 0) : null;

    const optByName = (needle: RegExp): string[] => {
      const opt = (p.options ?? []).find((o) => needle.test(String(o.name ?? "")));
      return (opt?.values ?? []).map((v) => String(v)).filter(Boolean);
    };
    const tags = Array.isArray(p.tags) ? p.tags.map(String) : String(p.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);

    return {
      title: String(p.title ?? "").trim(),
      description: stripHtml(p.body_html ?? ""),
      price: prices.length ? Math.min(...prices) : null,
      stockStatus,
      stockQuantity,
      sku: variants.find((v) => v.sku)?.sku ?? "",
      category: p.product_type ?? "",
      tags,
      colors: optByName(/colou?r|boja/i),
      sizes: optByName(/size|velicin|broj/i),
      url: p.handle ? `${origin}/products/${p.handle}` : "",
      handle: p.handle,
      imageUrls: (p.images ?? []).map((i) => String(i.src ?? "")).filter(Boolean)
    } satisfies ScannedProduct;
  }).filter((p) => p.title);
}

function availabilityToStatus(a: unknown): StockStatus {
  const s = String(a ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("instock") || s.includes("in_stock") || s.includes("limitedavailability")) return "available";
  if (s.includes("outofstock") || s.includes("soldout") || s.includes("discontinued")) return "unavailable";
  return "unknown";
}

/** Parse an array of raw JSON-LD script contents. Handles Product, ItemList, @graph. */
export function parseJsonLd(scripts: string[], baseUrl: string): ScannedProduct[] {
  const out: ScannedProduct[] = [];
  const origin = originOf(baseUrl);
  const pushProduct = (node: Record<string, unknown>) => {
    const type = node["@type"];
    const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
    if (!isProduct) return;
    const offersRaw = node.offers;
    const offer = Array.isArray(offersRaw) ? (offersRaw[0] as Record<string, unknown>) : (offersRaw as Record<string, unknown>) ?? {};
    const images = node.image;
    const imageUrls = Array.isArray(images) ? images.map(String) : images ? [String(images)] : [];
    out.push({
      title: String(node.name ?? "").trim(),
      description: stripHtml(String(node.description ?? "")),
      price: num(offer?.price ?? offer?.lowPrice),
      currency: offer?.priceCurrency ? String(offer.priceCurrency) : undefined,
      stockStatus: availabilityToStatus(offer?.availability),
      sku: node.sku ? String(node.sku) : "",
      category: node.category ? String(node.category) : "",
      tags: [],
      url: node.url ? String(node.url) : offer?.url ? String(offer.url) : origin,
      imageUrls
    });
  };
  for (const raw of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const nodes: Record<string, unknown>[] = [];
    const collect = (v: unknown) => {
      if (!v) return;
      if (Array.isArray(v)) v.forEach(collect);
      else if (typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (Array.isArray(o["@graph"])) (o["@graph"] as unknown[]).forEach(collect);
        if (Array.isArray(o.itemListElement)) (o.itemListElement as unknown[]).forEach((el) => collect((el as Record<string, unknown>)?.item ?? el));
        nodes.push(o);
      }
    };
    collect(parsed);
    nodes.forEach(pushProduct);
  }
  return out.filter((p) => p.title);
}

interface WooProduct {
  name: string;
  permalink?: string;
  description?: string;
  short_description?: string;
  sku?: string;
  is_in_stock?: boolean;
  prices?: { price?: string; currency_code?: string; currency_minor_unit?: number };
  images?: Array<{ src?: string }>;
  categories?: Array<{ name?: string }>;
}

export function parseWoo(json: unknown, origin: string): ScannedProduct[] {
  const list = Array.isArray(json) ? (json as WooProduct[]) : [];
  return list.map((p) => {
    const minor = p.prices?.currency_minor_unit ?? 2;
    const rawPrice = p.prices?.price != null ? num(p.prices.price) : null;
    const price = rawPrice == null ? null : rawPrice / Math.pow(10, minor);
    const stockStatus: StockStatus = p.is_in_stock === true ? "available" : p.is_in_stock === false ? "unavailable" : "unknown";
    return {
      title: String(p.name ?? "").trim(),
      description: stripHtml(p.description || p.short_description || ""),
      price,
      currency: p.prices?.currency_code || undefined,
      stockStatus,
      sku: p.sku ?? "",
      category: p.categories?.[0]?.name ?? "",
      tags: [],
      url: p.permalink || origin,
      imageUrls: (p.images ?? []).map((i) => String(i.src ?? "")).filter(Boolean)
    } satisfies ScannedProduct;
  }).filter((p) => p.title);
}

function metaContent(html: string, prop: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i");
  return (html.match(re)?.[1] ?? html.match(re2)?.[1] ?? "").trim();
}

/** Extract raw JSON-LD script bodies from HTML. */
export function extractJsonLdScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

/** Last-resort: a single product from Open Graph / product meta on the page. */
export function parseGenericHtml(html: string, baseUrl: string): ScannedProduct[] {
  const title = metaContent(html, "og:title") || (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
  if (!title) return [];
  const price = num(metaContent(html, "product:price:amount") || metaContent(html, "og:price:amount"));
  const currency = metaContent(html, "product:price:currency") || metaContent(html, "og:price:currency") || undefined;
  const availability = metaContent(html, "product:availability") || metaContent(html, "og:availability");
  const ogType = metaContent(html, "og:type");
  // Only treat as a product if it looks like one (has product meta), else skip.
  if (!price && !/product/i.test(ogType) && !availability) return [];
  return [
    {
      title,
      description: metaContent(html, "og:description") || metaContent(html, "description"),
      price,
      currency,
      stockStatus: availabilityToStatus(availability),
      tags: [],
      url: metaContent(html, "og:url") || baseUrl,
      imageUrls: [metaContent(html, "og:image")].filter(Boolean)
    }
  ];
}

// ---------------------------------------------------------------------------
// network orchestrator
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, ms = 12000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "NibaChatBot/1.0 (+catalog-import)", accept: "application/json,text/html;q=0.9,*/*;q=0.8" }
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function scanShopUrl(rawUrl: string): Promise<ScanResult> {
  const origin = originOf(rawUrl);
  const log: string[] = [];
  const result: ScanResult = { ok: false, source: null, shopUrl: rawUrl, origin, products: [], log };
  if (!origin) {
    result.error = "That doesn't look like a valid URL.";
    return result;
  }

  // 1. Shopify
  try {
    const res = await fetchWithTimeout(`${origin}/products.json?limit=250`);
    if (res?.ok) {
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("json")) {
        const json = await res.json();
        const parsed = parseShopify(json, origin);
        log.push(`Shopify products.json → ${parsed.length} products`);
        if (parsed.length) {
          result.ok = true;
          result.source = "shopify";
          result.products = parsed;
          return result;
        }
      }
    } else {
      log.push(`Shopify products.json → ${res ? res.status : "no response"}`);
    }
  } catch (e) {
    log.push(`Shopify probe failed: ${(e as Error).message}`);
  }

  // Fetch the landing page once for JSON-LD + generic fallback
  let html = "";
  const pageRes = await fetchWithTimeout(rawUrl.startsWith("http") ? rawUrl : origin);
  if (pageRes?.ok) html = await pageRes.text();

  // 2. JSON-LD
  if (html) {
    const scripts = extractJsonLdScripts(html);
    const parsed = parseJsonLd(scripts, rawUrl);
    log.push(`JSON-LD scripts: ${scripts.length} → ${parsed.length} products`);
    if (parsed.length) {
      result.ok = true;
      result.source = "jsonld";
      result.products = parsed;
      return result;
    }
  }

  // 3. WooCommerce Store API
  try {
    const res = await fetchWithTimeout(`${origin}/wp-json/wc/store/v1/products?per_page=100`);
    if (res?.ok) {
      const json = await res.json();
      const parsed = parseWoo(json, origin);
      log.push(`WooCommerce Store API → ${parsed.length} products`);
      if (parsed.length) {
        result.ok = true;
        result.source = "woocommerce";
        result.products = parsed;
        return result;
      }
    } else {
      log.push(`WooCommerce Store API → ${res ? res.status : "no response"}`);
    }
  } catch (e) {
    log.push(`WooCommerce probe failed: ${(e as Error).message}`);
  }

  // 4. Generic HTML (OG meta)
  if (html) {
    const parsed = parseGenericHtml(html, rawUrl);
    log.push(`Generic HTML/OG → ${parsed.length} products`);
    if (parsed.length) {
      result.ok = true;
      result.source = "html";
      result.products = parsed;
      return result;
    }
  }

  result.error = "Couldn't find products automatically. This shop may need manual entry or a direct product URL.";
  return result;
}

// ---------------------------------------------------------------------------
// import (create/update + dedup) — caller must prove business access first
// ---------------------------------------------------------------------------

export interface ImportOutcome {
  created: number;
  updated: number;
  skipped: number;
  log: string[];
}

/** Existing dedup key for a stored product row. */
function rowKey(p: { url: string | null; sku: string | null; title: string }): string {
  return dedupeKey({ url: p.url ?? undefined, sku: p.sku ?? undefined, title: p.title });
}

export async function importScanned(businessId: string, scanned: ScannedProduct[]): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { created: 0, updated: 0, skipped: 0, log: [] };
  const existing = await db().select().from(products).where(eq(products.businessId, businessId));
  const byKey = new Map(existing.map((r) => [rowKey(r), r]));

  for (const p of scanned) {
    if (!p.title?.trim()) {
      outcome.skipped++;
      continue;
    }
    const key = dedupeKey(p);
    const input: ProductInput = {
      title: p.title,
      description: p.description ?? "",
      price: p.price ?? null,
      currency: p.currency, // undefined → createProduct default (BAM)
      stockStatus: p.stockStatus, // already "unknown" unless the source stated otherwise
      stockQuantity: p.stockQuantity ?? null,
      sku: p.sku ?? "",
      category: p.category ?? "",
      tags: p.tags ?? [],
      colors: p.colors ?? [],
      sizes: p.sizes ?? [],
      url: p.url ?? ""
    };
    const hit = byKey.get(key);
    if (hit) {
      await updateProduct(businessId, hit.id, input);
      outcome.updated++;
    } else {
      const row = await createProduct(businessId, input);
      byKey.set(key, row);
      if (p.imageUrls[0]) await addProductImage(businessId, row.id, p.imageUrls[0], p.title);
      outcome.created++;
    }
  }
  outcome.log.push(`created ${outcome.created}, updated ${outcome.updated}, skipped ${outcome.skipped}`);
  return outcome;
}
