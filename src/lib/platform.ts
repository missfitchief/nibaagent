import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { platformSettings } from "./db/schema";
import { decryptToken, encryptToken } from "./crypto";
import { env } from "./env";

/**
 * Global platform settings with DB → env → missing resolution. This is how
 * NibaChat can be configured from the admin UI (DB) while still honoring
 * env-based deploys (fallback). Secrets are encrypted at rest and never
 * returned in full — only status + masked preview.
 */

export const PLATFORM_KEYS = {
  // non-secret (shown plainly)
  APP_URL: { secret: false, env: "APP_URL" },
  META_APP_ID: { secret: false, env: "META_APP_ID" },
  META_MODE: { secret: false, env: "META_MODE" },
  META_REQUIRE_SIGNATURE: { secret: false, env: "META_REQUIRE_SIGNATURE" },
  DEFAULT_AI_PROVIDER: { secret: false, env: "" },
  DEFAULT_OPENAI_MODEL: { secret: false, env: "" },
  DEFAULT_VISION_MODEL: { secret: false, env: "OPENAI_VISION_MODEL" },
  DEFAULT_ANTHROPIC_MODEL: { secret: false, env: "" },
  // platform_key_only | business_key_allowed | business_key_required
  AI_USAGE_MODE: { secret: false, env: "AI_USAGE_MODE" },
  // email verification / transactional email
  EMAIL_MODE: { secret: false, env: "EMAIL_MODE" }, // dev | resend | smtp
  EMAIL_FROM: { secret: false, env: "EMAIL_FROM" },
  SMTP_HOST: { secret: false, env: "SMTP_HOST" },
  SMTP_PORT: { secret: false, env: "SMTP_PORT" },
  SMTP_USER: { secret: false, env: "SMTP_USER" },
  // secret (masked only)
  META_APP_SECRET: { secret: true, env: "META_APP_SECRET" },
  META_VERIFY_TOKEN: { secret: true, env: "META_VERIFY_TOKEN" },
  OPENAI_API_KEY: { secret: true, env: "OPENAI_API_KEY" },
  ANTHROPIC_API_KEY: { secret: true, env: "ANTHROPIC_API_KEY" },
  TELEGRAM_BOT_TOKEN: { secret: true, env: "TELEGRAM_BOT_TOKEN" },
  TELEGRAM_CHAT_ID: { secret: true, env: "" },
  RESEND_API_KEY: { secret: true, env: "RESEND_API_KEY" },
  SMTP_PASSWORD: { secret: true, env: "SMTP_PASSWORD" }
} as const;

/** How businesses may supply AI keys. Read via resolveUsageMode(). */
export type AiUsageMode = "platform_key_only" | "business_key_allowed" | "business_key_required";
export const AI_USAGE_MODES: AiUsageMode[] = ["platform_key_only", "business_key_allowed", "business_key_required"];

export async function resolveUsageMode(): Promise<AiUsageMode> {
  const raw = (await resolvePlatform("AI_USAGE_MODE")).value;
  return (AI_USAGE_MODES as string[]).includes(raw) ? (raw as AiUsageMode) : "business_key_allowed";
}

export type PlatformKey = keyof typeof PLATFORM_KEYS;

/** Resolved value (server-side use). DB row first, then env, then "". */
export async function resolvePlatform(key: PlatformKey): Promise<{ value: string; source: "db" | "env" | "missing" }> {
  const def = PLATFORM_KEYS[key];
  const row = (await db().select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1))[0];
  if (row?.value) {
    const value = def.secret ? safeDecrypt(row.value) : row.value;
    if (value) return { value, source: "db" };
  }
  const envVal = def.env ? (env() as unknown as Record<string, string>)[def.env] : "";
  if (envVal) return { value: envVal, source: "env" };
  return { value: "", source: "missing" };
}

export async function setPlatform(key: PlatformKey, raw: string): Promise<void> {
  const def = PLATFORM_KEYS[key];
  const value = raw.trim();
  const stored = def.secret ? encryptToken(value) : value;
  const lastFour = def.secret && value.length > 4 ? value.slice(-4) : "";
  const existing = (await db().select({ key: platformSettings.key }).from(platformSettings).where(eq(platformSettings.key, key)).limit(1))[0];
  if (existing) {
    await db().update(platformSettings).set({ value: stored, isSecret: def.secret, lastFour, updatedAt: new Date() }).where(eq(platformSettings.key, key));
  } else {
    await db().insert(platformSettings).values({ key, value: stored, isSecret: def.secret, lastFour });
  }
}

export async function deletePlatform(key: PlatformKey): Promise<void> {
  await db().delete(platformSettings).where(eq(platformSettings.key, key));
}

export interface PlatformView {
  key: PlatformKey;
  secret: boolean;
  source: "db" | "env" | "missing";
  /** plaintext for non-secrets; masked "…ab12" for secrets; "" if missing */
  display: string;
}

/** Admin UI view — never leaks secret plaintext. */
export async function platformOverview(): Promise<PlatformView[]> {
  const rows = await db().select().from(platformSettings);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: PlatformView[] = [];
  for (const key of Object.keys(PLATFORM_KEYS) as PlatformKey[]) {
    const def = PLATFORM_KEYS[key];
    const row = byKey.get(key);
    const envVal = def.env ? (env() as unknown as Record<string, string>)[def.env] : "";
    let source: "db" | "env" | "missing" = "missing";
    let display = "";
    if (row?.value) {
      source = "db";
      display = def.secret ? (row.lastFour ? `…${row.lastFour}` : "•saved•") : def.secret ? "" : safePlain(row.value, def.secret);
    } else if (envVal) {
      source = "env";
      display = def.secret ? "•from env•" : envVal;
    }
    out.push({ key, secret: def.secret, source, display });
  }
  return out;
}

function safeDecrypt(stored: string): string {
  try {
    return decryptToken(stored);
  } catch {
    return "";
  }
}
function safePlain(stored: string, secret: boolean): string {
  return secret ? "" : stored;
}
