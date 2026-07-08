"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { eventLogs, knowledgeChunks, knowledgeSources } from "../db/schema";
import { canEdit, requireBusiness } from "../auth/guards";
import { extractFaqCandidates, redactPII } from "../redact";

export interface IngestState {
  error?: string;
  summary?: {
    charsIn: number;
    redactions: Record<string, number>;
    faqCandidates: number;
    chunksStored: number;
  };
}

const Ingest = z.object({
  businessId: z.string().uuid(),
  title: z.string().max(120).default("Imported knowledge"),
  content: z.string().min(1).max(200000)
});

/**
 * MVP ingestion for pasted text / CSV / JSON transcript export. Everything is
 * PII-redacted BEFORE storage. Stores the sanitized text as a knowledge_source
 * (+ chunks) and returns FAQ candidates. Business-scoped; never leaks between
 * businesses. (PDF/DOCX parsing is a documented follow-up — paste the text for
 * now.)
 */
export async function ingestTextAction(_prev: IngestState, formData: FormData): Promise<IngestState> {
  const parsed = Ingest.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Paste some text to ingest." };
  const { business, role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return { error: "You don't have permission to add knowledge." };

  const charsIn = parsed.data.content.length;
  const { text: clean, counts } = redactPII(parsed.data.content);
  const faqs = extractFaqCandidates(clean);

  // Store sanitized source + chunks (business-scoped).
  const [source] = await db()
    .insert(knowledgeSources)
    .values({
      businessId: business.id,
      type: "old_chats",
      title: parsed.data.title.slice(0, 120),
      content: clean.slice(0, 20000),
      status: "active"
    })
    .returning();

  // Chunk ~1.5k chars each for retrieval.
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += 1500) chunks.push(clean.slice(i, i + 1500));
  const capped = chunks.slice(0, 40);
  if (capped.length) {
    await db()
      .insert(knowledgeChunks)
      .values(capped.map((content) => ({ businessId: business.id, sourceId: source.id, content, metadata: { origin: "old_chats" } })));
  }
  // FAQ candidates become individual faq sources (disabled? kept active MVP).
  if (faqs.length) {
    await db()
      .insert(knowledgeSources)
      .values(faqs.map((f) => ({ businessId: business.id, type: "faq" as const, title: f.question, content: f.answer, status: "active" as const })));
  }

  await db().insert(eventLogs).values({
    businessId: business.id,
    level: "info",
    area: "ai_reply",
    message: `old-chat ingest: ${charsIn} chars, ${Object.values(counts).reduce((a, b) => a + b, 0)} redactions, ${faqs.length} FAQ candidates`,
    metadata: { redactions: counts }
  });

  revalidatePath("/app/knowledge");
  return { summary: { charsIn, redactions: counts, faqCandidates: faqs.length, chunksStored: capped.length } };
}
