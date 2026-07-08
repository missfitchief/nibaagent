"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { botSettings, businesses } from "../db/schema";
import { requireBusiness } from "../auth/guards";
import { sanitizeModel, isProvider } from "../models";
import type { BusinessHours } from "../hours";
import type { ActionState } from "./business";

const TONES = ["professional", "friendly", "luxury", "casual", "short", "detailed"] as const;

const BotSettingsInput = z.object({
  businessId: z.string().uuid(),
  tone: z.enum(TONES).default("friendly"),
  customInstructions: z.string().max(4000).default(""),
  orderCollectionEnabled: z.coerce.boolean().default(false),
  orderPrompt: z.string().max(2000).default(""),
  handoffWords: z.string().max(1000).default(""),
  // model/provider are optional — only submitted when the model picker is shown
  aiProvider: z.string().optional(),
  selectedModel: z.string().max(120).optional(),
  aiStrategy: z.enum(["rules_first", "balanced", "ai_heavy"]).default("rules_first"),
  persiranje: z.coerce.boolean().default(false),
  imageRecognitionEnabled: z.coerce.boolean().default(false),
  replyDelaySeconds: z.coerce.number().int().min(0).max(600).default(0),
  unknownBehavior: z.enum(["offer_handoff", "ask_rephrase", "generic_help"]).default("offer_handoff"),
  handoffThreshold: z.coerce.number().int().min(0).max(100).default(40),
  businessHoursEnabled: z.coerce.boolean().default(false),
  openHour: z.coerce.number().int().min(0).max(23).optional(),
  closeHour: z.coerce.number().int().min(0).max(24).optional(),
  offHoursMessage: z.string().max(500).optional()
});

export async function updateBotSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = BotSettingsInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const d = parsed.data;
  const { business } = await requireBusiness(d.businessId); // authz chokepoint

  const words = d.handoffWords
    .split(/[,\n]/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 50);

  const hours: BusinessHours = {
    enabled: d.businessHoursEnabled,
    openHour: d.openHour ?? 9,
    closeHour: d.closeHour ?? 21,
    offHoursMessage: (d.offHoursMessage ?? "").trim()
  };

  await db()
    .update(botSettings)
    .set({
      tone: d.tone,
      customInstructions: d.customInstructions,
      orderCollectionEnabled: d.orderCollectionEnabled,
      orderPrompt: d.orderPrompt,
      handoffWords: words.length ? words : undefined,
      aiStrategy: d.aiStrategy,
      persiranje: d.persiranje,
      imageRecognitionEnabled: d.imageRecognitionEnabled,
      replyDelaySeconds: d.replyDelaySeconds,
      unknownBehavior: d.unknownBehavior,
      handoffThreshold: d.handoffThreshold,
      businessHours: hours,
      ...(isProvider(d.aiProvider ?? "") ? { aiProvider: d.aiProvider as "openai" | "anthropic" } : {}),
      updatedAt: new Date()
    })
    .where(eq(botSettings.businessId, business.id));

  // Model lives on businesses; only overwrite when the picker submitted one.
  const model = sanitizeModel(d.selectedModel);
  await db()
    .update(businesses)
    .set({ tone: d.tone, ...(model ? { selectedModel: model } : {}), updatedAt: new Date() })
    .where(eq(businesses.id, business.id));
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
