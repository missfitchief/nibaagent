import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { botSettings, businesses, handoffs, knowledgeSources, metaConnections, orders } from "./db/schema";
import { MODEL_COST_PER_1K } from "./plans";
import { resolveOpenAiKey, resolveAnthropicKey } from "./secrets";
import { matchProducts, productFacts, variantFacts, variantsFor } from "./products";
import { pickModel, sanitizeModel, APP_DEFAULT_MODEL, APP_DEFAULT_VISION_MODEL, type Provider } from "./models";
import { callOpenAiChat, resolveProviderRuntimeConfig, sanitizeAiError } from "./ai-runtime";
import { resolvePlatform } from "./platform";
import { logEvent } from "./meta";
import { withinBusinessHours, type BusinessHours } from "./hours";
import {
  extractOrderFromTexts,
  findOrCreateConversation,
  loadConversationHistory,
  markHumanTakeover,
  mergeOrderData,
  missingOrderFields,
  orderFieldLabel,
  parseConversationState,
  saveConversationMessage,
  updateConversationState,
  type Channel,
  type ConversationKey,
  type ConversationRow,
  type ConversationState,
  type HistoryMessage,
  type OrderData,
  type RequiredOrderField
} from "./conversation-memory";

/**
 * Rules-first reply engine — the AI-credit saver. Order:
 *   0 launch mode (paused = silent) + business hours + human takeover
 *   1 handoff trigger words   (no AI)
 *   2 known FAQ match         (no AI)      [skipped when strategy = ai_heavy]
 *   3 order flow              (no AI)      [only when strategy = rules_first]
 *   4 grounded AI call        (provider + model per business)
 *
 * Conversation memory: when the caller identifies the sender (channel +
 * sender_id), the engine keeps one continuous thread per (business, channel,
 * sender): it saves every inbound message, loads the recent history into the
 * AI prompt, tracks collected order fields across messages (asking only for
 * what is still missing) and remembers the product context. Production message
 * flow runs through the shared n8n workflow which follows the same contract;
 * this engine also powers the in-app test bot and draft mode.
 */

/** How many recent messages go into the AI prompt (requirement: 10–20). */
export const HISTORY_LIMIT = 15;
/** Human takeover silence window after a handoff trigger (Meta 24h rule). */
const HUMAN_TAKEOVER_MS = 24 * 60 * 60 * 1000;

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
  /** Internal conversation id when the sender was identified (memory active). */
  conversationId?: string;
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

/** Ask ONLY for the order fields that are still missing — never the whole form again. */
function orderMissingReply(lang: string, formal: boolean, missing: RequiredOrderField[]): string {
  const labels = missing.map((f) => orderFieldLabel(f, lang)).join(", ");
  if (lang === "en") return `Thanks, noted! I still need: ${labels}.`;
  return sr(formal, `Hvala, zabeležio sam! Još mi treba: ${labels}.`, `Hvala, zabeležio sam! Još mi treba: ${labels}.`);
}

