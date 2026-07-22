import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { botSettings, businesses, conversations, handoffs, knowledgeSources, metaConnections, orders } from "./db/schema";
import { estimateCostUsd } from "./plans";
import { resolveOpenAiKey, resolveAnthropicKey } from "./secrets";
import { matchProducts, productFacts, variantFacts, variantsFor } from "./products";
import { pickModel, sanitizeModel, APP_DEFAULT_MODEL, APP_DEFAULT_VISION_MODEL, type Provider } from "./models";
import { callOpenAiChat, isReasoningModel, resolveProviderRuntimeConfig, sanitizeAiError, type OpenAiMessage } from "./ai-runtime";
import { buildSheetPayload, syncOrderToSheet } from "./sheets-sync";
import { resolvePlatform } from "./platform";
import { logEvent } from "./meta";
import { notifyBusiness } from "./notify";
import { messageUsage } from "./usage";
import { retrieveKnowledgeChunks } from "./knowledge-retrieval";
import { recordUnansweredQuestion } from "./unanswered";
import { withinBusinessHours, type BusinessHours } from "./hours";
import {
  extractOrderFields,
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

/** How many recent messages go into the AI prompt — raised past the original 10–20 spec at the business owner's explicit request so more of a returning customer's context survives. */
export const HISTORY_LIMIT = 30;
/** Human takeover silence window after a handoff trigger (Meta 24h rule). */
const HUMAN_TAKEOVER_MS = 24 * 60 * 60 * 1000;
/** Cap on downloaded customer photos — vision models don't need more. */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * Facebook/Instagram attachment CDN URLs (scontent.xx.fbcdn.net) are frequently
 * unreachable by third parties — OpenAI's own image downloader gets rejected or
 * times out fetching them, which used to throw and kill the whole reply. We
 * fetch the bytes ourselves (same network path Meta already trusts us on) and
 * hand the model a self-contained data: URL instead, so nothing downstream has
 * to fetch that URL again. Returns null (never throws) on any failure.
 */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; NibaChatBot/1.0; +https://nibaagent.vercel.app)" } });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export interface EngineResult {
  intent: "handoff" | "faq" | "order" | "ai" | "no_ai" | "unknown" | "off_hours" | "limit";
  reply: string;
  handoffTriggered: boolean;
  orderTriggered: boolean;
  knowledgeUsed: string[];
  modelUsed: string;
  provider: Provider;
  tokenEstimate: number;
  costEstimateUsd: number;
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

/**
 * Greetings/farewells/fillers that are NOT city names — a bare capitalized
 * word with no digits (e.g. a customer just saying "Živeli"/"Pozdrav" to sign
 * off) must never be mistaken for a city by looseOrderFields() below. This bit
 * a real conversation: the bare-city heuristic read "Živeli" as the city,
 * which flipped the message into "order-relevant" and made the bot fire the
 * canned missing-fields reply over a farewell instead of just closing warmly.
 */
const NON_CITY_WORDS = new Set([
  "zivio", "zivjeli", "ziveli", "zivela", "zdravo", "pozdrav", "cao", "bok", "hej", "hvala",
  "dovidjenja", "vidimo se", "laku noc", "vazi", "super", "odlicno", "ok", "okej", "dobro",
  "molim", "izvini", "izvinite", "u redu", "naravno", "svakako", "razumem", "razumijem"
]);

export function detectOrderIntent(message: string): boolean {
  const n = norm(message);
  return ORDER_PATTERNS.some((p) => p.test(n));
}

/** Any customer/order data present in an extraction result? */
function hasAnyOrderField(o: Partial<OrderData>): boolean {
  return Boolean(o.customerName || o.phone || o.streetAndNumber || o.city || o.postalCode || o.productText || o.note);
}

/**
 * Loose per-message extraction for BARE values mid-order (no labels needed):
 * "Marko Marković", "Sarajevo 71000", "Hrvatske kraljice 12". Only fills fields
 * that are still missing; strict labeled extraction (extractOrderFields) runs
 * first and always wins. Heuristics are deliberately conservative.
 */
function looseOrderFields(message: string, known: OrderData): Partial<OrderData> {
  const t = message.trim();
  const out: Partial<OrderData> = {};
  if (!t) return out;

  // Bare postal + town, found ANYWHERE in the message regardless of its
  // length (unlike the other bare-value checks below, which only look at a
  // short message in its entirety) — BiH postal codes are very commonly
  // typed with a space ("88 000 Mostar"), and requiring a town name right
  // after is specific enough to never be confused with a phone-number
  // fragment (a phone is never immediately followed by a capitalized word).
  if (!known.postalCode) {
    const pm = t.match(/(?:^|\s)(\d{2}\s?\d{3})\s+([A-ZČĆŽŠĐ][a-zčćžšđ]{2,})(?=\s|$)/u);
    if (pm) {
      out.postalCode = pm[1].replace(/\s+/g, "");
      if (!known.city && !NON_CITY_WORDS.has(norm(pm[2]))) out.city = pm[2];
    }
  }

  if (t.length > 60) return out;
  const digits = t.replace(/\D/g, "");
  const hasLetters = /[A-Za-zčćžšđČĆŽŠĐ]/u.test(t);

  // Bare street: letters + a short number ("Hrvatske kraljice 12"), optionally
  // with the town tacked on the same line — customers very commonly type the
  // whole address as one line ("Kozarska 36 bugojno", "Hrvatske kraljice 12,
  // Sarajevo") rather than splitting it across messages or using labels.
  if (!known.streetAndNumber && hasLetters && /\d/.test(t) && digits.length > 0 && digits.length <= 4) {
    const m = t.match(/^([A-Za-zčćžšđČĆŽŠĐ][A-Za-zčćžšđČĆŽŠĐ .'/-]{1,34}?\d+[a-zA-Z]?)(?:[,\s]+([A-Za-zčćžšđČĆŽŠĐ]{2,30}))?$/u);
    if (m) {
      out.streetAndNumber = m[1].trim().replace(/[,\s]+$/, "");
      if (!known.city && m[2] && !NON_CITY_WORDS.has(norm(m[2]))) out.city = m[2].trim();
      return out; // a street line is not a name
    }
  }

  // Bare name: 2-3 capitalized words, no digits ("Marko Marković").
  if (!known.customerName && digits.length === 0 && /^[A-ZČĆŽŠĐ][a-zčćžšđ]{1,20}(?:\s+[A-ZČĆŽŠĐ][a-zčćžšđ]{1,20}){1,2}$/u.test(t)) {
    out.customerName = t;
    return out;
  }

  // Bare city: 1-2 capitalized words, optionally with a 5-digit postal code
  // ("Sarajevo", "Sarajevo 71000"). Two words only count once the name is known
  // (otherwise it reads as a name).
  if (!known.city && (digits.length === 0 || digits.length === 5)) {
    const m = t.match(/^([A-ZČĆŽŠĐ][a-zčćžšđ]{2,}(?:\s+[A-ZČĆŽŠĐ][a-zčćžšđ]{2,})?)\s*(?:\d{5})?$/u);
    if (m && (m[1].split(/\s+/).length === 1 || known.customerName) && !NON_CITY_WORDS.has(norm(m[1]))) {
      out.city = m[1].trim();
    }
  }
  return out;
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
   * Set when this thread was opened (or this message sent) by clicking a
   * Click-to-Messenger/Instagram ad — the ad's own title/headline. Used to
   * identify the exact product being advertised so the first reply speaks to
   * it directly instead of a generic greeting.
   */
  adTitle?: string;
  /**
   * WHO sent the message (channel + sender id). When present, the engine keeps
   * one continuous conversation per (business, channel, sender): saves every
   * message, loads recent history into the AI prompt and tracks order fields
   * across messages. Omit for stateless calls (legacy n8n payload).
   */
  conversation?: ConversationKey;
  /**
   * Set by the Meta webhook processor: it already saved the inbound message
   * (before the debounce window), so the engine must NOT save it again — and
   * the current message is already the newest history row, so it is not
   * appended to the prompt/order-extraction a second time.
   */
  inboundAlreadySaved?: boolean;
  /** Test seam: replace the provider chat call (captures the prompt, no network). */
  chatCompletion?: (input: {
    provider: Provider;
    model: string;
    system: string;
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  }) => Promise<{ text: string; tokens: number }>;
  /**
   * Test seam: intercept the owner notification (new order / handoff / limit).
   * The engine always fires it fire-and-forget — it never throws into the reply
   * path and never blocks the customer reply on a notification provider.
   */
  notify?: (input: OwnerNotification) => Promise<void>;
}

export interface OwnerNotification {
  kind: "handoff" | "order" | "complaint" | "event";
  text: string;
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
  // Hard cap at 30s: the webhook function budget is 60s and a 10s debounce runs
  // first — a larger stored value (or a legacy row) must never blow the budget.
  const replyDelaySeconds = Math.min(Math.max(settings?.replyDelaySeconds ?? 0, 0), 30);
  const lang = biz.defaultLanguage;
  const now = opts.now ?? new Date();

  const base: Omit<EngineResult, "intent" | "reply"> = {
    handoffTriggered: false,
    orderTriggered: false,
    knowledgeUsed: [],
    modelUsed: "rules",
    provider,
    tokenEstimate: 0,
    costEstimateUsd: 0,
    aiCalled: false,
    launchMode,
    shouldSend: false,
    replyDelaySeconds
  };
  // A reply is only actually sent in "live" mode. Draft = prepared but held; paused = nothing.
  const withSend = (r: EngineResult): EngineResult => ({ ...r, shouldSend: launchMode === "live" && r.reply.trim().length > 0 });

  // Owner notifications (new order, handoff, plan limit). Fire-and-forget:
  // a notification provider must NEVER throw into the reply path or delay it.
  const notifyOwner = (n: OwnerNotification): void => {
    const send = opts.notify ?? ((i: OwnerNotification) => notifyBusiness(biz, i.kind, i.text));
    void Promise.resolve()
      .then(() => send(n))
      .catch(() => {});
  };

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
    // The webhook processor saves the inbound message itself (before its
    // debounce window) — saving again here would double every message.
    if (!opts.inboundAlreadySaved) {
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
  }

  // Image description (vision) calls burn real provider tokens even when the
  // final reply comes from rules/knowledge, not the answering AI call — track
  // them separately and fold them into whatever reply actually goes out below.
  let visionTokens = 0;
  let visionCostUsd = 0;

  /** Persist the bot reply + roll the conversation state forward. */
  const persistReply = async (r: EngineResult, patch?: Partial<ConversationState>): Promise<EngineResult> => {
    const withVisionCost: EngineResult = {
      ...r,
      tokenEstimate: r.tokenEstimate + visionTokens,
      costEstimateUsd: Math.round((r.costEstimateUsd + visionCostUsd) * 1_000_000) / 1_000_000
    };
    if (!convo) return withVisionCost;
    if (withVisionCost.reply.trim()) {
      await saveConversationMessage({
        businessId,
        conversationId: convo.id,
        channel: convo.channel as Channel,
        direction: "outbound",
        text: withVisionCost.reply,
        intent: withVisionCost.intent,
        aiGenerated: withVisionCost.aiCalled,
        modelUsed: withVisionCost.aiCalled ? withVisionCost.modelUsed : "",
        tokenEstimate: withVisionCost.tokenEstimate,
        costEstimate: withVisionCost.costEstimateUsd
      });
    }
    await updateConversationState(businessId, convo.id, { lastIntent: withVisionCost.intent, ...patch });
    return { ...withVisionCost, conversationId: convo.id };
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

  // 0d. recognition ON + an image URL present → download it ourselves (Meta's
  // CDN links are often unreachable by third parties, incl. OpenAI's own
  // downloader) and describe it with THIS tenant's own vision model/key,
  // folding the description into the query so downstream matches stay scoped
  // to this tenant's catalog/knowledge.
  let imageDataUrl: string | undefined;
  if (opts.imageUrl && settings?.imageRecognitionEnabled) {
    const visionModel =
      sanitizeModel((await resolvePlatform("DEFAULT_VISION_MODEL")).value) ||
      (provider === "anthropic" ? "claude-3-5-sonnet-latest" : APP_DEFAULT_VISION_MODEL);
    await logEvent(businessId, "info", "ai_reply", `image_url primljen — prepoznavanje uključeno (model ${visionModel})`, { visionModel });
    imageDataUrl = opts.describeImage ? opts.imageUrl : (await fetchImageAsDataUrl(opts.imageUrl)) ?? undefined;
    if (!imageDataUrl) {
      await logEvent(businessId, "warn", "ai_reply", "Slika nije mogla biti preuzeta — nastavljam bez prepoznavanja slike");
    }
    const desc = imageDataUrl
      ? await (opts.describeImage
          ? opts.describeImage(imageDataUrl).catch(() => null)
          : describeImageWithTenantKey(businessId, imageDataUrl, provider, visionModel)
              .then((r) => {
                visionTokens = r.promptTokens + r.completionTokens;
                visionCostUsd = estimateCostUsd(visionModel, r.promptTokens, r.completionTokens);
                return r.text;
              })
              .catch(() => null))
      : null;
    if (desc) {
      message = `${message ? message + " " : ""}[Slika prikazuje: ${desc}]`.trim();
    } else if (imageDataUrl) {
      await logEvent(businessId, "warn", "ai_reply", "Slika nije mogla biti analizirana — nastavljam bez prepoznavanja slike");
    }
  }

  // 0e. thread opened by clicking an ad → identify the exact advertised
  // product (Meta gives us the ad's own title, not a product id) and fold it
  // into the query so it grounds the first reply, even if the customer typed
  // nothing yet (ad-open events can arrive with empty text).
  const adTitle = (opts.adTitle ?? "").trim();
  if (adTitle) {
    await logEvent(businessId, "info", "ai_reply", `Razgovor otvoren klikom na reklamu: "${adTitle}"`, { adTitle });
    message = `${message ? message + " " : ""}[Reklama: ${adTitle}]`.trim();
  }

  // 1. handoff words — cheapest, safest
  const handoffWords = (settings?.handoffWords as string[]) ?? [];
  const trigger = biz.handoffEnabled ? detectHandoff(message, handoffWords) : null;
  if (trigger) {
    if (convo) {
      await markHumanTakeover(businessId, convo.id, new Date(now.getTime() + HUMAN_TAKEOVER_MS));
      await d.insert(handoffs).values({ businessId, conversationId: convo.id, triggerWord: trigger, reason: "trigger word in conversation" });
      notifyOwner({
        kind: "handoff",
        text: `Predaja razgovora članu tima (ključna reč: „${trigger}").\nPoruka kupca: ${message.slice(0, 300)}\nRazgovor: ${convo.id}`
      });
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
  // HYBRID rule (industry standard for commerce bots): the state machine only
  // speaks when the CURRENT message is order-relevant (order intent or actual
  // data). Meta questions / small talk fall through to the AI, which sees the
  // whole conversation + the known order data — so the bot never loops the same
  // collection prompt and never "forgets" what the chat is about.
  const orderWanted = strategy === "rules_first" && settings?.orderCollectionEnabled;
  if (orderWanted && convo) {
    const intentNow = detectOrderIntent(message);
    const prevOrder = convoState.order ?? {};
    // A fresh explicit order intent after a completed order starts a NEW order.
    const startFresh = Boolean(prevOrder.completed && intentNow);
    // Fold extraction over the whole conversation so fields given earlier count.
    // (inboundAlreadySaved: the current message is already the newest history row.)
    const userTexts = history.filter((h) => h.role === "user").map((h) => h.text);
    if (!opts.inboundAlreadySaved) userTexts.push(message);
    const extracted = extractOrderFromTexts(userTexts);
    // Loose per-message extraction for bare values mid-order ("Marko Marković",
    // "Sarajevo 71000", "Hrvatske kraljice 12") — labels are NOT required.
    const loose = prevOrder.active ? looseOrderFields(message, prevOrder) : {};
    const order: OrderData = startFresh
      ? { ...mergeOrderData(extracted, loose), active: true }
      : mergeOrderData(prevOrder, extracted, loose, intentNow ? { active: true } : {});

    // Did THIS message carry anything order-relevant?
    const extractedNow = mergeOrderData(extractOrderFields(message), loose);
    const orderRelevantNow = intentNow || hasAnyOrderField(extractedNow);

    if (order.active && !order.completed && !orderRelevantNow) {
      // Not an order message — keep the enriched state (loose fields may have
      // added something) and let the AI answer from the full conversation.
      await updateConversationState(businessId, convo.id, { order });
      convoState = { ...convoState, order };
    }

    if (order.active && !order.completed && orderRelevantNow) {
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
          // Lock the conversation row and re-check under the lock before
          // inserting: two overlapping invocations for the same thread (a
          // Meta redelivery, or two customer messages whose debounce windows
          // both just elapsed) would otherwise both reach this branch and
          // insert the same order twice. Insert + state write happen in the
          // same transaction so a failure never leaves us with "completed"
          // set but no actual order row.
          const convoId = convo.id;
          const insertedOrder = await d.transaction(async (tx) => {
            const [row] = await tx
              .select({ conversationState: conversations.conversationState })
              .from(conversations)
              .where(and(eq(conversations.id, convoId), eq(conversations.businessId, businessId)))
              .for("update");
            const lockedState = parseConversationState(row?.conversationState);
            if (lockedState.order?.completed) return null; // a concurrent run already saved it
            const [inserted] = await tx
              .insert(orders)
              .values({
                businessId,
                conversationId: convoId,
                customerName: order.customerName ?? "",
                phone: order.phone ?? "",
                address: `${order.streetAndNumber ?? ""}, ${order.postalCode ?? ""} ${order.city ?? ""}`.trim(),
                streetAndNumber: order.streetAndNumber ?? "",
                city: order.city ?? "",
                postalCode: order.postalCode ?? "",
                orderText,
                internalNote: order.note ?? ""
              })
              .returning({ id: orders.id });
            await tx
              .update(conversations)
              .set({ conversationState: { ...lockedState, order: { ...order, completed: true } } as Record<string, unknown>, updatedAt: new Date() })
              .where(and(eq(conversations.id, convoId), eq(conversations.businessId, businessId)));
            return inserted ?? null;
          });
          order.completed = true;
          if (insertedOrder) {
            await logEvent(businessId, "info", "ai_reply", `Order collected in conversation ${convo.id}`, { conversationId: convo.id });
            notifyOwner({
              kind: "order",
              text: [
                "Nova porudžbina primljena 🛒",
                `Kupac: ${order.customerName ?? ""}`,
                `Telefon: ${order.phone ?? ""}`,
                `Grad: ${[order.postalCode, order.city].filter(Boolean).join(" ")}`,
                `Adresa: ${order.streetAndNumber ?? ""}`,
                `Porudžbina: ${orderText || "—"}`,
                `Razgovor: ${convo.id}`
              ].join("\n")
            });
            // Google Sheets sync (per-business Apps Script URL). Never throws —
            // failures are recorded on the order (sheet_sync_error) + logged.
            if (biz.googleSheetUrl) {
              await syncOrderToSheet({
                businessId,
                sheetUrl: biz.googleSheetUrl,
                payload: buildSheetPayload({
                  orderId: insertedOrder.id,
                  createdAt: new Date(),
                  clientId: biz.clientId,
                  businessName: biz.name,
                  channel: convo.channel,
                  order,
                  orderText
                })
              });
            }
          }
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

  // Knowledge grounding: chunked retrieval (knowledge_chunks) when the business
  // HAS chunks — only the relevant ones are injected. Businesses without chunks
  // keep the legacy whole-source injection (unchanged behavior).
  const retrieval = await retrieveKnowledgeChunks(businessId, message);
  const knowledge = retrieval.hasChunks
    ? retrieval.text
    : sources
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

  // Plan message limits — every rules path above (handoff words, FAQ, order
  // collection, unknown template) ALWAYS runs; only the AI call is gated.
  // Counts = this business's outbound messages today / this calendar month; a
  // positive per-business override wins over the plan default. The owner is
  // notified once, exactly when a counter crosses its limit (count == limit
  // means THIS reply would be limit+1).
  const usage = await messageUsage(businessId, biz.plan, biz.dailyMessageLimit, biz.monthlyMessageLimit, now);
  const overDaily = usage.usedToday >= usage.dailyLimit;
  const overMonthly = usage.usedMonth >= usage.monthlyLimit;
  if (overDaily || overMonthly) {
    await logEvent(
      businessId,
      "warn",
      "ai_reply",
      `Limit poruka dostignut (danas ${usage.usedToday}/${usage.dailyLimit}, mesec ${usage.usedMonth}/${usage.monthlyLimit}) — AI odgovor preskočen`
    );
    if (usage.usedToday === usage.dailyLimit || usage.usedMonth === usage.monthlyLimit) {
      notifyOwner({
        kind: "event",
        text: `Dostignut limit poruka za vaš plan (danas ${usage.usedToday}/${usage.dailyLimit}, ovaj mesec ${usage.usedMonth}/${usage.monthlyLimit}). AI odgovori su pauzirani do resetovanja brojača — pravila (FAQ/predaja/porudžbine) i dalje rade. Razmotrite nadogradnju plana.`
      });
    }
    return persistReply(
      withSend({
        ...base,
        intent: "limit",
        reply:
          lang === "en"
            ? "Thanks for your message! We're receiving a high volume of inquiries right now — we'll get back to you as soon as possible."
            : "Hvala na poruci! Trenutno imamo povećan broj upita — javićemo se u najkraćem roku.",
        note: "plan message limit reached — AI skipped"
      })
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
    ? "This is ONE ongoing conversation with the same customer — recent messages follow. Answer in the context of the whole conversation (short follow-ups like 'a kad stiže?' refer to the previous topic). NEVER re-ask for details the customer already gave. But equally, NEVER agree that you already have information you don't — if the customer claims they already sent their name/address/phone/etc. and it is NOT listed in KNOWN CUSTOMER/ORDER DATA below (or that section is missing entirely), do not just say 'yes we have it' to be agreeable. Say honestly that you don't see it in the conversation and ask them to resend it."
    : "";
  const knownOrderNote = knownOrderBits.length
    ? `KNOWN CUSTOMER/ORDER DATA (already provided — do NOT ask again): ${knownOrderBits.join("; ")}`
    : "";
  // Free-thinking order steering: when an order is mid-flight, the AI answers
  // the current message from context FIRST, then naturally guides back to the
  // missing fields — no rigid templates, no repeated questions.
  //
  // Two failure modes this guards against, both seen in real conversations:
  // 1. The model would sometimes ask for only ONE of several still-missing
  //    fields (picking whichever felt most natural), which reads as fine in
  //    isolation — but the NEXT reply (rules-based or AI) then lists the
  //    other missing fields the model never mentioned, and the customer sees
  //    the bot "suddenly" demanding more after being told it just needed one
  //    thing. Every nudge must now name the FULL still-missing list.
  // 2. The model would sometimes tell the customer their order is noted/
  //    complete/"will be shipped soon" while fields were still missing —
  //    pure hallucinated reassurance. It must never claim completion while
  //    the missing list below is non-empty.
  const stillMissing = missingOrderFields(knownOrder);
  const orderSteerNote = !knownOrder.active || knownOrder.completed
    ? ""
    : stillMissing.length
      ? `ORDER IN PROGRESS — still missing: ${stillMissing.map((f) => orderFieldLabel(f, lang)).join(", ")}. Answer the customer's message FIRST (using the conversation above), then ask for ALL of the fields listed above together, in one short sentence — do not name only one of them and do not say the order is complete/confirmed/being shipped, since it is not yet.`
      : `ORDER IN PROGRESS — every required field is already known; nothing is missing. Answer the customer's message FIRST, and you may now confirm the order is complete.`;
  const prevProductsNote = !productData && convoState.productContext?.length
    ? `Previously discussed products in this conversation: ${convoState.productContext.join(", ")}`
    : "";
  // history always includes the current inbound message by the time we get
  // here (the webhook processor saves it before calling the engine) — "first
  // message in the thread" means no ASSISTANT turn has happened yet, not an
  // empty history array.
  const adNote =
    adTitle && !history.some((h) => h.role === "assistant")
      ? productData
        ? `This conversation just started because the customer clicked an ad for "${adTitle}" — that product is in PRODUCTS below. Greet them warmly and speak to THAT item directly (price/stock/key detail) rather than a generic hello, unless their own message clearly asks something else.`
        : `This conversation just started because the customer clicked an ad for "${adTitle}", but that exact item wasn't found in the catalog data below — greet them warmly, reference the ad by name, and ask what they'd like to know instead of guessing at facts.`
      : "";

  const system = [
    `You are the customer support agent for "${biz.name}" on Facebook/Instagram DM. Reply in ${lang === "en" ? "English" : "the customer's language (Serbian/Bosnian/Croatian)"}.`,
    `Tone: ${settings?.tone ?? biz.tone}. Keep replies short (1-3 sentences), warm and human. Never say you are an AI.`,
    persInstruction,
    ongoingNote,
    knownOrderNote,
    orderSteerNote,
    prevProductsNote,
    adNote,
    "NEVER invent prices, stock, delivery terms or product facts. A price belongs to ONE specific product — if the customer is now asking about a different item than whichever one a price was quoted for earlier in this conversation, do NOT reuse that earlier number. Only state a price that is for the CURRENT item and is explicitly listed in PRODUCTS below. If the current item isn't clearly one of the products below, say the team will check and reply soon instead of guessing.",
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
  // (inboundAlreadySaved: the current message is already the newest history row.)
  const chatMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.text.slice(0, 600) })),
    ...(opts.inboundAlreadySaved ? [] : [{ role: "user" as const, content: message.slice(0, 1000) }])
  ];

  const model = pickModel({ provider, businessModel: biz.selectedModel, platformDefault: null }) || APP_DEFAULT_MODEL[provider];
  // A vision-capable answering model gets the customer's photo attached to the
  // final turn — it identifies the item itself instead of trusting a lossy
  // text description (this is what made n8n answers accurate).
  const visionCapable = provider === "openai" && /^(gpt-4o|gpt-4\.1|gpt-5|o[134])/i.test(model);
  const imageForModel = imageDataUrl && visionCapable ? imageDataUrl : undefined;
  const systemFinal = imageForModel
    ? `${system}\n\nA customer photo is attached to the last message — trust what YOU see in it (colors, model, design) over any text description of it.`
    : system;
  const callAi = (key: string) =>
    opts.chatCompletion
      ? opts.chatCompletion({ provider, model, system: systemFinal, messages: chatMessages })
      : provider === "anthropic"
        ? callAnthropic(key, model, systemFinal, chatMessages)
        : callOpenAi(key, model, systemFinal, chatMessages, imageForModel);
  let ai: { text: string; tokens: number; promptTokens?: number; completionTokens?: number };
  try {
    ai = await callAi(resolved.key);
  } catch (firstErr) {
    // A tenant's own key can be wrong/revoked/out of credit — never let it kill
    // the bot when a platform key exists: retry ONCE with the platform key.
    const platformKey =
      provider === "openai" && resolved.source === "business_key" && !opts.chatCompletion
        ? (await resolvePlatform("OPENAI_API_KEY")).value
        : "";
    if (platformKey && platformKey !== resolved.key) {
      try {
        await logEvent(businessId, "warn", "ai_reply", `Biznisov AI ključ ne radi (${sanitizeAiError((firstErr as Error).message)}) — prebačeno na platformski ključ`);
        ai = await callAi(platformKey);
      } catch (secondErr) {
        await logEvent(businessId, "error", "ai_reply", `AI reply failed (${provider}/${model}, platform retry): ${sanitizeAiError((secondErr as Error).message)}`, {
          provider,
          model,
          keySource: "platform_key"
        });
        throw secondErr;
      }
    } else {
      // Sanitized, per-business, human-readable — surfaces in the admin logs tab.
      await logEvent(businessId, "error", "ai_reply", `AI reply failed (${provider}/${model}): ${sanitizeAiError((firstErr as Error).message)}`, {
        provider,
        model,
        keySource: resolved.source
      });
      throw firstErr;
    }
  }

  const cost = estimateCostUsd(model, ai.promptTokens ?? 0, ai.completionTokens ?? Math.max(ai.tokens - (ai.promptTokens ?? 0), 0));
  // "Bot nije znao" loop: the AI answered with NO knowledge coverage (zero
  // relevant chunks, no sources, no FAQ) — record the question for the
  // dashboard so the owner can teach the bot. Fire-and-forget, never throws.
  if (retrieval.relevantChunks === 0 && !knowledge && !faqList) {
    void recordUnansweredQuestion({ businessId, conversationId: convo?.id ?? null, questionText: message }).catch(() => {});
  }
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
      costEstimateUsd: Math.round(cost * 10000) / 10000,
      aiCalled: true
    }),
    // Remember what we talked about: matched products (or keep the previous context).
    { productContext: topProducts.length ? topProducts.map((m) => m.product.title) : convoState.productContext }
  );
}

// Real prod bug: a vague description ("srebrni privezak sa fotografijom")
// never token-matches a catalog title like "Medaljon sa slikom" — the exact
// jewelry-type word matters for matchProducts()'s stem matching, so the
// model is told to pick one explicitly rather than paraphrase.
const VISION_PROMPT =
  "Opiši ovu sliku proizvoda u 1-2 rečenice. Prva reč MORA biti tačan tip nakita sa liste: medaljon, ogrlica, narukvica, minđuše, prsten, privezak — izaberi onaj koji najbolje odgovara, čak i ako je artikal ukrašen ili personalizovan (npr. medaljon sa slikom je i dalje 'medaljon', ne 'ogrlica'). Zatim boja, materijal i uočljivi detalji. Ako je ovo screenshot sajta/objave koji sadrži VIDLJIV tekst (cena, naziv proizvoda, link), prepiši taj tekst TAČNO kao poslednju rečenicu, npr. 'Vidljiv tekst na slici: ...' — ne prepričavaj ga svojim rečima. Bez izmišljanja cene ili dostupnosti koja nije stvarno vidljiva na slici.";

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
): Promise<{ text: string | null; error: string; promptTokens: number; completionTokens: number }> {
  const openai = async (): Promise<VisionCallResult | null> => {
    const { key } = await resolveOpenAiKey(businessId);
    if (!key) return null;
    // Vision needs a vision-capable OpenAI model; guard against a text-only default.
    const model = /^gpt-4o|^gpt-4\.1|vision|^o[134]/i.test(visionModel) ? visionModel : APP_DEFAULT_VISION_MODEL;
    return openaiVision(key, model, imageUrl);
  };
  const anthropic = async (): Promise<VisionCallResult | null> => {
    const { key } = await resolveAnthropicKey(businessId);
    if (!key) return null;
    return anthropicVision(key, /claude/i.test(visionModel) ? visionModel : "claude-3-5-sonnet-latest", imageUrl);
  };
  try {
    const result = provider === "anthropic" ? (await anthropic()) ?? (await openai()) : (await openai()) ?? (await anthropic());
    return { text: result?.text ?? null, error: "", promptTokens: result?.promptTokens ?? 0, completionTokens: result?.completionTokens ?? 0 };
  } catch (err) {
    return { text: null, error: sanitizeAiError((err as Error).message), promptTokens: 0, completionTokens: 0 };
  }
}

export async function describeImageWithTenantKey(
  businessId: string,
  imageUrl: string,
  provider: Provider,
  visionModel: string
): Promise<{ text: string | null; promptTokens: number; completionTokens: number }> {
  const r = await visionDescribe(businessId, imageUrl, provider, visionModel);
  if (r.error) {
    // Model not vision-capable / bad image / provider error → clear per-business log, graceful null.
    await logEvent(businessId, "error", "ai_reply", `Slika nije mogla biti analizovana (${provider}/${visionModel}): ${r.error}`, { provider, visionModel });
  }
  return { text: r.text, promptTokens: r.promptTokens, completionTokens: r.completionTokens };
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

interface VisionCallResult {
  text: string | null;
  promptTokens: number;
  completionTokens: number;
}

async function openaiVision(key: string, model: string, imageUrl: string): Promise<VisionCallResult> {
  // Reasoning models (o1/o3/o4, gpt-5) burn part of this budget on hidden
  // reasoning before writing the description — too low and they return
  // success with empty text. See isReasoningModel() for why.
  const r = await callOpenAiChat({
    key,
    model,
    maxTokens: isReasoningModel("openai", model) ? 1000 : 160,
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
  return { text: r.text || null, promptTokens: r.promptTokens, completionTokens: r.completionTokens };
}

async function anthropicVision(key: string, model: string, imageUrl: string): Promise<VisionCallResult> {
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
  const data = (await res.json()) as {
    content?: Array<{ text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `anthropic_vision_${res.status}`);
  const text = (data.content ?? []).map((c) => c.text ?? "").join("").trim() || null;
  return { text, promptTokens: data.usage?.input_tokens ?? 0, completionTokens: data.usage?.output_tokens ?? 0 };
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

async function callOpenAi(key: string, model: string, system: string, messages: ChatTurn[], imageUrl?: string): Promise<{ text: string; tokens: number; promptTokens: number; completionTokens: number }> {
  // Adaptive token-param handling (max_tokens vs max_completion_tokens) lives in ai-runtime.
  // When the customer attached a photo, the answering model SEES it directly
  // (like the old n8n flow) — no detail is lost in a text-only description.
  const finalMessages: OpenAiMessage[] = [
    { role: "system", content: system },
    ...messages.map((m, i) => {
      if (imageUrl && i === messages.length - 1 && m.role === "user") {
        return {
          role: "user" as const,
          content: [
            { type: "text", text: m.content },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    })
  ];
  // Reasoning models (o1/o3/o4, gpt-5) spend part of this budget on hidden
  // reasoning before writing the reply — 220 tokens is fine for a classic
  // chat model but can leave a reasoning model with nothing left to write,
  // returning success with an empty message and silently dropping the
  // customer's reply. See isReasoningModel() for the full story.
  const r = await callOpenAiChat({
    key,
    model,
    messages: finalMessages,
    maxTokens: isReasoningModel("openai", model) ? 1500 : 220,
    temperature: 0.4
  });
  return { text: r.text, tokens: r.tokens, promptTokens: r.promptTokens, completionTokens: r.completionTokens };
}

async function callAnthropic(key: string, model: string, system: string, messages: ChatTurn[]): Promise<{ text: string; tokens: number; promptTokens: number; completionTokens: number }> {
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
  const promptTokens = data.usage?.input_tokens ?? 0;
  const completionTokens = data.usage?.output_tokens ?? 0;
  return { text, tokens: promptTokens + completionTokens, promptTokens, completionTokens };
}
