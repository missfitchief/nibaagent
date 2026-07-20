import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db/client";
import { conversations, messages } from "./db/schema";

/**
 * Conversation memory — the bot's continuity layer.
 *
 * One conversation = (business_id, channel, sender_id). Every inbound message
 * is saved BEFORE the reply is generated, and every bot reply is saved after.
 * The last N messages are loaded back into the AI prompt so the bot answers
 * the whole conversation instead of treating each message as isolated.
 *
 * Tenant isolation: every query is scoped by business_id — memory never
 * crosses businesses, and the (business_id, channel, sender_id) unique index
 * keeps different customers' threads strictly separate.
 */

export type Channel = "facebook" | "instagram";

export interface ConversationKey {
  channel: Channel;
  senderId: string;
  /** Meta conversation/thread id when n8n has it — stored for traceability. */
  externalConversationId?: string;
}

export type ConversationRow = typeof conversations.$inferSelect;

/** Data the bot collects for an order, persisted across messages. */
export interface OrderData {
  customerName?: string;
  phone?: string;
  streetAndNumber?: string;
  city?: string;
  postalCode?: string;
  /** Napomena / personalizacija (optional — only asked when the business needs it). */
  note?: string;
  /** What is being ordered, in the customer's words. */
  productText?: string;
  /** An order flow is in progress (collecting fields). */
  active?: boolean;
  /** All required fields were collected and the order was saved. */
  completed?: boolean;
}

export interface ConversationState {
  lastIntent?: string;
  /** Product titles discussed recently — keeps "a taj prsten?" coherent. */
  productContext?: string[];
  order?: OrderData;
}

/** Required order fields (note/productText are optional). */
export const REQUIRED_ORDER_FIELDS = ["customerName", "streetAndNumber", "city", "postalCode", "phone"] as const;
export type RequiredOrderField = (typeof REQUIRED_ORDER_FIELDS)[number];

/** Localized labels used when asking the customer for what is missing. */
export function orderFieldLabel(field: RequiredOrderField, lang: string): string {
  const en = lang === "en";
  switch (field) {
    case "customerName":
      return en ? "full name" : "ime i prezime";
    case "streetAndNumber":
      return en ? "street and number" : "ulicu i broj";
    case "city":
      return en ? "city" : "grad";
    case "postalCode":
      return en ? "postal code" : "poštanski broj";
    case "phone":
      return en ? "phone number" : "broj telefona";
  }
}

/** Find the open thread for this customer, or create it. Race-safe on the unique index. */
export async function findOrCreateConversation(businessId: string, key: ConversationKey): Promise<ConversationRow> {
  const d = db();
  const senderId = key.senderId.trim();
  const [existing] = await d
    .select()
    .from(conversations)
    .where(and(eq(conversations.businessId, businessId), eq(conversations.channel, key.channel), eq(conversations.senderId, senderId)))
    .limit(1);
  if (existing) {
    // Backfill the external thread id once we learn it; always bump activity.
    const patch: Partial<typeof conversations.$inferInsert> = { lastMessageAt: new Date(), updatedAt: new Date() };
    if (key.externalConversationId && !existing.externalConversationId) patch.externalConversationId = key.externalConversationId;
    const [updated] = await d
      .update(conversations)
      .set(patch)
      .where(and(eq(conversations.id, existing.id), eq(conversations.businessId, businessId)))
      .returning();
    return updated ?? existing;
  }
  try {
    const [created] = await d
      .insert(conversations)
      .values({
        businessId,
        channel: key.channel,
        senderId,
        externalConversationId: key.externalConversationId ?? "",
        status: "ai",
        lastMessageAt: new Date()
      })
      .returning();
    return created;
  } catch {
    // Concurrent first message created the row — just read it.
    const [raced] = await d
      .select()
      .from(conversations)
      .where(and(eq(conversations.businessId, businessId), eq(conversations.channel, key.channel), eq(conversations.senderId, senderId)))
      .limit(1);
    if (raced) return raced;
    throw new Error("conversation create failed");
  }
}

