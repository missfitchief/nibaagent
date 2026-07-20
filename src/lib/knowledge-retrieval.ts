import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { knowledgeChunks } from "./db/schema";

/**
 * Knowledge retrieval: knowledge_chunks was write-only (old-chat ingest stored
 * ~1.5k-char chunks, nothing ever read them). This ranks a business's chunks
 * against the current customer message and returns the best ones for the AI
 * prompt. Ranking mirrors matchFaq's approach: diacritic-stripped normalized
 * token overlap (content words longer than 3 chars), best score first.
 * Businesses with NO chunks get hasChunks=false and the engine keeps its
 * legacy whole-source injection — no behavior change for them.
 */

/** How many chunks may be injected into one prompt. */
export const KNOWLEDGE_CHUNK_TOP_N = 3;
/** Total injected characters cap — protects prompt size. */
export const KNOWLEDGE_CHUNK_MAX_CHARS = 1500;
/** Max chunks scanned per lookup (ingest caps a source at 40 chunks). */
const SCAN_LIMIT = 200;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export interface KnowledgeRetrieval {
  /** The business has any chunks at all (false → legacy source injection). */
  hasChunks: boolean;
  /** Chunks above the relevance threshold — the "did the bot know?" signal. */
  relevantChunks: number;
  /** Joined top chunks for the prompt ("" when nothing relevant). */
  text: string;
}

export async function retrieveKnowledgeChunks(businessId: string, message: string): Promise<KnowledgeRetrieval> {
  const rows = await db()
    .select({ content: knowledgeChunks.content })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.businessId, businessId))
    .limit(SCAN_LIMIT);
  if (!rows.length) return { hasChunks: false, relevantChunks: 0, text: "" };

  const msgTokens = [...new Set(norm(message).split(/\W+/).filter((w) => w.length > 3))];
  const scored = rows
    .map((r) => {
      const content = norm(r.content);
      const hits = msgTokens.filter((t) => content.includes(t)).length;
      return { content: r.content, hits, score: msgTokens.length ? hits / msgTokens.length : 0 };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.score - a.score || b.hits - a.hits);

  const top = scored.slice(0, KNOWLEDGE_CHUNK_TOP_N);
  let text = "";
  for (const t of top) {
    const room = KNOWLEDGE_CHUNK_MAX_CHARS - text.length;
    if (room <= 0) break;
    text += (text ? "\n" : "") + t.content.slice(0, room);
  }
  return { hasChunks: true, relevantChunks: top.length, text };
}
