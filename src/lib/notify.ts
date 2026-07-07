import "server-only";
import { env } from "./env";
import { logEvent } from "./meta";

/**
 * Notification provider abstraction. Telegram is implemented; WhatsApp is a
 * stub behind the same interface until a provider key is configured.
 */

export interface NotifyResult {
  ok: boolean;
  error?: string;
}

export async function sendTelegram(chatId: string, text: string): Promise<NotifyResult> {
  const token = env().TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN not configured" };
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

export async function sendWhatsApp(_target: string, _text: string): Promise<NotifyResult> {
  if (!env().WHATSAPP_PROVIDER_API_KEY) return { ok: false, error: "WhatsApp provider not configured" };
  // TODO: wire an actual provider (Twilio/360dialog) when a key is chosen.
  return { ok: false, error: "WhatsApp provider integration pending" };
}

export async function notifyBusiness(
  business: { id: string; name: string; telegramChannelId: string; whatsappNotificationTarget: string },
  kind: "handoff" | "order" | "complaint" | "event",
  text: string
): Promise<void> {
  const message = `🔔 ${business.name} — ${kind.toUpperCase()}\n${text}`;
  if (business.telegramChannelId) {
    const r = await sendTelegram(business.telegramChannelId, message);
    if (!r.ok) await logEvent(business.id, "warn", "notification", `Telegram notify failed: ${r.error}`);
  }
  if (business.whatsappNotificationTarget) {
    const r = await sendWhatsApp(business.whatsappNotificationTarget, message);
    if (!r.ok) await logEvent(business.id, "warn", "notification", `WhatsApp notify skipped: ${r.error}`);
  }
}
