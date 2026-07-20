import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { businesses, users } from "./db/schema";
import { env } from "./env";
import { logEvent } from "./meta";
import { sendNotificationEmail } from "./email";
import { resolveTelegram } from "./secrets";

/**
 * Notification provider abstraction. Telegram + email (Resend) are implemented;
 * WhatsApp is a stub behind the same interface until a provider key is configured.
 */

export interface NotifyResult {
  ok: boolean;
  error?: string;
}

export async function sendTelegram(token: string, chatId: string, text: string): Promise<NotifyResult> {
  if (!token) return { ok: false, error: "No Telegram bot token configured" };
  if (!chatId) return { ok: false, error: "No Telegram chat/channel id set for this business" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3900) })
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    return data.ok ? { ok: true } : { ok: false, error: data.description ?? "telegram error" };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function sendWhatsApp(target: string, text: string): Promise<NotifyResult> {
  void target;
  void text;
  if (!env().WHATSAPP_PROVIDER_API_KEY) return { ok: false, error: "WhatsApp provider not configured" };
  // TODO: wire an actual provider (Twilio/360dialog) when a key is chosen.
  return { ok: false, error: "WhatsApp provider integration pending" };
}

/** The business owner's email (businesses.owner_user_id → users). "" when missing. */
async function ownerEmail(businessId: string): Promise<string> {
  const [row] = await db()
    .select({ email: users.email })
    .from(businesses)
    .innerJoin(users, eq(businesses.ownerUserId, users.id))
    .where(eq(businesses.id, businessId))
    .limit(1);
  return row?.email ?? "";
}

export async function notifyBusiness(
  business: { id: string; name: string; telegramChannelId: string; whatsappNotificationTarget: string },
  kind: "handoff" | "order" | "complaint" | "event",
  text: string
): Promise<void> {
  const message = `🔔 ${business.name} — ${kind.toUpperCase()}\n${text}`;
  // Resolve this business's own Telegram token (platform token only as fallback),
  // so notifications never cross tenant boundaries.
  const tg = await resolveTelegram(business.id, business.telegramChannelId);
  if (tg.token && tg.chatId) {
    const r = await sendTelegram(tg.token, tg.chatId, message);
    if (!r.ok) await logEvent(business.id, "warn", "notification", `Telegram notify failed: ${r.error}`);
  }
  if (business.whatsappNotificationTarget) {
    const r = await sendWhatsApp(business.whatsappNotificationTarget, message);
    if (!r.ok) await logEvent(business.id, "warn", "notification", `WhatsApp notify skipped: ${r.error}`);
  }
  // Email to the business owner via Resend. No dedicated notification-email
  // setting exists yet, so the account email is the target. When email is not
  // configured (dev mode) this is a silent skip — never an error.
  const to = await ownerEmail(business.id);
  if (to) {
    const r = await sendNotificationEmail(to, `NibaChat — ${business.name}: ${kind.toUpperCase()}`, message);
    if (!r.sent && r.mode !== "dev") await logEvent(business.id, "warn", "notification", `Email notify failed: ${r.note}`);
  }
}
