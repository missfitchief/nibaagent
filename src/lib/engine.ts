import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { botSettings, businesses, knowledgeSources, metaConnections } from "./db/schema";
import { MODEL_COST_PER_1K } from "./plans";
import { resolveOpenAiKey, resolveAnthropicKey } from "./secrets";
import { matchProducts, productFacts, variantFacts, variantsFor } from "./products";
import { pickModel, APP_DEFAULT_MODEL, type Provider } from "./models";
import { withinBusinessHours, type BusinessHours } from "./hours";

/**
 * Rules-first reply engine — the AI-credit saver. Order:
 *   0 launch mode (paused = silent) + business hours
 *   1 handoff trigger words   (no AI)
 *   2 known FAQ match         (no AI)      [skipped when strategy = ai_heavy]
 *   3 order intent            (no AI)      [only when strategy = rules_first]
 *   4 grounded AI call        (provider + model per business)
 *
 * Every per-business setting below is actually consulted here (see
 * FIELD_USAGE_AUDIT.md). Production message flow runs through the shared n8n
 * workflow which follows the same contract; this engine also powers the in-app
 * test bot and draft mode.
 */

export interface EngineResult {
  intent: "handoff" | "faq" | "order" | "ai" | "no_ai" | "unknown" | "off_hours";
  reply: string;
  handoffTriggered: boolean;
  orderTriggered: boolean;
  knowledgeUsed: string[];
  modelUsed: string;
  provider: Provider;
  tokenEstimate: number;
  costEstimateEur: number;
  aiCalled: boolean;
  /** Business launch mode — drives whether the caller actually sends. */
  launchMode: "draft" | "live" | "paused";
  /** true only when mode = live AND there is a reply to send. */
  shouldSend: boolean;
  /** Seconds the caller should wait before sending (per-business setting). */
  replyDelaySeconds: number;
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

const EN = (s: string) => s;
/** Serbian phrasing with optional persiranje (formal "Vi" vs informal "ti"). */
function sr(formal: boolean, viForm: string, tiForm: string): string {
  return formal ? viForm : tiForm;
}

function orderCollectionReply(lang: string, formal: boolean, extraPrompt = ""): string {
  const base =
    lang === "en"
      ? EN("Great! To place your order please send: full name, street and number, city, postal code, phone number, and what you would like to order.")
      : sr(
          formal,
          "Super! Za porudžbinu nam pošaljite: ime i prezime, ulicu i broj, grad, poštanski broj, broj telefona i šta želite da poručite.",
          "Super! Za porudžbinu nam pošalji: ime i prezime, ulicu i broj, grad, poštanski broj, broj telefona i šta želiš da poručiš."
        );
  const extra = extraPrompt.trim();
  return extra ? `${base} ${extra}` : base;
}

function unknownReply(behavior: string, lang: string, formal: boolean): { reply: string; handoff: boolean } {
  const en = lang === "en";
  if (behavior === "ask_rephrase") {
    return {
      reply: en ? "Sorry, I didn't quite get that — could you rephrase it?" : sr(formal, "Izvinite, nisam najbolje razumeo — možete li da preformulišete?", "Izvini, nisam najbolje razumeo — možeš li da preformulišeš?"),
      handoff: false
    };
  }
  if (behavior === "generic_help") {
    return {
      reply: en ? "Happy to help! Could you tell me a bit more about what you're looking for?" : sr(formal, "Rado ću pomoći! Možete li da mi kažete malo više o tome šta tražite?", "Rado ću pomoći! Možeš li da mi kažeš malo više o tome šta tražiš?"),
      handoff: false
    };
  }
  // offer_handoff (default)
  return {
    reply: en ? "Let me connect you with a colleague who can help with that." : sr(formal, "Povezaću Vas sa kolegom koji može da Vam pomogne oko toga.", "Povezaću te sa kolegom koji može da ti pomogne oko toga."),
    handoff: true
  };
}

export interface EngineOptions {
  /** Injectable clock for business-hours logic (defaults to now). */
  now?: Date;
  /** Whether the inbound message included an image/photo. */
  hasImage?: boolean;
  /**
   * URL of an image the customer sent (n8n forwards only the URL — recognition
   * happens HERE, with the tenant's own key, only if imageRecognitionEnabled).
   */
  imageUrl?: string;
  /** Test seam: override the vision describer so tests never hit the network. */
  describeImage?: (imageUrl: string) => Promise<string | null>;
}

export async function runEngine(businessId: string, message: string, opts: EngineOptions = {}): Promise<EngineResult> {
  const d = db();
  const [biz] = await d.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) throw new Error("business not found");
  const [settings] = await d.select().from(botSettings).where(eq(botSettings.businessId, businessId)).limit(1);
  const sources = await d
    .select()
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.businessId, businessId), eq(knowledgeSources.status, "active")))
    .limit(50);

  const provider: Provider = (settings?.aiProvider as Provider) ?? "openai";
  const strategy = settings?.aiStrategy ?? "rules_first";
  const formal = settings?.persiranje ?? true;
  const launchMode = biz.aiMode;
  const replyDelaySeconds = settings?.replyDelaySeconds ?? 0;
  const lang = biz.defaultLanguage;
  const now = opts.now ?? new Date();

  const base: Omit<EngineResult, "intent" | "reply"> = {
    handoffTriggered: false,
    orderTriggered: false,
    knowledgeUsed: [],
    modelUsed: "rules",
    provider,
    tokenEstimate: 0,
    costEstimateEur: 0,
    aiCalled: false,
    launchMode,
    shouldSend: false,
    replyDelaySeconds
  };
  // A reply is only actually sent in "live" mode. Draft = prepared but held; paused = nothing.
  const withSend = (r: EngineResult): EngineResult => ({ ...r, shouldSend: launchMode === "live" && r.reply.trim().length > 0 });

  // 0a. paused = never reply
  if (launchMode === "paused" || !biz.aiEnabled) {
    return { ...base, intent: "no_ai", reply: "", note: "AI is paused for this business." };
  }

  // 0b. business hours — outside hours, optionally send the off-hours note, else stay silent
  const hours = (settings?.businessHours as BusinessHours) ?? { enabled: false };
  if (!withinBusinessHours(hours, now)) {
    const msg = (hours.offHoursMessage ?? "").trim();
    return withSend({ ...base, intent: "off_hours", reply: msg, note: msg ? "outside business hours — off-hours message" : "outside business hours — silent" });
  }

  const hasImage = Boolean(opts.hasImage || opts.imageUrl);
  // 0c. image sent but recognition disabled → ask for a text description instead
  // (never calls a vision model when the tenant has recognition turned off).
  if (hasImage && settings && !settings.imageRecognitionEnabled) {
    const reply = lang === "en"
      ? "Thanks for the photo! Could you also describe the item in words (name or link) so I can help faster?"
      : sr(formal, "Hvala na slici! Možete li ukratko opisati artikal rečima (naziv ili link) da bih brže pomogao?", "Hvala na slici! Možeš li ukratko opisati artikal rečima (naziv ili link) da bih brže pomogao?");
    return withSend({ ...base, intent: "no_ai", reply });
  }

  // 0d. recognition ON + an image URL present → describe it with THIS tenant's
  // own vision model/key and fold the description into the query, so every
  // downstream match stays scoped to this tenant's catalog/knowledge.
  if (opts.imageUrl && settings?.imageRecognitionEnabled) {
    const describe = opts.describeImage ?? ((url: string) => describeImageWithTenantKey(businessId, url, provider, biz.selectedModel));
    const desc = await describe(opts.imageUrl).catch(() => null);
    if (desc) message = `${message ? message + " " : ""}[Slika prikazuje: ${desc}]`.trim();
  }

  // 1. handoff words — cheapest, safest
  const handoffWords = (settings?.handoffWords as string[]) ?? [];
  const trigger = biz.handoffEnabled ? detectHandoff(message, handoffWords) : null;
  if (trigger) {
    return withSend({
      ...base,
      intent: "handoff",
      handoffTriggered: true,
      reply: lang === "en" ? "One moment — I'm bringing a colleague into the conversation to help you." : sr(formal, "Samo trenutak, uključujem kolegu da Vam pomogne.", "Samo trenutak, uključujem kolegu da ti pomogne.")
    });
  }

  const faqSources = sources.filter((s) => s.type === "faq").map((s) => ({ q: s.title, a: s.content }));
  const extraFaq = ((settings?.faq as Array<{ q: string; a: string }>) ?? []).filter((f) => f?.q && f?.a);

  // 2. FAQ match — skipped when strategy is ai_heavy (let the model phrase it)
  if (strategy !== "ai_heavy") {
    const faqHit = matchFaq(message, [...faqSources, ...extraFaq]);
    if (faqHit) {
      return withSend({ ...base, intent: "faq", reply: faqHit.a, knowledgeUsed: [`FAQ: ${faqHit.q}`] });
    }
  }

  // 3. order intent — deterministic prompt, only in rules_first
  if (strategy === "rules_first" && settings?.orderCollectionEnabled && detectOrderIntent(message)) {
    return withSend({ ...base, intent: "order", orderTriggered: true, reply: orderCollectionReply(lang, formal, settings?.orderPrompt ?? "") });
  }

  // 4. grounded AI. Gather product/knowledge/faq context first.
  const productMatches = await matchProducts(businessId, message);
  const topScore = productMatches[0]?.score ?? 0;
  const productConfidence = Math.min(100, Math.round(topScore * 20)); // rough 0-100 mapping
  const threshold = settings?.handoffThreshold ?? 40;
  const confidentProduct = productConfidence >= threshold;

  const knowledge = sources
    .filter((s) => s.type !== "faq" && s.type !== "products")
    .slice(0, 8)
    .map((s) => `- ${s.title}: ${s.content.slice(0, 400)}`)
    .join("\n");
  const faqList = [...faqSources, ...extraFaq].slice(0, 12).map((f) => `Q: ${f.q} A: ${f.a}`).join("\n");

  // Unknown case: no confident product, no other knowledge, no FAQ → apply the
  // configured "when the bot doesn't know" behavior instead of blindly calling AI.
  const hasGrounding = confidentProduct || Boolean(knowledge) || Boolean(faqList);
  if (!hasGrounding && strategy !== "ai_heavy") {
    const u = unknownReply(settings?.unknownBehavior ?? "offer_handoff", lang, formal);
    return withSend({ ...base, intent: "unknown", handoffTriggered: u.handoff, reply: u.reply, note: `no grounding (product conf ${productConfidence} < ${threshold})` });
  }

  // Resolve provider key
  const resolved = provider === "anthropic" ? await resolveAnthropicKey(businessId) : await resolveOpenAiKey(businessId);
  if (!resolved.key) {
    return {
      ...base,
      intent: "no_ai",
      reply: "",
      note: `No ${provider} key for this business and no platform fallback configured. Rules (FAQ/handoff/order) still work.`
    };
  }

  const topProducts = confidentProduct ? productMatches.slice(0, 6) : [];
  const askedVariant = /\b(velicin|velicina|broj|size|boj[aeu]|boje|color|colou?r)\b/i.test(norm(message));
  const variants = askedVariant && topProducts.length ? await variantsFor(businessId, topProducts.map((m) => m.product.id)) : new Map();
  const productData = topProducts.map((m) => `- ${productFacts(m.product)}${variantFacts(variants.get(m.product.id) ?? [])}`).join("\n");

  const persInstruction = lang === "en" ? "" : formal ? "Address the customer formally (persiranje: Vi/Vas)." : "Address the customer informally (ti).";
  const summary = settings?.oldChatsSummary ? `Style/knowledge summary: ${settings.oldChatsSummary.slice(0, 800)}` : "";
  const system = [
    `You are the customer support agent for "${biz.name}" on Facebook/Instagram DM. Reply in ${lang === "en" ? "English" : "the customer's language (Serbian/Bosnian/Croatian)"}.`,
    `Tone: ${settings?.tone ?? biz.tone}. Keep replies short (1-3 sentences), warm and human. Never say you are an AI.`,
    persInstruction,
    "NEVER invent prices, stock, delivery terms or product facts. If the answer is not in the data below, say the team will check and reply soon.",
    settings?.customInstructions ? `Business rules: ${settings.customInstructions.slice(0, 800)}` : "",
    summary,
    productData ? `PRODUCTS (authoritative — prices/stock/colors come from here, never invent):\n${productData}` : "",
    knowledge ? `BUSINESS INFO:\n${knowledge}` : "",
    faqList ? `FAQ:\n${faqList}` : "",
    !productData && !knowledge && !faqList ? "No business data provided — say the team will check." : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const model = pickModel({ provider, businessModel: biz.selectedModel, platformDefault: null }) || APP_DEFAULT_MODEL[provider];
  const ai = provider === "anthropic"
    ? await callAnthropic(resolved.key, model, system, message)
    : await callOpenAi(resolved.key, model, system, message);

  const cost = (ai.tokens / 1000) * (MODEL_COST_PER_1K[model] ?? 0.001);
  return withSend({
    ...base,
    intent: "ai",
    reply: ai.text,
    knowledgeUsed: [
      ...topProducts.map((m) => `product: ${m.product.title}`),
      ...sources.filter((s) => s.type !== "products").slice(0, 6).map((s) => s.title)
    ],
    modelUsed: model,
    tokenEstimate: ai.tokens,
    costEstimateEur: Math.round(cost * 10000) / 10000,
    aiCalled: true
  });
}

