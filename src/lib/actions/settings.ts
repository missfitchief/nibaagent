"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { botSettings, businesses } from "../db/schema";
import { requireBusiness } from "../auth/guards";
import type { ActionState } from "./business";

const TONES = ["professional", "friendly", "luxury", "casual", "short", "detailed"] as const;

const BotSettingsInput = z.object({
  businessId: z.string().uuid(),
  tone: z.enum(TONES).default("friendly"),
  customInstructions: z.string().max(4000).default(""),
  orderCollectionEnabled: z.coerce.boolean().default(false),
  orderPrompt: z.string().max(2000).default(""),
  handoffWords: z.string().max(1000).default("")
});

export async function updateBotSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = BotSettingsInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const { business } = await requireBusiness(parsed.data.businessId); // authz chokepoint

  const words = parsed.data.handoffWords
    .split(/[,\n]/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 50);

  await db()
    .update(botSettings)
    .set({
      tone: parsed.data.tone,
      customInstructions: parsed.data.customInstructions,
      orderCollectionEnabled: parsed.data.orderCollectionEnabled,
      orderPrompt: parsed.data.orderPrompt,
      handoffWords: words.length ? words : undefined,
      updatedAt: new Date()
    })
    .where(eq(botSettings.businessId, business.id));
  await db().update(businesses).set({ tone: parsed.data.tone, updatedAt: new Date() }).where(eq(businesses.id, business.id));
  revalidatePath("/app/bot");
  return { ok: true };
}

const AiModeInput = z.object({
  businessId: z.string().uuid(),
  aiMode: z.enum(["draft", "live", "paused"])
});

export async function setAiModeAction(formData: FormData): Promise<void> {
  const parsed = AiModeInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { business } = await requireBusiness(parsed.data.businessId);
  await db()
    .update(businesses)
    .set({ aiMode: parsed.data.aiMode, aiEnabled: parsed.data.aiMode !== "paused", updatedAt: new Date() })
    .where(eq(businesses.id, business.id));
  revalidatePath("/app");
  revalidatePath("/app/bot");
}

const BusinessSettingsInput = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(2).max(120),
  defaultLanguage: z.enum(["en", "sr", "bs", "hr"]),
  googleSheetUrl: z.string().max(500).default(""),
  telegramChannelId: z.string().max(120).default(""),
  whatsappNotificationTarget: z.string().max(120).default("")
});

export async function updateBusinessSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = BusinessSettingsInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input — check the fields and try again." };
  if (parsed.data.googleSheetUrl && !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(parsed.data.googleSheetUrl)) {
    return { error: "Google Sheet URL must look like https://docs.google.com/spreadsheets/…" };
  }
  const { business } = await requireBusiness(parsed.data.businessId);
  await db()
    .update(businesses)
    .set({
      name: parsed.data.name.trim(),
      defaultLanguage: parsed.data.defaultLanguage,
      googleSheetUrl: parsed.data.googleSheetUrl,
      telegramChannelId: parsed.data.telegramChannelId,
      whatsappNotificationTarget: parsed.data.whatsappNotificationTarget,
      updatedAt: new Date()
    })
    .where(eq(businesses.id, business.id));
  revalidatePath("/app/settings");
  return { ok: true };
}
