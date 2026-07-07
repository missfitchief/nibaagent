import type { Plan } from "./db/schema";

/**
 * Pricing (manual/contact-us billing for now; Stripe/Paddle can plug into the
 * subscriptions table later). Limits drive real enforcement: daily/monthly
 * message caps are checked before any AI call.
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
 * estimate. Assumption: a human support agent costs €600/month working ~22
 * days × 8h; each AI-handled reply saves ~2 minutes of agent time.
 */
export const AGENT_MONTHLY_COST_EUR = 600;
export const MINUTES_SAVED_PER_AI_REPLY = 2;

export function estimateSavings(aiReplies: number): { savedMinutes: number; savedEur: number } {
  const minuteCost = AGENT_MONTHLY_COST_EUR / (22 * 8 * 60);
  const savedMinutes = aiReplies * MINUTES_SAVED_PER_AI_REPLY;
  return { savedMinutes, savedEur: Math.round(savedMinutes * minuteCost * 100) / 100 };
}

/** Rough model cost table (EUR per 1K tokens, blended in/out) for estimates. */
export const MODEL_COST_PER_1K: Record<string, number> = {
  "gpt-4o-mini": 0.0006,
  "gpt-4o": 0.0075,
  "gpt-4.1-mini": 0.0012
};