const VISION_PROMPT =
  "Opiši ovu sliku proizvoda u 1-2 rečenice: vrsta artikla, boja, materijal i uočljivi detalji. Bez izmišljanja cene ili dostupnosti.";

/**
 * Describe an image using the TENANT's own key. Prefers the configured provider;
 * falls back to the other provider only if that tenant also has that key. Returns
 * null if neither key is available (caller then asks for a text description).
 * Never logs token material.
 */
export async function describeImageWithTenantKey(
  businessId: string,
  imageUrl: string,
  provider: Provider,
  businessModel: string | null
): Promise<string | null> {
  const openai = async () => {
    const { key } = await resolveOpenAiKey(businessId);
    if (!key) return null;
    const model = businessModel && /^gpt-4o/i.test(businessModel) ? businessModel : "gpt-4o-mini";
    return openaiVision(key, model, imageUrl);
  };
  const anthropic = async () => {
    const { key } = await resolveAnthropicKey(businessId);
    if (!key) return null;
    return anthropicVision(key, imageUrl);
  };
  try {
    if (provider === "anthropic") return (await anthropic()) ?? (await openai());
    return (await openai()) ?? (await anthropic());
  } catch {
    return null;
  }
}

async function openaiVision(key: string, model: string, imageUrl: string): Promise<string | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: 160,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ]
    })
  });
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `openai_vision_${res.status}`);
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function anthropicVision(key: string, imageUrl: string): Promise<string | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            { type: "text", text: VISION_PROMPT }
          ]
        }
      ]
    })
  });
  const data = (await res.json()) as { content?: Array<{ text?: string }>; error?: { message?: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `anthropic_vision_${res.status}`);
  return (data.content ?? []).map((c) => c.text ?? "").join("").trim() || null;
}

