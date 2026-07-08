import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { businessSecrets, eventLogs, type SecretKind } from "./db/schema";
import { decryptToken, encryptToken } from "./crypto";
import { env } from "./env";

/**
 * Per-business secret vault. Every value is encrypted at rest and only ever
 * leaves this module as (a) a decrypted value used server-side for an outbound
 * call, or (b) a masked "…ab12" preview. It is never returned to the client or
 * logged. Writes are business-scoped by the caller (admin/owner guard) BEFORE
 * reaching here.
 */

export interface MaskedSecret {
  kind: SecretKind;
  hasValue: boolean;
  preview: string; // "…ab12" or ""
  updatedAt: Date | null;
}

export async function setBusinessSecret(businessId: string, kind: SecretKind, plain: string): Promise<void> {
  const value = plain.trim();
  if (!value) return;
  const encryptedValue = encryptToken(value);
  const lastFour = value.length <= 4 ? value : value.slice(-4);
  const existing = await db()
    .select({ id: businessSecrets.id })
    .from(businessSecrets)
    .where(and(eq(businessSecrets.businessId, businessId), eq(businessSecrets.kind, kind)))
    .limit(1);
  if (existing[0]) {
    await db()
      .update(businessSecrets)
      .set({ encryptedValue, lastFour, updatedAt: new Date() })
      .where(eq(businessSecrets.id, existing[0].id));
  } else {
    await db().insert(businessSecrets).values({ businessId, kind, encryptedValue, lastFour });
  }
}

export async function deleteBusinessSecret(businessId: string, kind: SecretKind): Promise<void> {
  await db()
    .delete(businessSecrets)
    .where(and(eq(businessSecrets.businessId, businessId), eq(businessSecrets.kind, kind)));
}

/** Server-side only: the decrypted value, or "" if unset. Never send to a client. */
export async function getBusinessSecret(businessId: string, kind: SecretKind): Promise<string> {
  const row = (
    await db()
      .select()
      .from(businessSecrets)
      .where(and(eq(businessSecrets.businessId, businessId), eq(businessSecrets.kind, kind)))
      .limit(1)
  )[0];
  if (!row) return "";
  try {
    return decryptToken(row.encryptedValue);
  } catch {
    return "";
  }
}

/** Masked previews for the UI — no ciphertext, no plaintext, ever. */
export async function listMaskedSecrets(businessId: string): Promise<MaskedSecret[]> {
  const rows = await db().select().from(businessSecrets).where(eq(businessSecrets.businessId, businessId));
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return (["openai_api_key", "telegram_bot_token", "telegram_chat_id"] as SecretKind[]).map((kind) => {
    const r = byKind.get(kind);
    return {
      kind,
      hasValue: Boolean(r),
      preview: r?.lastFour ? `…${r.lastFour}` : "",
      updatedAt: r?.updatedAt ?? null
    };
  });
}

export interface KeyResolution {
  key: string;
  source: "business_key" | "platform_key" | "none";
}

/**
 * OpenAI key resolution (spec §PER-BUSINESS TOKENS):
 *   1. business's own key, else 2. platform key, else 3. none.
 * Logs WHICH source was used (never the key) to event_logs so cost/attribution
 * is auditable per business.
 */
export async function resolveOpenAiKey(businessId: string): Promise<KeyResolution> {
  const own = await getBusinessSecret(businessId, "openai_api_key");
  if (own) {
    await logKeySource(businessId, "business_key");
    return { key: own, source: "business_key" };
  }
  const platform = env().OPENAI_API_KEY;
  if (platform) {
    await logKeySource(businessId, "platform_key");
    return { key: platform, source: "platform_key" };
  }
  return { key: "", source: "none" };
}

/** Telegram config resolution: business token+chat, else platform token fallback. */
export async function resolveTelegram(
  businessId: string,
  businessChatId: string
): Promise<{ token: string; chatId: string; source: "business" | "platform" | "none" }> {
  const ownToken = await getBusinessSecret(businessId, "telegram_bot_token");
  const ownChat = (await getBusinessSecret(businessId, "telegram_chat_id")) || businessChatId;
  if (ownToken && ownChat) return { token: ownToken, chatId: ownChat, source: "business" };
  const platformToken = env().TELEGRAM_BOT_TOKEN;
  if (platformToken && ownChat) return { token: platformToken, chatId: ownChat, source: "platform" };
  return { token: "", chatId: ownChat, source: "none" };
}

async function logKeySource(businessId: string, source: "business_key" | "platform_key"): Promise<void> {
  try {
    await db().insert(eventLogs).values({
      businessId,
      level: "info",
      area: "ai_reply",
      message: `OpenAI key source: ${source}`,
      metadata: { source }
    });
  } catch {
    /* logging must never break the reply path */
  }
}