/** Confirmation once every required field is known — summarizes instead of asking. */
function orderConfirmReply(lang: string, formal: boolean, order: OrderData): string {
  const what = order.productText ? ` (${order.productText})` : "";
  const note = order.note ? (lang === "en" ? `, note: ${order.note}` : `, napomena: ${order.note}`) : "";
  if (lang === "en") {
    return `Thank you, ${order.customerName}! Your order${what} is booked: ${order.streetAndNumber}, ${order.postalCode} ${order.city}, phone ${order.phone}${note}. We will confirm it shortly.`;
  }
  return sr(
    formal,
    `Hvala, ${order.customerName}! Porudžbina${what} je zabeležena: ${order.streetAndNumber}, ${order.postalCode} ${order.city}, telefon ${order.phone}${note}. Javljamo se uskoro radi potvrde.`,
    `Hvala, ${order.customerName}! Porudžbina${what} je zabeležena: ${order.streetAndNumber}, ${order.postalCode} ${order.city}, telefon ${order.phone}${note}. Javljamo se uskoro radi potvrde.`
  );
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
  /**
   * WHO sent the message (channel + sender id). When present, the engine keeps
   * one continuous conversation per (business, channel, sender): saves every
   * message, loads recent history into the AI prompt and tracks order fields
   * across messages. Omit for stateless calls (legacy n8n payload).
   */
  conversation?: ConversationKey;
  /** Test seam: replace the provider chat call (captures the prompt, no network). */
  chatCompletion?: (input: {
    provider: Provider;
    model: string;
    system: string;
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  }) => Promise<{ text: string; tokens: number }>;
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

  // ── Conversation memory setup ────────────────────────────────────────────
  // Identify the thread by (business, channel, sender), save the inbound
  // message immediately, and load recent history for context.
  let convo: ConversationRow | null = null;
  let history: HistoryMessage[] = [];
  let convoState: ConversationState = {};
  if (opts.conversation?.senderId) {
    convo = await findOrCreateConversation(businessId, opts.conversation);
    history = await loadConversationHistory(businessId, convo.id, HISTORY_LIMIT);
    convoState = parseConversationState(convo.conversationState);
    await saveConversationMessage({
      businessId,
      conversationId: convo.id,
      channel: opts.conversation.channel,
      direction: "inbound",
      senderId: opts.conversation.senderId,
      text: message,
      imageUrl: opts.imageUrl
    });
  }

  /** Persist the bot reply + roll the conversation state forward. */
  const persistReply = async (r: EngineResult, patch?: Partial<ConversationState>): Promise<EngineResult> => {
    if (!convo) return r;
    if (r.reply.trim()) {
      await saveConversationMessage({
        businessId,
        conversationId: convo.id,
        channel: convo.channel as Channel,
        direction: "outbound",
        text: r.reply,
        intent: r.intent,
        aiGenerated: r.aiCalled,
        modelUsed: r.aiCalled ? r.modelUsed : "",
        tokenEstimate: r.tokenEstimate,
        costEstimate: r.costEstimateEur
      });
    }
    await updateConversationState(businessId, convo.id, { lastIntent: r.intent, ...patch });
    return { ...r, conversationId: convo.id };
  };

  // Human takeover: staff is handling this thread — bot records but stays silent.
  if (convo?.humanTakeoverUntil && convo.humanTakeoverUntil > now) {
    return persistReply({ ...base, intent: "handoff", reply: "", note: "human takeover active — bot silent" });
  }

  // 0a. paused = never reply
  if (launchMode === "paused" || !biz.aiEnabled) {
    return persistReply({ ...base, intent: "no_ai", reply: "", note: "AI is paused for this business." });
  }

  // 0b. business hours — outside hours, optionally send the off-hours note, else stay silent
  const hours = (settings?.businessHours as BusinessHours) ?? { enabled: false };
  if (!withinBusinessHours(hours, now)) {
    const msg = (hours.offHoursMessage ?? "").trim();
    return persistReply(
      withSend({ ...base, intent: "off_hours", reply: msg, note: msg ? "outside business hours — off-hours message" : "outside business hours — silent" })
    );
  }

  const hasImage = Boolean(opts.hasImage || opts.imageUrl);
  // 0c. image sent but recognition disabled → ask for a text description instead
  // (never calls a vision model when the tenant has recognition turned off).
  if (hasImage && settings && !settings.imageRecognitionEnabled) {
    const reply = lang === "en"
      ? "Thanks for the photo! Could you also describe the item in words (name or link) so I can help faster?"
      : sr(formal, "Hvala na slici! Možete li ukratko opisati artikal rečima (naziv ili link) da bih brže pomogao?", "Hvala na slici! Možeš li ukratko opisati artikal rečima (naziv ili link) da bih brže pomogao?");
    return persistReply(withSend({ ...base, intent: "no_ai", reply }));
  }

  // 0d. recognition ON + an image URL present → describe it with THIS tenant's
  // own vision model/key and fold the description into the query, so every
  // downstream match stays scoped to this tenant's catalog/knowledge.
  if (opts.imageUrl && settings?.imageRecognitionEnabled) {
    const visionModel =
      sanitizeModel((await resolvePlatform("DEFAULT_VISION_MODEL")).value) ||
      (provider === "anthropic" ? "claude-3-5-sonnet-latest" : APP_DEFAULT_VISION_MODEL);
    await logEvent(businessId, "info", "ai_reply", `image_url primljen — prepoznavanje uključeno (model ${visionModel})`, { visionModel });
    const describe = opts.describeImage ?? ((url: string) => describeImageWithTenantKey(businessId, url, provider, visionModel));
    const desc = await describe(opts.imageUrl).catch(() => null);
    if (desc) {
      message = `${message ? message + " " : ""}[Slika prikazuje: ${desc}]`.trim();
    } else {
      await logEvent(businessId, "warn", "ai_reply", "Slika nije mogla biti analizirana — nastavljam bez prepoznavanja slike");
    }
  }

  // 1. handoff words — cheapest, safest
  const handoffWords = (settings?.handoffWords as string[]) ?? [];
  const trigger = biz.handoffEnabled ? detectHandoff(message, handoffWords) : null;
  if (trigger) {
    if (convo) {
      await markHumanTakeover(businessId, convo.id, new Date(now.getTime() + HUMAN_TAKEOVER_MS));
      await d.insert(handoffs).values({ businessId, conversationId: convo.id, triggerWord: trigger, reason: "trigger word in conversation" });
    }
    return persistReply(
      withSend({
        ...base,
        intent: "handoff",
        handoffTriggered: true,
        reply: lang === "en" ? "One moment — I'm bringing a colleague into the conversation to help you." : sr(formal, "Samo trenutak, uključujem kolegu da Vam pomogne.", "Samo trenutak, uključujem kolegu da ti pomogne.")
      })
    );
  }

  const faqSources = sources.filter((s) => s.type === "faq").map((s) => ({ q: s.title, a: s.content }));
  const extraFaq = ((settings?.faq as Array<{ q: string; a: string }>) ?? []).filter((f) => f?.q && f?.a);

  // 2. FAQ match — skipped when strategy is ai_heavy (let the model phrase it)
  if (strategy !== "ai_heavy") {
    const faqHit = matchFaq(message, [...faqSources, ...extraFaq]);
    if (faqHit) {
      return persistReply(withSend({ ...base, intent: "faq", reply: faqHit.a, knowledgeUsed: [`FAQ: ${faqHit.q}`] }));
    }
  }

  // 3. order flow — with conversation memory the bot collects the fields across
  // messages, remembers what is already known and asks ONLY for what is missing.
  const orderWanted = strategy === "rules_first" && settings?.orderCollectionEnabled;
  if (orderWanted && convo) {
    const intentNow = detectOrderIntent(message);
    const prevOrder = convoState.order ?? {};
    // A fresh explicit order intent after a completed order starts a NEW order.
    const startFresh = Boolean(prevOrder.completed && intentNow);
    // Fold extraction over the whole conversation so fields given earlier count.
    const extracted = extractOrderFromTexts([...history.filter((h) => h.role === "user").map((h) => h.text), message]);
    const order: OrderData = startFresh
      ? { ...extracted, active: true }
      : mergeOrderData(prevOrder, extracted, intentNow ? { active: true } : {});

    if (order.active && !order.completed) {
      let reply: string;
      if (!order.customerName && !order.phone && !order.streetAndNumber && !order.city && !order.postalCode) {
        // Nothing known yet → the classic full collection prompt.
        reply = orderCollectionReply(lang, formal, settings?.orderPrompt ?? "");
      } else {
        const missing = missingOrderFields(order);
        if (missing.length > 0) {
          reply = orderMissingReply(lang, formal, missing);
        } else {
          // Everything is here → save the order once and confirm with a summary.
          if (!order.productText && convoState.productContext?.length) order.productText = convoState.productContext.join(", ");
          const orderText = [order.productText ?? "", order.note ? `napomena: ${order.note}` : ""].filter(Boolean).join(" | ");
          await d.insert(orders).values({
            businessId,
            conversationId: convo.id,
            customerName: order.customerName ?? "",
            phone: order.phone ?? "",
            address: `${order.streetAndNumber ?? ""}, ${order.postalCode ?? ""} ${order.city ?? ""}`.trim(),
            streetAndNumber: order.streetAndNumber ?? "",
            city: order.city ?? "",
            postalCode: order.postalCode ?? "",
            orderText,
            internalNote: order.note ?? ""
          });
          order.completed = true;
          await logEvent(businessId, "info", "ai_reply", `Order collected in conversation ${convo.id}`, { conversationId: convo.id });
          reply = orderConfirmReply(lang, formal, order);
        }
      }
      return persistReply(withSend({ ...base, intent: "order", orderTriggered: true, reply }), { order });
    }
  } else if (orderWanted && !convo && detectOrderIntent(message)) {
    // Legacy stateless path (no sender identified): original one-shot prompt.
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
    if (convo && u.handoff) {
      await markHumanTakeover(businessId, convo.id, new Date(now.getTime() + HUMAN_TAKEOVER_MS));
      await d.insert(handoffs).values({ businessId, conversationId: convo.id, triggerWord: "", reason: "unknown question — offer_handoff" });
    }
    return persistReply(
      withSend({ ...base, intent: "unknown", handoffTriggered: u.handoff, reply: u.reply, note: `no grounding (product conf ${productConfidence} < ${threshold})` })
    );
  }

  // Resolve provider key (honors platform usage mode: business_key_required has no fallback).
  const resolved = provider === "anthropic" ? await resolveAnthropicKey(businessId) : await resolveOpenAiKey(businessId);
  if (!resolved.key) {
    const note =
      resolved.mode === "business_key_required"
        ? `API ključ biznisa je obavezan (${provider}) a nije unet — bot ne poziva AI. Pravila (FAQ/predaja/porudžbina) i dalje rade.`
        : `Nema ${provider} ključa za ovaj biznis ni platformskog ključa. Pravila (FAQ/predaja/porudžbina) i dalje rade.`;
    await logEvent(businessId, "warn", "ai_reply", `API ključ nedostaje (${provider}, mode=${resolved.mode})`, { provider, mode: resolved.mode });
    return { ...base, intent: "no_ai", reply: "", note };
  }

  const topProducts = confidentProduct ? productMatches.slice(0, 6) : [];
  const askedVariant = /\b(velicin|velicina|broj|size|boj[aeu]|boje|color|colou?r)\b/i.test(norm(message));
  const variants = askedVariant && topProducts.length ? await variantsFor(businessId, topProducts.map((m) => m.product.id)) : new Map();
  const productData = topProducts.map((m) => `- ${productFacts(m.product)}${variantFacts(variants.get(m.product.id) ?? [])}`).join("\n");

  const persInstruction = lang === "en" ? "" : formal ? "Address the customer formally (persiranje: Vi/Vas)." : "Address the customer informally (ti).";
  const summary = settings?.oldChatsSummary ? `Style/knowledge summary: ${settings.oldChatsSummary.slice(0, 800)}` : "";

  // Conversation-memory context: tell the model this is one ongoing thread and
  // hand it everything we already know, so it never re-asks or contradicts.
  const knownOrder = convoState.order ?? {};
  const knownOrderBits = [
    knownOrder.customerName,
    knownOrder.streetAndNumber,
    [knownOrder.postalCode, knownOrder.city].filter(Boolean).join(" "),
    knownOrder.phone,
    knownOrder.note ? `note: ${knownOrder.note}` : "",
    knownOrder.productText ? `ordering: ${knownOrder.productText}` : ""
  ].filter(Boolean);
  const ongoingNote = history.length
    ? "This is ONE ongoing conversation with the same customer — recent messages follow. Answer in the context of the whole conversation (short follow-ups like 'a kad stiže?' refer to the previous topic). NEVER re-ask for details the customer already gave."
    : "";
  const knownOrderNote = knownOrderBits.length
    ? `KNOWN CUSTOMER/ORDER DATA (already provided — do NOT ask again): ${knownOrderBits.join("; ")}`
    : "";
  const prevProductsNote = !productData && convoState.productContext?.length
    ? `Previously discussed products in this conversation: ${convoState.productContext.join(", ")}`
    : "";

  const system = [
    `You are the customer support agent for "${biz.name}" on Facebook/Instagram DM. Reply in ${lang === "en" ? "English" : "the customer's language (Serbian/Bosnian/Croatian)"}.`,
    `Tone: ${settings?.tone ?? biz.tone}. Keep replies short (1-3 sentences), warm and human. Never say you are an AI.`,
    persInstruction,
    ongoingNote,
    knownOrderNote,
    prevProductsNote,
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

  // Recent history (oldest→newest) + the current message as the final turn.
  const chatMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.text.slice(0, 600) })),
    { role: "user" as const, content: message.slice(0, 1000) }
  ];

  const model = pickModel({ provider, businessModel: biz.selectedModel, platformDefault: null }) || APP_DEFAULT_MODEL[provider];
  let ai: { text: string; tokens: number };
  try {
    ai = opts.chatCompletion
      ? await opts.chatCompletion({ provider, model, system, messages: chatMessages })
      : provider === "anthropic"
        ? await callAnthropic(resolved.key, model, system, chatMessages)
        : await callOpenAi(resolved.key, model, system, chatMessages);
  } catch (err) {
    // Sanitized, per-business, human-readable — surfaces in the admin logs tab.
    await logEvent(businessId, "error", "ai_reply", `AI reply failed (${provider}/${model}): ${sanitizeAiError((err as Error).message)}`, {
      provider,
      model,
      keySource: resolved.source
    });
    throw err;
  }

  const cost = (ai.tokens / 1000) * (MODEL_COST_PER_1K[model] ?? 0.001);
  return persistReply(
    withSend({
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
    }),
    // Remember what we talked about: matched products (or keep the previous context).
    { productContext: topProducts.length ? topProducts.map((m) => m.product.title) : convoState.productContext }
  );
}