export type MessageRow = typeof messages.$inferSelect;

export async function saveConversationMessage(input: {
  businessId: string;
  conversationId: string;
  channel: Channel;
  direction: "inbound" | "outbound";
  senderId?: string;
  text: string;
  imageUrl?: string;
  intent?: string;
  aiGenerated?: boolean;
  modelUsed?: string;
  tokenEstimate?: number;
  costEstimate?: number;
}): Promise<MessageRow> {
  const d = db();
  const [row] = await d.insert(messages).values({
    businessId: input.businessId,
    conversationId: input.conversationId,
    channel: input.channel,
    direction: input.direction,
    senderId: input.senderId ?? "",
    text: input.text.slice(0, 8000),
    imageUrl: input.imageUrl ?? "",
    intent: input.intent ?? "",
    aiGenerated: input.aiGenerated ?? false,
    modelUsed: input.modelUsed ?? "",
    tokenUsageEstimate: input.tokenEstimate ?? 0,
    costEstimate: String(input.costEstimate ?? 0)
  }).returning();
  await d
    .update(conversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId)));
  return row;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
  intent: string;
  createdAt: Date;
}

/** Last N messages of THIS conversation, oldest first, ready for the AI prompt. */
export async function loadConversationHistory(businessId: string, conversationId: string, limit = 15): Promise<HistoryMessage[]> {
  const rows = await db()
    .select()
    .from(messages)
    .where(and(eq(messages.businessId, businessId), eq(messages.conversationId, conversationId)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse().map((m) => ({
    role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    text: m.text,
    intent: m.intent,
    createdAt: m.createdAt
  }));
}

export function parseConversationState(raw: unknown): ConversationState {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const order = (r.order && typeof r.order === "object" ? r.order : undefined) as OrderData | undefined;
  return {
    lastIntent: typeof r.lastIntent === "string" ? r.lastIntent : undefined,
    productContext: Array.isArray(r.productContext) ? (r.productContext as string[]).slice(0, 10) : undefined,
    order
  };
}

/**
 * Shallow-merge a patch into the stored state (order is merged field-wise).
 *
 * Runs inside a transaction with a row lock on the conversation: two inbound
 * messages in the same thread can be picked up by overlapping serverless
 * invocations (Meta redelivery, or two customer messages whose debounce
 * windows both just elapsed), and a plain read-then-write here would let one
 * update clobber the other — e.g. both read "order not completed yet", both
 * finish the order and insert a duplicate row. The second transaction blocks
 * on the lock until the first commits, then merges on top of the fresh state
 * instead of a stale one.
 */
export async function updateConversationState(businessId: string, conversationId: string, patch: Partial<ConversationState>): Promise<ConversationState> {
  const d = db();
  return d.transaction(async (tx) => {
    const [row] = await tx
      .select({ conversationState: conversations.conversationState })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.businessId, businessId)))
      .for("update");
    const current = parseConversationState(row?.conversationState);
    const next: ConversationState = {
      ...current,
      ...patch,
      order: patch.order ? { ...current.order, ...patch.order } : current.order
    };
    await tx
      .update(conversations)
      .set({ conversationState: next as Record<string, unknown>, updatedAt: new Date() })
      .where(and(eq(conversations.id, conversationId), eq(conversations.businessId, businessId)));
    return next;
  });
}

export async function markHumanTakeover(businessId: string, conversationId: string, until: Date): Promise<void> {
  await db()
    .update(conversations)
    .set({ status: "handoff", humanTakeoverUntil: until, updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.businessId, businessId)));
}

/* ── Order field extraction (deterministic, no AI call) ─────────────────── */

