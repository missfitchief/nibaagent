import "server-only";
import { and, eq, gt, ne } from "drizzle-orm";
import { db } from "./db/client";
import { businesses, messages, metaConnections, processedMessages } from "./db/schema";
import { decryptToken } from "./crypto";
import { logEvent, sendInstagramText, sendMessengerText } from "./meta";
import { findOrCreateConversation, saveConversationMessage, type Channel } from "./conversation-memory";
import { runEngine, type EngineOptions } from "./engine";

/**
 * Meta webhook processor — the app-owned replacement for the n8n workflow.
 *
 * Pipeline per inbound event (Messenger + Instagram in one handler):
 *   parse → guard (echo/delivery/read out) → dedupe (processed_messages)
 *   → tenant resolve (meta_connections, strictly per business)
 *   → save inbound message → 10s debounce (a newer message from the same
 *     sender aborts THIS run — the newer run replies with full context, so
 *     burst messages get ONE coherent reply, not many disconnected ones)
 *   → runEngine (conversation memory: history, order fields, handoff gate)
 *   → send the reply through the Meta Send API (decrypted tenant token)
 *
 * The engine saves the assistant reply itself; engine failures fall back to a
 * short apology (live tenants only) so the bot never goes silently dead.
 */

/** Wait window for burst-message merging (owner-approved 10 seconds). */
export const WEBHOOK_DEBOUNCE_MS = 10_000;

export interface ParsedInbound {
  channel: Channel;
  /** Page id (facebook) or Instagram Business Account id (instagram). */
  pageId: string;
  senderId: string;
  messageId: string;
  text: string;
  imageUrl: string;
  timestamp: number;
}

/** Pure parse of a Meta webhook payload — exported for tests. */
export function parseMetaWebhookEvents(body: unknown): ParsedInbound[] {
  const out: ParsedInbound[] = [];
  const root = (body ?? {}) as { object?: string; entry?: unknown[] };
  const channel: Channel = root.object === "instagram" ? "instagram" : "facebook";
  const entries = Array.isArray(root.entry) ? root.entry : [];

  for (const entry of entries) {
    const e = entry as { id?: string | number; messaging?: unknown[] };
    const pageId = e.id != null ? String(e.id) : "";
    const events = Array.isArray(e.messaging) ? e.messaging : [];
    for (const ev of events) {
      const m = ev as {
        sender?: { id?: string | number };
        timestamp?: number;
        message?: {
          mid?: string;
          text?: string;
          is_echo?: boolean;
          is_deleted?: boolean;
          attachments?: Array<{ type?: string; payload?: { url?: string } }>;
        };
        postback?: { title?: string };
        delivery?: unknown;
        read?: unknown;
      };
      // Skip delivery/read receipts and echoes of our own messages.
      if (m.delivery || m.read) continue;
      if (m.message?.is_echo || m.message?.is_deleted) continue;

      const senderId = m.sender?.id != null ? String(m.sender.id) : "";
      if (!senderId || !pageId) continue;
      const ts = typeof m.timestamp === "number" ? m.timestamp : Date.now();

      if (m.message) {
        const text = (m.message.text ?? "").trim();
        const imageUrl = (m.message.attachments ?? []).find((a) => a?.type === "image" && a?.payload?.url)?.payload?.url ?? "";
        if (!text && !imageUrl) continue; // sticker/like/unsupported → ignore
        out.push({ channel, pageId, senderId, messageId: m.message.mid || `msg:${senderId}:${ts}`, text, imageUrl, timestamp: ts });
      } else if (m.postback?.title) {
        out.push({ channel, pageId, senderId, messageId: `pb:${senderId}:${ts}`, text: m.postback.title.trim(), imageUrl: "", timestamp: ts });
      }
    }
  }
  return out;
}