const VISION_PROMPT =
  "Opiši ovu sliku proizvoda u 1-2 rečenice: vrsta artikla, boja, materijal i uočljivi detalji. Bez izmišljanja cene ili dostupnosti.";

/**
 * Describe an image using the TENANT's own key. Prefers the configured provider;
 * falls back to the other provider only if that tenant also has that key. Returns
 * null if neither key is available (caller then asks for a text description).
 * Never logs token material.
 */
/** Core vision describe — returns {text,error}; does NOT log (caller decides). */
async function visionDescribe(
  businessId: string,
  imageUrl: string,
  provider: Provider,
  visionModel: string
): Promise<{ text: string | null; error: string }> {
  const openai = async () => {
    const { key } = await resolveOpenAiKey(businessId);
    if (!key) return null;
    // Vision needs a vision-capable OpenAI model; guard against a text-only default.
    const model = /^gpt-4o|^gpt-4\.1|vision|^o[134]/i.test(visionModel) ? visionModel : APP_DEFAULT_VISION_MODEL;
    return openaiVision(key, model, imageUrl);
  };
  const anthropic = async () => {
    const { key } = await resolveAnthropicKey(businessId);
    if (!key) return null;
    return anthropicVision(key, /claude/i.test(visionModel) ? visionModel : "claude-3-5-sonnet-latest", imageUrl);
  };
  try {
    const text = provider === "anthropic" ? (await anthropic()) ?? (await openai()) : (await openai()) ?? (await anthropic());
    return { text, error: "" };
  } catch (err) {
    return { text: null, error: sanitizeAiError((err as Error).message) };
  }
}