const PHONE_RE = /(\+?\d[\d\s./()-]{4,}\d)/g;
const POSTAL_RE = /\b(\d{5})\b/;
const NAME_RE = /(?:ime(?:\s+i\s+prezime)?\s*(?:je|:)?|zovem\s+se|ja\s+sam|my\s+name\s+is)\s+([A-ZČĆŽŠĐ][a-zčćžšđ]{1,20}(?:\s+[A-ZČĆŽŠĐ][a-zčćžšđ]{1,20}){0,2})/iu;
const CITY_RE = /(?:grad\s*(?:je|:)?|iz|from)\s+([A-ZČĆŽŠĐ][a-zčćžšđ]{2,}(?:\s+[A-ZČĆŽŠĐa-zčćžšđ][a-zčćžšđ]{2,})?)/iu;
const STREET_RE = /(?:ulic[aei]?|adres[aei]?|ul\.|street|address)\s*(?:je|:)?\s*([A-Za-zčćžšđČĆŽŠĐ][A-Za-zčćžšđČĆŽŠĐ0-9 .'/ -]{1,38}?\d+[a-zA-Z]?)/iu;
const NOTE_RE = /(?:napomen[aeiu]?|personalizacij[aeiu]?|natpis|gravur[aeiu]?|note)\s*(?:je|:)?\s*(.{2,120})/i;
const PRODUCT_RE = /(?:poručujem|naručujem|porucujem|narucujem|želim\s+da\s+(?:naručim|poručim|kupim)|zelim\s+da\s+(?:narucim|porucim|kupim)|hoću\s+da\s+(?:naručim|poručim|kupim)|uzimam|kupujem|i\s+want\s+to\s+(?:order|buy))\s+(.{2,80})/i;

/**
 * Best-effort field extraction from free text (sr/bs/hr/en). Only fills what it
 * can clearly see; the conversation history in the AI prompt covers the rest.
 */
export function extractOrderFields(text: string): Partial<OrderData> {
  const out: Partial<OrderData> = {};
  const t = text.trim();
  if (!t) return out;

  const phoneMatches = [...t.matchAll(PHONE_RE)].map((m) => m[1].trim());
  // Longest digit-run wins (postal codes are short; phones are long).
  const phone = phoneMatches.sort((a, b) => b.replace(/\D/g, "").length - a.replace(/\D/g, "").length)[0];
  if (phone && phone.replace(/\D/g, "").length >= 6) out.phone = phone;

  const postal = t.match(POSTAL_RE);
  if (postal) out.postalCode = postal[1];

  const name = t.match(NAME_RE);
  if (name) out.customerName = name[1].trim();

  const city = t.match(CITY_RE);
  if (city) out.city = city[1].trim();

  const street = t.match(STREET_RE);
  if (street) out.streetAndNumber = street[1].trim().replace(/[,\s]+$/, "");

  const note = t.match(NOTE_RE);
  if (note) out.note = note[1].trim().replace(/[.\s]+$/, "");

  const product = t.match(PRODUCT_RE);
  if (product) out.productText = product[1].trim().replace(/[.\s]+$/, "");

  return out;
}

/** Latest non-empty value wins — corrections overwrite, nothing is lost. */
export function mergeOrderData(...parts: Array<Partial<OrderData> | undefined>): OrderData {
  const out: OrderData = {};
  const keys: Array<keyof OrderData> = ["customerName", "phone", "streetAndNumber", "city", "postalCode", "note", "productText", "active", "completed"];
  for (const p of parts) {
    if (!p) continue;
    for (const k of keys) {
      const v = p[k];
      if (v !== undefined && v !== "") (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/** Extract + merge across a whole message list (oldest→newest). */
export function extractOrderFromTexts(texts: string[]): OrderData {
  return mergeOrderData(...texts.map(extractOrderFields));
}

export function missingOrderFields(order: OrderData): RequiredOrderField[] {
  return REQUIRED_ORDER_FIELDS.filter((f) => !order[f] || String(order[f]).trim() === "");
}
