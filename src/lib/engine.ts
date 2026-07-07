import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { botSettings, businesses, knowledgeSources } from "./db/schema";
import { MODEL_COST_PER_1K } from "./plans";
import { env } from "./env";

/**
 * Rules-first reply engine — the AI-credit saver. Order:
 *   1 handoff trigger words   (no AI)
 *   2 known FAQ match         (no AI)
 *   3 order intent            (no AI — deterministic collection prompt)
 *   4 compact-prompt AI call  (cheap model, knowledge summary not raw dumps)
 * Used by the in-app bot test page and draft mode; production message flow
 * runs through the shared n8n workflow which follows the same contract.
 */

export interface EngineResult {
  intent: "handoff" | "faq" | "order" | "ai" | "no_ai";
  reply: string;
  handoffTriggered: boolean;
  orderTriggered: boolean;
  knowledgeUsed: string[];
  modelUsed: string;
  tokenEstimate: number;
  costEstimateEur: number;
  aiCalled: boolean;
  note?: string;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const ORDER_PATTERNS = [/naruc/i, /poruc/i, /kupuj/i, /uzimam/i, /zelim (da )?(narucim|porucim|kupim)/i, /how (do|can) i (order|buy)/i, /i want to (order|buy)/i];

export function detectOrderIntent(message: string): boolean {
  const n = norm(message);
  return ORDER_PATTERNS.some((p) => p.test(n));
}

export function detectHandoff(message: string, words: string[]): string | null {
  const n = norm(message);
  for (const w of words) {
    const nw = norm(w);
    if (nw && n.includes(nw)) return w;
  }
  return null;
}

export function matchFaq(message: string, faqs: Array<{ q: string; a: string }>): { q: string; a: string } | null {
  const n = norm(message);
  let best: { q: string; a: string; score: number } | null = null;
  for (const f of faqs) {
    const words = norm(f.q).split(/\W+/).filter((w) => w.length > 3);
    if (!words.length) continue;
    const hits = words.filter((w) => n.includes(w)).length;
    const score = hits / words.length;
    if (score >= 0.6 && (!best || score > best.score)) best = { ...f, score };
  }
  return best;
}

function orderCollectionReply(lang: string): string {
  if (lang === "en")
    return "Great! To place your order please send: full name, street and number, city, postal code, phone number, and what you would like to order.";
  return "Super! Za porudžbinu nam pošaljite: ime i prezime, ulicu i broj, grad, poštanski broj, broj telefona i šta želite da poručite.";
}

export async function runEngine(businessId: string, message: string): Promise<EngineResult> {
  const d = db();
  const [biz] = await d.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) throw new Error("business not found");
  const [settings] = await d.select().from(botSettings).where(eq(botSettings.businessId, businessId)).limit(1);
  const sources = await d
    .select()
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.businessId, businessId), eq(knowledgeSources.status, "active")))
    .limit(50);

  const base: Omit<EngineResult, "intent" | "reply"> = {
    handoffTriggered: false,
    orderTriggered: false,
    knowledgeUsed: [],
    modelUsed: "rules",
    tokenEstimate: 0,
    costEstimateEur: 0,
    aiCalled: false
  };

  // 1. handoff words — cheapest, safest
  const handoffWords = (settings?.handoffWords as string[]) ?? [];
  const trigger = biz.handoffEnabled ? detectHandoff(message, handoffWords) : null;
  if (trigger) {
    return {
      ...base,
      intent: "handoff",
      handoffTriggered: true,
      reply:
        biz.defaultLanguage === "en"
          ? "One moment — I'm bringing a colleague into the conversation to help you."
          : "Samo trenutak, uključujem kolegu da Vam pomogne."
    };
  }

  // 2. FAQ match — no AI for known questions
  const faqSources = sources.filter((s) => s.type === "faq").map((s) => ({ q: s.title, a: s.content }));
  const extraFaq = ((settings?.faq as Array<{ q: string; a: string }>) ?? []).filter((f) => f?.q && f?.a);
  const faqHit = matchFaq(message, [...faqSources, ...extraFaq]);
  if (faqHit) {
    return { ...base, intent: "faq", reply: faqHit.a, knowledgeUsed: [`FAQ: ${faqHit.q}`] };
  }

  // 3. order intent — deterministic collection prompt
  if (settings?.orderCollectionEnabled && detectOrderIntent(message)) {
    return { ...base, intent: "order", orderTriggered: true, reply: orderCollectionReply(biz.defaultLanguage) };
  }

  // 4. AI fallback — compact prompt, cheap model
  const e = env();
  if (!e.OPENAI_API_KEY) {
    return {
      ...base,
      intent: "no_ai",
      reply: "",
      note: "OPENAI_API_KEY is not configured — AI replies are disabled. Rules (FAQ/handoff/order) still work."
    };
  }
  if (!biz.aiEnabled || biz.aiMode === "paused") {
    return { ...base, intent: "no_ai", reply: "", note: "AI is paused for this business." };
  }

  const summary = settings?.oldChatsSummary ? `Style/knowledge summary: ${settings.oldChatsSummary.slice(0, 800)}` : "";
  const knowledge = sources
    .filter((s) => s.type !== "faq")
    .slice(0, 8)
    .map((s) => `- ${s.title}: ${s.content.slice(0, 400)}`)
    .join("\n");
  const faqList = [...faqSources, ...extraFaq]
    .slice(0, 12)
    .map((f) => `Q: ${f.q} A: ${f.a}`)
    .join("\n");

  const system = [
    `You are the customer support agent for "${biz.name}" on Facebook/Instagram DM. Reply in ${biz.defaultLanguage === "en" ? "English" : "the customer's language (Serbian/Bosnian/Croatian)"}.`,
    `Tone: ${settings?.tone ?? biz.tone}. Keep replies short (1-3 sentences), warm and human. Never say you are an AI.`,
    "NEVER invent prices, stock, delivery terms or product facts. If the answer is not in the data below, say the team will check and reply soon.",
    settings?.customInstructions ? `Business rules: ${settings.customInstructions.slice(0, 800)}` : "",
    summary,
    knowledge ? `BUSINESS DATA:\n${knowledge}` : "BUSINESS DATA: none provided.",
    faqList ? `FAQ:\n${faqList}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const model = biz.selectedModel || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${e.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message.slice(0, 1000) }
      ],
      max_tokens: 220,
      temperature: 0.4
    })
  });
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `openai_${res.status}`);
  const tokens = data.usage?.total_tokens ?? 0;
  const cost = (tokens / 1000) * (MODEL_COST_PER_1K[model] ?? 0.001);
  return {
    ...base,
    intent: "ai",
    reply: data.choices?.[0]?.message?.content?.trim() ?? "",
    knowledgeUsed: sources.slice(0, 8).map((s) => s.title),
    modelUsed: model,
    tokenEstimate: tokens,
    costEstimateEur: Math.round(cost * 10000) / 10000,
    aiCalled: true
  };
}