export async function describeImageWithTenantKey(
  businessId: string,
  imageUrl: string,
  provider: Provider,
  visionModel: string
): Promise<string | null> {
  const r = await visionDescribe(businessId, imageUrl, provider, visionModel);
  if (r.error) {
    // Model not vision-capable / bad image / provider error → clear per-business log, graceful null.
    await logEvent(businessId, "error", "ai_reply", `Slika nije mogla biti analizovana (${provider}/${visionModel}): ${r.error}`, { provider, visionModel });
  }
  return r.text;
}

export interface ImageDiagnosis {
  recognitionEnabled: boolean;
  provider: Provider;
  visionModel: string;
  keyReady: boolean;
  keySource: string;
  visionOk: boolean;
  description: string;
  matchedProduct: string | null;
  answer: string;
  intent: string;
  error: string;
}

/**
 * Admin "Test image recognition": run each stage explicitly and report what
 * happened — recognition on/off, provider+model, vision success, matched
 * product, generated answer, sanitized error. Strictly tenant-scoped.
 */
export async function diagnoseImageRecognition(businessId: string, imageUrl: string, message: string): Promise<ImageDiagnosis> {
  const cfg = await resolveProviderRuntimeConfig(businessId);
  const out: ImageDiagnosis = {
    recognitionEnabled: cfg.imageRecognitionEnabled,
    provider: cfg.provider,
    visionModel: cfg.visionModel,
    keyReady: cfg.ready,
    keySource: cfg.keySource,
    visionOk: false,
    description: "",
    matchedProduct: null,
    answer: "",
    intent: "",
    error: ""
  };

  let description: string | null = null;
  if (!cfg.imageRecognitionEnabled) {
    out.error = "Prepoznavanje slika je isključeno za ovaj biznis.";
  } else if (!cfg.ready) {
    out.error = cfg.reason;
  } else {
    const r = await visionDescribe(businessId, imageUrl, cfg.provider, cfg.visionModel);
    description = r.text;
    out.visionOk = Boolean(r.text);
    out.description = r.text ?? "";
    out.error = r.error || (r.text ? "" : "Model nije vratio opis (možda nije vision-capable ili je slika nedostupna).");
    if (description) {
      const matches = await matchProducts(businessId, description);
      out.matchedProduct = matches[0]?.product.title ?? null;
    }
  }

  // Show the ACTUAL bot answer. Reuse the captured description to avoid a 2nd vision call.
  try {
    const eng = await runEngine(businessId, message, { imageUrl, describeImage: description ? async () => description : undefined });
    out.answer = eng.reply;
    out.intent = eng.intent;
  } catch (err) {
    out.error = out.error || sanitizeAiError((err as Error).message);
  }
  return out;
}