export interface ProcessorDeps {
  /** Test seam: replaces the real sleep (debounce/reply-delay waits). */
  sleep?: (ms: number) => Promise<void>;
  /** Test seam: passthrough engine options (chatCompletion, now, …). */
  engineOptions?: EngineOptions;
  /** Test seam: intercept the actual Meta send. */
  sendText?: (args: { channel: Channel; token: string; igBusinessAccountId: string; recipientId: string; text: string }) => Promise<void>;
  /** Debounce override (tests). */
  debounceMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const defaultSend: NonNullable<ProcessorDeps["sendText"]> = async ({ channel, token, igBusinessAccountId, recipientId, text }) => {
  if (channel === "instagram") await sendInstagramText(token, igBusinessAccountId, recipientId, text);
  else await sendMessengerText(token, recipientId, text);
};

function fallbackApology(lang: string): string {
  return lang === "en"
    ? "Sorry — we're having technical difficulties. Our team will get back to you shortly."
    : "Izvinjavamo se — trenutno imamo tehničkih poteškoća. Naš tim će Vam se javiti uskoro.";
}

/** Process one full webhook payload (all entries/events). Never throws. */
export async function processMetaWebhook(body: unknown, deps: ProcessorDeps = {}): Promise<{ received: number; replied: number }> {
  const events = parseMetaWebhookEvents(body);
  let replied = 0;
  for (const ev of events) {
    try {
      const did = await processOne(ev, deps);
      if (did) replied += 1;
    } catch (err) {
      await logEvent(null, "error", "webhook_process", `Unhandled: ${(err as Error).message}`, { messageId: ev.messageId });
    }
  }
  return { received: events.length, replied };
}

async function processOne(ev: ParsedInbound, deps: ProcessorDeps): Promise<boolean> {
  const sleep = deps.sleep ?? realSleep;
  const sendText = deps.sendText ?? defaultSend;
  const d = db();

  // 1. dedupe — Meta retries webhooks; each message id is handled exactly once.
  const inserted = await d
    .insert(processedMessages)
    .values({ messageId: ev.messageId, pageId: ev.pageId, senderId: ev.senderId })
    .onConflictDoNothing()
    .returning({ messageId: processedMessages.messageId });
  if (inserted.length === 0) return false; // already processed (or in-flight)

  // 2. tenant resolve — strictly by the receiving page / IG account.
  const [conn] =
    ev.channel === "instagram"
      ? await d.select().from(metaConnections).where(eq(metaConnections.instagramBusinessAccountId, ev.pageId)).limit(1)
      : await d.select().from(metaConnections).where(eq(metaConnections.pageId, ev.pageId)).limit(1);
  if (!conn || (conn.status !== "active" && conn.status !== "connected")) {
    await logEvent(null, "warn", "webhook_process", `No active tenant for ${ev.channel} page ${ev.pageId}`, { senderId: ev.senderId });
    return false;
  }
  const businessId = conn.businessId;
  const conversationKey = { channel: ev.channel, senderId: ev.senderId } as const;

  // 3. save the inbound message immediately — later messages of a burst must
  //    see it in history, and the engine is told not to save it again.
  const convo = await findOrCreateConversation(businessId, conversationKey);
  const mine = await saveConversationMessage({
    businessId,
    conversationId: convo.id,
    channel: ev.channel,
    direction: "inbound",
    senderId: ev.senderId,
    text: ev.text,
    imageUrl: ev.imageUrl
  });

  // 4. debounce — wait, then bail out if a NEWER inbound message exists in the
  //    same conversation (its own run will reply with the full context).
  await sleep(deps.debounceMs ?? WEBHOOK_DEBOUNCE_MS);
  const newer = await d
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, convo.id), eq(messages.direction, "inbound"), gt(messages.createdAt, mine.createdAt), ne(messages.id, mine.id)))
    .limit(1);
  if (newer.length > 0) {
    await logEvent(businessId, "info", "webhook_process", `Burst merge: ${ev.messageId} superseded by a newer message — no separate reply`);
    return false;
  }

  // 5. engine (conversation memory + rules + AI). AI/key failures throw here —
  //    catch and answer with a short apology so the customer is never ignored.
  let replyToSend = "";
  try {
    const result = await runEngine(businessId, ev.text, {
      ...deps.engineOptions,
      imageUrl: ev.imageUrl || undefined,
      conversation: conversationKey,
      inboundAlreadySaved: true
    });
    if (!result.shouldSend || !result.reply.trim()) return false;
    replyToSend = result.reply;
    if (result.replyDelaySeconds > 0) await sleep(result.replyDelaySeconds * 1000);
  } catch (err) {
    await logEvent(businessId, "error", "webhook_process", `Engine failed for ${ev.messageId}: ${(err as Error).message}`);
    const [biz] = await d.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
    if (!biz || biz.aiMode !== "live") return false;
    replyToSend = fallbackApology(biz.defaultLanguage);
    // Persist the apology too, so the thread history matches what was sent.
    await saveConversationMessage({ businessId, conversationId: convo.id, channel: ev.channel, direction: "outbound", text: replyToSend, intent: "unknown" });
  }

  // 6. send through Meta with THIS tenant's own token (decrypted at runtime).
  const token =
    ev.channel === "instagram"
      ? decryptToken(conn.encryptedInstagramAccessToken) || conn.instagramAccessToken || decryptToken(conn.encryptedPageAccessToken) || conn.pageAccessToken
      : decryptToken(conn.encryptedPageAccessToken) || conn.pageAccessToken;
  try {
    await sendText({ channel: ev.channel, token, igBusinessAccountId: conn.instagramBusinessAccountId, recipientId: ev.senderId, text: replyToSend });
  } catch (err) {
    await logEvent(businessId, "error", "webhook_process", `Meta send failed (${ev.channel}): ${(err as Error).message}`, { senderId: ev.senderId });
    return false;
  }
  return true;
}
