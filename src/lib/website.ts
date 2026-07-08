import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { knowledgeChunks, knowledgeSources } from "./db/schema";
import { originOf } from "./importer";

/**
 * Website knowledge ingestion. Given a shop URL, fetches the homepage plus a
 * handful of common info pages (about / FAQ / delivery / payment / returns /
 * contact), extracts readable text, classifies each page, and stores it as a
 * business-scoped knowledge_source (+ a chunk). The bot may use this, but
 * product-table facts always win (the engine treats products as authoritative;
 * these pages feed the "BUSINESS INFO" block only).
 *
 * Parsers are pure/testable; only ingestWebsite() touches the network + DB.
 */

export type PageType = "website" | "about" | "faq" | "delivery" | "payment" | "returns" | "contact";

/** Common paths to probe, by category. Serbian + English variants. */
const PROBE_PATHS: { type: PageType; paths: string[] }[] = [
  { type: "about", paths: ["/about", "/about-us", "/o-nama", "/o-nama.html", "/onama"] },
  { type: "faq", paths: ["/faq", "/faqs", "/cesta-pitanja", "/najcesca-pitanja", "/pitanja"] },
  { type: "delivery", paths: ["/delivery", "/shipping", "/dostava", "/isporuka"] },
  { type: "payment", paths: ["/payment", "/placanje", "/nacini-placanja"] },
  { type: "returns", paths: ["/returns", "/refund", "/povrat", "/reklamacije", "/reklamacija"] },
  { type: "contact", paths: ["/contact", "/contact-us", "/kontakt"] }
];

/** Classify a page by URL path + text keywords. Pure. */
export function classifyPage(url: string, text: string): PageType {
  const p = url.toLowerCase();
  const t = text.toLowerCase();
  if (/(o-nama|about|onama)/.test(p) || /o nama|about us/.test(t)) return "about";
  if (/(faq|pitanja)/.test(p) || /često postavljana|frequently asked/.test(t)) return "faq";
  if (/(dostav|isporuk|delivery|shipping)/.test(p) || /dostava|isporuka|delivery|shipping/.test(t)) return "delivery";
  if (/(placanj|payment)/.test(p) || /načini plaćanja|nacini placanja|payment method/.test(t)) return "payment";
  if (/(povrat|reklamacij|return|refund)/.test(p) || /povrat|reklamacija|refund|return policy/.test(t)) return "returns";
  if (/(kontakt|contact)/.test(p) || /kontaktirajte|contact us/.test(t)) return "contact";
  return "website";
}

/** Strip scripts/styles/nav noise and collapse to readable text. Pure. */
export function extractReadableText(html: string): string {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function pageTitle(html: string, fallback: string): string {
  const t = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
  return t || fallback;
}

export interface WebsiteDoc {
  type: PageType;
  title: string;
  url: string;
  text: string;
}

async function fetchHtml(url: string, ms = 10000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "NibaChatBot/1.0 (+website-knowledge)", accept: "text/html,*/*;q=0.8" }
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html") && ct !== "") return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

/** Fetch homepage + probe pages, return classified docs. Network, no DB. */
export async function crawlWebsite(rawUrl: string, maxChars = 4000): Promise<WebsiteDoc[]> {
  const origin = originOf(rawUrl);
  if (!origin) return [];
  const docs: WebsiteDoc[] = [];
  const seen = new Set<string>();

  // homepage
  const homeHtml = await fetchHtml(rawUrl.startsWith("http") ? rawUrl : origin);
  if (homeHtml) {
    const text = extractReadableText(homeHtml).slice(0, maxChars);
    if (text.length > 60) {
      docs.push({ type: "website", title: pageTitle(homeHtml, "Homepage"), url: origin, text });
      seen.add(origin);
    }
  }

  // probe common info pages (first hit per category)
  for (const group of PROBE_PATHS) {
    for (const path of group.paths) {
      const url = `${origin}${path}`;
      if (seen.has(url)) continue;
      const html = await fetchHtml(url);
      if (!html) continue;
      const text = extractReadableText(html).slice(0, maxChars);
      if (text.length < 60) continue;
      docs.push({ type: group.type, title: pageTitle(html, path), url, text });
      seen.add(url);
      break; // one page per category is enough
    }
  }
  return docs;
}

export interface WebsiteIngestOutcome {
  created: number;
  updated: number;
  pages: { type: PageType; url: string }[];
}

/** Crawl + upsert business-scoped knowledge_sources. Dedup by (business, url). */
export async function ingestWebsite(businessId: string, rawUrl: string): Promise<WebsiteIngestOutcome> {
  const docs = await crawlWebsite(rawUrl);
  const outcome: WebsiteIngestOutcome = { created: 0, updated: 0, pages: [] };
  for (const doc of docs) {
    const existing = (
      await db()
        .select()
        .from(knowledgeSources)
        .where(and(eq(knowledgeSources.businessId, businessId), eq(knowledgeSources.sourceUrl, doc.url)))
        .limit(1)
    )[0];
    if (existing) {
      await db()
        .update(knowledgeSources)
        .set({ type: doc.type, title: doc.title.slice(0, 200), content: doc.text, status: "active", updatedAt: new Date() })
        .where(eq(knowledgeSources.id, existing.id));
      await db().delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, existing.id));
      await db().insert(knowledgeChunks).values({ businessId, sourceId: existing.id, content: doc.text, metadata: { pageType: doc.type, url: doc.url } });
      outcome.updated++;
    } else {
      const [src] = await db()
        .insert(knowledgeSources)
        .values({ businessId, type: doc.type, title: doc.title.slice(0, 200), content: doc.text, sourceUrl: doc.url, status: "active" })
        .returning();
      await db().insert(knowledgeChunks).values({ businessId, sourceId: src.id, content: doc.text, metadata: { pageType: doc.type, url: doc.url } });
      outcome.created++;
    }
    outcome.pages.push({ type: doc.type, url: doc.url });
  }
  return outcome;
}
