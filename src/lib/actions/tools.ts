"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { botSettings, conversations, messages } from "../db/schema";
import { requireAdmin, requireBusiness } from "../auth/guards";
import { diagnoseImageRecognition, runEngine, type EngineResult, type ImageDiagnosis } from "../engine";
import { sendTelegram } from "../notify";
import { resolveTelegram } from "../secrets";
import { logEvent } from "../meta";
import { env } from "../env";
import { estimateCostUsd } from "../plans";

export interface TestState {
  result?: EngineResult;
  error?: string;
}

const TestInput = z.object({ businessId: z.string().uuid(), message: z.string().min(1).max(1000) });

/** Bot test page: run the exact rules-then-AI pipeline without touching Meta. */
export async function testBotAction(_prev: TestState, formData: FormData): Promise<TestState> {
  const parsed = TestInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Type a test message first." };
  const { business } = await requireBusiness(parsed.data.businessId, "admin");
  try {
    // Synthetic per-business sender: the test bot exercises the SAME conversation
    // memory as a real customer thread, without touching Meta.
    const result = await runEngine(business.id, parsed.data.message, {
      conversation: { channel: "facebook", senderId: `test-bot-${business.id}` }
    });
    // Cost/token figures are platform-admin-only (see /admin) — never ship them
    // to the business-owner-facing test page, even unrendered in the payload.
    return { result: { ...result, tokenEstimate: 0, costEstimateUsd: 0 } };
  } catch (err) {
    await logEvent(business.id, "error", "ai_reply", `Test run failed: ${(err as Error).message}`);
    return { error: (err as Error).message };
  }
}

export interface ImageTestState {
  result?: ImageDiagnosis;
  error?: string;
}

const ImageTestInput = z.object({
  businessId: z.string().uuid(),
  imageUrl: z.string().url().max(2000),
  message: z.string().max(1000).default("")
});

/** Admin "Test image recognition": full per-stage diagnosis for a tenant + image URL. */
export async function testImageRecognitionAction(_prev: ImageTestState, formData: FormData): Promise<ImageTestState> {
  const parsed = ImageTestInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Unesite ispravan URL slike (https://…)." };
  const { business } = await requireBusiness(parsed.data.businessId, "admin"); // tenant authz chokepoint
  try {
    const result = await diagnoseImageRecognition(business.id, parsed.data.imageUrl, parsed.data.message);
    return { result };
  } catch (err) {
    await logEvent(business.id, "error", "ai_reply", `Test prepoznavanja slike nije uspeo: ${(err as Error).message}`);
    return { error: (err as Error).message };
  }
}

const TelegramTest = z.object({ businessId: z.string().uuid() });

export async function telegramTestAction(_prev: { ok?: boolean; error?: string }, formData: FormData) {
  const parsed = TelegramTest.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };
  const { business } = await requireBusiness(parsed.data.businessId, "admin");
  // Per-business token first, platform token as fallback (never one business's
  // token used to reach another's chat — resolveTelegram is business-scoped).
  const tg = await resolveTelegram(business.id, business.telegramChannelId);
  if (!tg.token || !tg.chatId) {
    return { error: "Configure a Telegram bot token and chat id first (Integrations)." };
  }
  const r = await sendTelegram(tg.token, tg.chatId, `✅ Test notification from NibaChat Agent for ${business.name}.`);
  if (!r.ok) {
    await logEvent(business.id, "warn", "notification", `Telegram test failed: ${r.error}`);
    return { error: r.error };
  }
  return { ok: true };
}

/**
 * Admin-only, click-to-run, never continuous: summarize stored conversations
 * into a persistent style/knowledge summary. One cheap batched call; cached in
 * bot_settings until an admin clicks Generate again.
 */
export async function analyzeOldChatsAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const businessId = String(formData.get("businessId") ?? "");
  if (!businessId) return;
  const d = db();

  const convs = await d
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.businessId, businessId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(20);
  const texts: string[] = [];
  for (const c of convs) {
    const msgs = await d
      .select({ direction: messages.direction, text: messages.text })
      .from(messages)
      .where(and(eq(messages.conversationId, c.id), eq(messages.businessId, businessId)))
      .orderBy(messages.createdAt)
      .limit(30);
    if (msgs.length) texts.push(msgs.map((m) => `${m.direction === "inbound" ? "Customer" : "Business"}: ${m.text.slice(0, 200)}`).join("\n"));
  }
  if (!texts.length) {
    await logEvent(businessId, "warn", "ai_reply", "Old-chats analysis: no stored conversations to analyze");
    revalidatePath(`/admin/businesses/${businessId}`);
    return;
  }
  const e = env();
  if (!e.OPENAI_API_KEY) {
    await logEvent(businessId, "warn", "ai_reply", "Old-chats analysis skipped: OPENAI_API_KEY missing");
    revalidatePath(`/admin/businesses/${businessId}`);
    return;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${e.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Analyze these customer-support conversations. Produce a compact business summary (max 300 words): answer style/tone, common questions and their answers, product/price facts mentioned, delivery info, frequent objections. Write it as instructions a support agent can follow. Same language as the conversations."
        },
        { role: "user", content: texts.join("\n---\n").slice(0, 12000) }
      ],
      max_tokens: 500,
      temperature: 0.2
    })
  });
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  if (data.error) {
    await logEvent(businessId, "error", "ai_reply", `Old-chats analysis failed: ${data.error.message}`);
  } else {
    const summary = data.choices?.[0]?.message?.content?.trim() ?? "";
    await d
      .update(botSettings)
      .set({ oldChatsSummary: summary, oldChatsAnalyzedAt: new Date(), updatedAt: new Date() })
      .where(eq(botSettings.businessId, businessId));
    const tokens = data.usage?.total_tokens ?? 0;
    const cost = estimateCostUsd("gpt-4o-mini", data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0);
    await logEvent(businessId, "info", "ai_reply", `Old-chats analysis generated by ${admin.email} (${tokens} tokens, ~$${cost.toFixed(4)})`);
  }
  revalidatePath(`/admin/businesses/${businessId}`);
}
