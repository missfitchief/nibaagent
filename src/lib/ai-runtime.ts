import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { botSettings, businesses } from "./db/schema";
import { APP_DEFAULT_MODEL, APP_DEFAULT_VISION_MODEL, isProvider, pickModel, sanitizeModel, type Provider } from "./models";
import { resolveAnthropicKey, resolveOpenAiKey } from "./secrets";
import { resolvePlatform, type AiUsageMode } from "./platform";

/**
 * AI provider runtime compatibility.
 *
 * OpenAI split its token-limit parameter: the reasoning/newer families
 * (o1/o3/o4, gpt-5) reject `max_tokens` and require `max_completion_tokens`
 * (and reject a non-default `temperature`), while gpt-4o/gpt-4.1/older still
 * use `max_tokens`. We do NOT hardcode one style globally: we pick per model,
 * and adaptively retry ONCE if the provider rejects the parameter (covers
 * future/unknown model names). Errors are logged sanitized (never the API key).
 */

export type TokenParam = "max_tokens" | "max_completion_tokens";

/** OpenAI families that require `max_completion_tokens` (and default temperature). */
const OPENAI_COMPLETION_TOKEN = /^(o[13457](?![a-z])|o\d+[-.]|gpt-5)/i;

/** Which token parameter a model expects. Anthropic always uses `max_tokens`. */
export function getTokenParamForModel(provider: Provider, model: string): TokenParam {
  if (provider !== "openai") return "max_tokens";
  return OPENAI_COMPLETION_TOKEN.test(model.trim()) ? "max_completion_tokens" : "max_tokens";
}

/**
 * Reasoning-family models (o1/o3/o4, gpt-5) spend part of `max_completion_tokens`
 * on hidden reasoning before writing the visible reply — a budget sized for a
 * classic chat model (a couple hundred tokens) can be entirely consumed by
 * reasoning, leaving zero for the actual answer. The API returns 200 with an
 * empty `message.content` in that case — no error, just silence. Callers should
 * give these models a much larger ceiling.
 */
export function isReasoningModel(provider: Provider, model: string): boolean {
  return provider === "openai" && OPENAI_COMPLETION_TOKEN.test(model.trim());
}

/** Reasoning models only allow the default temperature (1) — omit it entirely. */
function modelAllowsCustomTemperature(model: string): boolean {
  return !OPENAI_COMPLETION_TOKEN.test(model.trim());
}

export interface OpenAiMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

export interface OpenAiChatResult {
  text: string;
  tokens: number;
  model: string;
  tokenParam: TokenParam;
  retried: boolean;
}

const TOKEN_PARAM_ERROR = /max_completion_tokens|unsupported parameter|not supported with this model|use 'max_completion_tokens'/i;
const TEMPERATURE_ERROR = /temperature/i;

/** Redact anything token-like from a provider error before it reaches a log/UI. */
export function sanitizeAiError(msg: string): string {
  return (msg || "unknown error")
    .replace(/sk-[A-Za-z0-9_\-]{10,}/g, "sk-***")
    .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, "Bearer ***")
    .slice(0, 300);
}

/**
 * Call OpenAI chat completions with the CORRECT token parameter for the model,
 * retrying once if the provider says the parameter is unsupported. Returns the
 * text + token usage; throws a sanitized Error on hard failure.
 */
export async function callOpenAiChat(args: {
  key: string;
  model: string;
  messages: OpenAiMessage[];
  maxTokens: number;
  temperature?: number;
}): Promise<OpenAiChatResult> {
  let tokenParam = getTokenParamForModel("openai", args.model);
  let allowTemp = modelAllowsCustomTemperature(args.model) && args.temperature != null;

  const attempt = async (): Promise<Response> => {
    const body: Record<string, unknown> = { model: args.model, messages: args.messages, [tokenParam]: args.maxTokens };
    if (allowTemp) body.temperature = args.temperature;
    return fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${args.key}` },
      body: JSON.stringify(body)
    });
  };

  let retried = false;
  let res = await attempt();
  let data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
    error?: { message?: string };
  };

  if ((!res.ok || data.error) && !retried) {
    const msg = data.error?.message ?? `openai_${res.status}`;
    let fixed = false;
    if (TOKEN_PARAM_ERROR.test(msg) && tokenParam === "max_tokens") {
      tokenParam = "max_completion_tokens";
      allowTemp = false; // these models also reject a custom temperature
      fixed = true;
    } else if (TEMPERATURE_ERROR.test(msg) && allowTemp) {
      allowTemp = false;
      fixed = true;
    }
    if (fixed) {
      retried = true;
      res = await attempt();
      data = (await res.json()) as typeof data;
    }
  }

  if (!res.ok || data.error) {
    throw new Error(sanitizeAiError(data.error?.message ?? `openai_${res.status}`));
  }
  return {
    text: data.choices?.[0]?.message?.content?.trim() ?? "",
    tokens: data.usage?.total_tokens ?? 0,
    model: args.model,
    tokenParam,
    retried
  };
}

export interface ProviderRuntimeConfig {
  provider: Provider;
  model: string;
  visionModel: string;
  key: string;
  keySource: "business_key" | "platform_key" | "none";
  mode: AiUsageMode;
  /** false → the bot must NOT call the AI (missing key under the usage mode). */
  ready: boolean;
  /** Sanitized human note (Serbian) shown when not ready — never a key. */
  reason: string;
  imageRecognitionEnabled: boolean;
}

/**
 * Resolve the full AI runtime config for a tenant: provider, text model, vision
 * model, and the resolved key (honoring the platform usage mode). This is the
 * single place the engine and the admin image test agree on provider/model/key.
 */
export async function resolveProviderRuntimeConfig(businessId: string): Promise<ProviderRuntimeConfig> {
  const d = db();
  const [biz] = await d.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const [settings] = await d.select().from(botSettings).where(eq(botSettings.businessId, businessId)).limit(1);

  const platformProvider = (await resolvePlatform("DEFAULT_AI_PROVIDER")).value;
  const provider: Provider = isProvider(settings?.aiProvider ?? "")
    ? (settings!.aiProvider as Provider)
    : isProvider(platformProvider)
      ? (platformProvider as Provider)
      : "openai";

  const platformDefaultModel = (await resolvePlatform(provider === "anthropic" ? "DEFAULT_ANTHROPIC_MODEL" : "DEFAULT_OPENAI_MODEL")).value;
  const model = pickModel({ provider, businessModel: biz?.selectedModel, platformDefault: platformDefaultModel });

  const platformVision = sanitizeModel((await resolvePlatform("DEFAULT_VISION_MODEL")).value);
  const visionModel = platformVision || (provider === "anthropic" ? "claude-3-5-sonnet-latest" : APP_DEFAULT_VISION_MODEL) || APP_DEFAULT_MODEL.openai;

  const resolved = provider === "anthropic" ? await resolveAnthropicKey(businessId) : await resolveOpenAiKey(businessId);
  const ready = Boolean(resolved.key);
  const reason = ready
    ? ""
    : resolved.mode === "business_key_required"
      ? "API ključ biznisa je obavezan, a nije unet. Bot je zaustavljen dok se ključ ne doda."
      : "Nema podešenog API ključa (ni ključa biznisa ni platformskog). Bot ne može da odgovara.";

  return {
    provider,
    model,
    visionModel,
    key: resolved.key,
    keySource: resolved.source,
    mode: resolved.mode,
    ready,
    reason,
    imageRecognitionEnabled: settings?.imageRecognitionEnabled ?? false
  };
}