async function openaiVision(key: string, model: string, imageUrl: string): Promise<string | null> {
  const r = await callOpenAiChat({
    key,
    model,
    maxTokens: 160,
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
  });
  return r.text || null;
}

async function anthropicVision(key: string, model: string, imageUrl: string): Promise<string | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
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
  // Also match the business's own client_id (works even before a connection exists).
  const [byBizClient] = await d.select({ id: businesses.id }).from(businesses).where(eq(businesses.clientId, id)).limit(1);
  if (byBizClient) return byBizClient.id;
  const [byPage] = await d.select({ businessId: metaConnections.businessId }).from(metaConnections).where(eq(metaConnections.pageId, id)).limit(1);
  return byPage?.businessId ?? null;
}

/**
 * Inbound entrypoint for the n8n payload. Resolves the tenant, then runs the
 * normal grounded engine (tenant-scoped). When n8n forwards the sender
 * (sender_id + channel + optional conversation id), conversation memory turns
 * on: the engine loads this customer's recent history before replying.
 */
export async function runEngineForInbound(
  input: {
    clientId: string;
    message?: string;
    imageUrl?: string;
    senderId?: string;
    channel?: Channel;
    externalConversationId?: string;
  },
  opts: EngineOptions = {}
): Promise<EngineResult & { businessId: string }> {
  const businessId = await resolveTenantByClientId(input.clientId);
  if (!businessId) throw new Error("unknown client_id");
  const conversation: ConversationKey | undefined = input.senderId
    ? { channel: input.channel ?? "facebook", senderId: input.senderId, externalConversationId: input.externalConversationId }
    : undefined;
  const result = await runEngine(businessId, input.message ?? "", { ...opts, imageUrl: input.imageUrl, conversation });
  return { ...result, businessId };
}

type ChatTurn = { role: "user" | "assistant" | "system"; content: string };

async function callOpenAi(key: string, model: string, system: string, messages: ChatTurn[]): Promise<{ text: string; tokens: number }> {
  // Adaptive token-param handling (max_tokens vs max_completion_tokens) lives in ai-runtime.
  const r = await callOpenAiChat({
    key,
    model,
    messages: [
      { role: "system", content: system },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
    ],
    maxTokens: 220,
    temperature: 0.4
  });
  return { text: r.text, tokens: r.tokens };
}

async function callAnthropic(key: string, model: string, system: string, messages: ChatTurn[]): Promise<{ text: string; tokens: number }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system,
      messages: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
    })
  });
  const data = (await res.json()) as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `anthropic_${res.status}`);
  const text = (data.content ?? []).map((c) => c.text ?? "").join("").trim();
  const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  return { text, tokens };
}