/**
 * Resolve n8n's `client_id` to an internal business id. Accepts (in order): a
 * business uuid, a meta_connections.client_id, or a meta_connections.page_id.
 * Returns null if nothing matches — the caller must NOT guess a tenant.
 */
export async function resolveTenantByClientId(clientId: string): Promise<string | null> {
  const id = clientId.trim();
  if (!id) return null;
  const d = db();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    const [biz] = await d.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, id)).limit(1);
    if (biz) return biz.id;
  }
  const [byClient] = await d.select({ businessId: metaConnections.businessId }).from(metaConnections).where(eq(metaConnections.clientId, id)).limit(1);
  if (byClient) return byClient.businessId;
  const [byPage] = await d.select({ businessId: metaConnections.businessId }).from(metaConnections).where(eq(metaConnections.pageId, id)).limit(1);
  return byPage?.businessId ?? null;
}

/**
 * Inbound entrypoint for the n8n `{ client_id, message, image_url }` payload.
 * Resolves the tenant, then runs the normal grounded engine (tenant-scoped).
 */
export async function runEngineForInbound(
  input: { clientId: string; message?: string; imageUrl?: string },
  opts: EngineOptions = {}
): Promise<EngineResult & { businessId: string }> {
  const businessId = await resolveTenantByClientId(input.clientId);
  if (!businessId) throw new Error("unknown client_id");
  const result = await runEngine(businessId, input.message ?? "", { ...opts, imageUrl: input.imageUrl });
  return { ...result, businessId };
}

async function callOpenAi(key: string, model: string, system: string, message: string): Promise<{ text: string; tokens: number }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
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
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number }; error?: { message?: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `openai_${res.status}`);
  return { text: data.choices?.[0]?.message?.content?.trim() ?? "", tokens: data.usage?.total_tokens ?? 0 };
}

async function callAnthropic(key: string, model: string, system: string, message: string): Promise<{ text: string; tokens: number }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system,
      messages: [{ role: "user", content: message.slice(0, 1000) }]
    })
  });
  const data = (await res.json()) as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `anthropic_${res.status}`);
  const text = (data.content ?? []).map((c) => c.text ?? "").join("").trim();
  const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  return { text, tokens };
}
