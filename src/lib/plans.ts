import type { Plan } from "./db/schema";

/**
 * Pricing (manual/contact-us billing for now; Stripe/Paddle can plug into the
 * subscriptions table later). Limits drive real enforcement: the monthly message
 * cap (messagesPerMonth), together with per-business daily/monthly overrides,
 * is checked in the engine before any AI call (see lib/usage.ts).
 */
export interface PlanDef {
  id: Plan;
  name: string;
  priceEur: number | null; // null = contact us
  messagesPerMonth: number;
  aiRepliesPerMonth: number;
  channels: number;
  knowledgeSources: number;
  handoff: boolean;
  sheetOrders: boolean;
  notifications: boolean;
  analytics: "basic" | "advanced";
  support: string;
  highlight?: boolean;
}

export const PLAN_DEFS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    priceEur: 0,
    messagesPerMonth: 100,
    aiRepliesPerMonth: 50,
    channels: 1,
    knowledgeSources: 3,
    handoff: true,
    sheetOrders: false,
    notifications: false,
    analytics: "basic",
    support: "Community"
  },
  {
    id: "basic",
    name: "Basic",
    priceEur: 59,
    messagesPerMonth: 1000,
    aiRepliesPerMonth: 600,
    channels: 2,
    knowledgeSources: 10,
    handoff: true,
    sheetOrders: true,
    notifications: false,
    analytics: "basic",
    support: "Email"
  },
  {
    id: "standard",
    name: "Standard",
    priceEur: 169,
    messagesPerMonth: 4000,
    aiRepliesPerMonth: 2500,
    channels: 2,
    knowledgeSources: 25,
    handoff: true,
    sheetOrders: true,
    notifications: true,
    analytics: "basic",
    support: "Priority email",
    highlight: true
  },
  {
    id: "pro",
    name: "Pro",
    priceEur: 269,
    messagesPerMonth: 10000,
    aiRepliesPerMonth: 6500,
    channels: 4,
    knowledgeSources: 60,
    handoff: true,
    sheetOrders: true,
    notifications: true,
    analytics: "advanced",
    support: "Priority"
  },
  {
    id: "business",
    name: "Business",
    priceEur: 549,
    messagesPerMonth: 30000,
    aiRepliesPerMonth: 20000,
    channels: 10,
    knowledgeSources: 200,
    handoff: true,
    sheetOrders: true,
    notifications: true,
    analytics: "advanced",
    support: "Dedicated"
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceEur: null,
    messagesPerMonth: Infinity,
    aiRepliesPerMonth: Infinity,
    channels: Infinity,
    knowledgeSources: Infinity,
    handoff: true,
    sheetOrders: true,
    notifications: true,
    analytics: "advanced",
    support: "Dedicated + SLA"
  }
];

export function planDef(plan: Plan): PlanDef {
  return PLAN_DEFS.find((p) => p.id === plan) ?? PLAN_DEFS[0];
}

/**
 * "Estimated money saved" — deliberately conservative and clearly labeled an
 * estimate. Assumption: a human support agent costs €700/month working ~22
 * days × 8h; each AI-handled reply saves ~2 minutes of agent time.
 */
export const AGENT_MONTHLY_COST_EUR = 700;
export const MINUTES_SAVED_PER_AI_REPLY = 2;

export function estimateSavings(aiReplies: number): { savedMinutes: number; savedEur: number } {
  const minuteCost = AGENT_MONTHLY_COST_EUR / (22 * 8 * 60);
  const savedMinutes = aiReplies * MINUTES_SAVED_PER_AI_REPLY;
  return { savedMinutes, savedEur: Math.round(savedMinutes * minuteCost * 100) / 100 };
}

/**
 * Real per-model provider pricing (USD per 1M tokens, input/output split —
 * output is billed at a much higher rate than input on every provider, so a
 * single blended number is never accurate). Source: provider pricing pages,
 * checked 2026-07. Update this table when a provider changes prices.
 */
interface ModelRate {
  in: number;
  out: number;
}

const MODEL_RATES_USD_PER_1M: Record<string, ModelRate> = {
  // OpenAI — gpt-4o / gpt-4.1 family
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4.1": { in: 2, out: 8 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4.1-nano": { in: 0.1, out: 0.4 },
  "gpt-3.5-turbo": { in: 0.5, out: 1.5 },
  // OpenAI — reasoning / gpt-5 family (max_completion_tokens models)
  "gpt-5.4-nano": { in: 0.2, out: 1.25 },
  "gpt-5.4-mini": { in: 0.75, out: 4.5 },
  "gpt-5.4": { in: 2.5, out: 15 },
  "gpt-5.5": { in: 5, out: 30 },
  "gpt-5.6-luna": { in: 1, out: 6 },
  "gpt-5.6-terra": { in: 2.5, out: 15 },
  "gpt-5.6-sol": { in: 5, out: 30 },
  // Anthropic
  "claude-3-5-sonnet-latest": { in: 3, out: 15 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-fable-5": { in: 10, out: 50 }
};

/** Unknown/typed-in custom model → a mid-range guess so cost never silently reads near-zero. */
const FALLBACK_RATE: ModelRate = { in: 1, out: 3 };

function rateFor(model: string): ModelRate {
  return MODEL_RATES_USD_PER_1M[model] ?? FALLBACK_RATE;
}

/**
 * Cost in USD — the currency every provider (OpenAI, Anthropic) actually
 * bills in. Deliberately NOT converted to EUR: an FX layer only adds
 * approximation on top of an already-estimated number, and admins comparing
 * this against their real OpenAI/Anthropic invoice want it to match exactly.
 * Precise version from actual prompt/completion token counts (preferred —
 * call sites that have the split from the provider's `usage` object should
 * always use this).
 */
export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const rate = rateFor(model);
  const usd = (promptTokens / 1_000_000) * rate.in + (completionTokens / 1_000_000) * rate.out;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Fallback for call sites that only have a total token count (no in/out split) — averages the model's own in/out rate instead of a flat guess. */
export function estimateCostUsdBlended(model: string, totalTokens: number): number {
  const rate = rateFor(model);
  const blendedPer1M = (rate.in + rate.out) / 2;
  const usd = (totalTokens / 1_000_000) * blendedPer1M;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
