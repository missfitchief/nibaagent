"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { knowledgeSources } from "../db/schema";
import { requireBusiness } from "../auth/guards";
import { safeSyncLearningMemories } from "../n8n-sync";
import { planDef } from "../plans";
import type { ActionState } from "./business";

const KnowledgeCreate = z.object({
  businessId: z.string().uuid(),
  type: z.enum(["faq", "manual", "url", "products"]),
  title: z.string().min(1).max(200),
  content: z.string().max(20000).default(""),
  sourceUrl: z.string().max(500).default("")
});

export async function createKnowledgeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = KnowledgeCreate.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Give the entry a title (and content)." };
  const { business } = await requireBusiness(parsed.data.businessId);

  const existing = await db()
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.businessId, business.id), eq(knowledgeSources.status, "active")));
  const limit = planDef(business.plan).knowledgeSources;
  if (existing.length >= limit) {
    return { error: `Your ${planDef(business.plan).name} plan allows ${limit} knowledge entries. Upgrade to add more.` };
  }
  if (parsed.data.type === "url" && !/^https?:\/\/.+/.test(parsed.data.sourceUrl)) {
    return { error: "Enter a valid website URL (https://…)." };
  }

  // URL sources: fetch and extract public text NOW (one-off, cached in DB) so
  // the AI never has to browse at reply time. MVP extractor: strip scripts/
  // styles/tags, keep title/meta/headings/prices; hard 300KB / 8s limits.
  let content = parsed.data.content;
  let status: "active" | "error" = "active";
  if (parsed.data.type === "url") {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(parsed.data.sourceUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (NibaChatAgent knowledge fetch)" }
      });
      clearTimeout(timer);
      const html = (await res.text()).slice(0, 300_000);
      const title = /<title[^>]*>([^<]{1,200})/i.exec(html)?.[1]?.trim() ?? "";
      const metaDesc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})/i.exec(html)?.[1] ?? "";
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z#0-9]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 6000);
      const prices = [...text.matchAll(/\b\d{1,4}[.,]\d{2}\s?(KM|BAM|EUR|€|RSD|kn)\b/g)].slice(0, 30).map((m) => m[0]);
      content = [title && `Title: ${title}`, metaDesc && `Description: ${metaDesc}`, prices.length && `Prices seen: ${prices.join(", ")}`, `Content: ${text}`]
        .filter(Boolean)
        .join("\n");
    } catch (err) {
      status = "error";
      content = `Could not fetch this URL: ${(err as Error).message}. TODO: retry or paste the content manually.`;
    }
  }

  await db().insert(knowledgeSources).values({
    businessId: business.id,
    type: parsed.data.type,
    title: parsed.data.title.trim(),
    content,
    sourceUrl: parsed.data.sourceUrl,
    status
  });
  await safeSyncLearningMemories(business.id);
  revalidatePath("/app/knowledge");
  return status === "error" ? { error: "Saved, but the website could not be fetched — edit it or paste content manually." } : { ok: true };
}

const KnowledgeDelete = z.object({ businessId: z.string().uuid(), id: z.string().uuid() });

export async function deleteKnowledgeAction(formData: FormData): Promise<void> {
  const parsed = KnowledgeDelete.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { business } = await requireBusiness(parsed.data.businessId);
  // Archive, don't hard-delete: keeps audit trail and n8n prompt caches sane.
  await db()
    .update(knowledgeSources)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(knowledgeSources.id, parsed.data.id), eq(knowledgeSources.businessId, business.id)));
  await safeSyncLearningMemories(business.id);
  revalidatePath("/app/knowledge");
}
