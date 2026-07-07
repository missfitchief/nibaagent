"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { knowledgeSources } from "../db/schema";
import { requireBusiness } from "../auth/guards";
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

  await db().insert(knowledgeSources).values({
    businessId: business.id,
    type: parsed.data.type,
    title: parsed.data.title.trim(),
    content: parsed.data.content,
    sourceUrl: parsed.data.sourceUrl
  });
  revalidatePath("/app/knowledge");
  return { ok: true };
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
  revalidatePath("/app/knowledge");
}
