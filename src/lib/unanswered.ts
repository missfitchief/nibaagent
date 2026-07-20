import "server-only";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "./db/client";
import { unansweredQuestions } from "./db/schema";

/**
 * "Bot nije znao" loop. The engine records a customer question when the AI
 * answered with NO knowledge coverage (zero relevant chunks, no sources, no
 * FAQ). Open rows show on the dashboard with a one-click path into the
 * knowledge form; saving that form marks the row resolved.
 * Dedupe: the same normalized question within 24h per business is stored once.
 */

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Normalization for dedupe — diacritic-stripped, case/whitespace-insensitive. */
const normQ = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export async function recordUnansweredQuestion(input: {
  businessId: string;
  conversationId: string | null;
  questionText: string;
  now?: Date;
}): Promise<void> {
  const text = input.questionText.trim().slice(0, 1000);
  if (!text) return;
  const since = new Date((input.now ?? new Date()).getTime() - DEDUPE_WINDOW_MS);
  const recent = await db()
    .select({ questionText: unansweredQuestions.questionText })
    .from(unansweredQuestions)
    .where(and(eq(unansweredQuestions.businessId, input.businessId), gte(unansweredQuestions.createdAt, since)))
    .limit(100);
  const n = normQ(text);
  if (recent.some((r) => normQ(r.questionText) === n)) return; // already open/seen within 24h
  await db().insert(unansweredQuestions).values({
    businessId: input.businessId,
    conversationId: input.conversationId,
    questionText: text
  });
}

/** Open (unresolved) questions for the dashboard, newest first. */
export async function listOpenUnanswered(businessId: string, limit = 10) {
  return db()
    .select()
    .from(unansweredQuestions)
    .where(and(eq(unansweredQuestions.businessId, businessId), isNull(unansweredQuestions.resolvedAt)))
    .orderBy(desc(unansweredQuestions.createdAt))
    .limit(limit);
}

/** Mark a question resolved by the knowledge source that now answers it. */
export async function resolveUnansweredWithSource(businessId: string, id: string, knowledgeSourceId: string): Promise<void> {
  await db()
    .update(unansweredQuestions)
    .set({ resolvedAt: new Date(), resolvedByKnowledgeSourceId: knowledgeSourceId })
    .where(and(eq(unansweredQuestions.id, id), eq(unansweredQuestions.businessId, businessId), isNull(unansweredQuestions.resolvedAt)));
}
