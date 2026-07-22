import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "./db/client";
import { messages, orders, type Plan } from "./db/schema";
import { estimateSavings, planDef } from "./plans";

/**
 * Plan message-limit accounting. Outbound bot messages (any intent) are counted
 * per business for today and the current calendar month — no new tables, the
 * messages log is the source of truth.
 *
 * Effective limits: a positive per-business override wins; 0 means "no business
 * override" → the plan default (monthly) / uncapped (daily — plans define no
 * daily cap).
 */
export interface MessageUsage {
  usedToday: number;
  usedMonth: number;
  dailyLimit: number;
  monthlyLimit: number;
}

export async function messageUsage(
  businessId: string,
  plan: Plan,
  dailyOverride: number,
  monthlyOverride: number,
  now: Date = new Date()
): Promise<MessageUsage> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const d = db();
  const [t] = await d
    .select({ n: count() })
    .from(messages)
    .where(and(eq(messages.businessId, businessId), eq(messages.direction, "outbound"), gte(messages.createdAt, startOfDay)));
  const [m] = await d
    .select({ n: count() })
    .from(messages)
    .where(and(eq(messages.businessId, businessId), eq(messages.direction, "outbound"), gte(messages.createdAt, startOfMonth)));
  return {
    usedToday: t?.n ?? 0,
    usedMonth: m?.n ?? 0,
    dailyLimit: dailyOverride > 0 ? dailyOverride : Number.POSITIVE_INFINITY,
    monthlyLimit: monthlyOverride > 0 ? monthlyOverride : planDef(plan).messagesPerMonth
  };
}

export interface MonthlyValueStats {
  replies: number;
  orders: number;
  savedMinutes: number;
  savedEur: number;
}

/**
 * "Vrednost ovog meseca" — computed LIVE (no rollup table): this calendar
 * month's outbound bot replies + collected orders, with the savings estimate
 * (€700/month worker, ~2 min saved per AI reply — see plans.ts). Two cheap
 * COUNT queries; always labeled "procena" in the UI.
 */
export async function monthlyValueStats(businessId: string, now: Date = new Date()): Promise<MonthlyValueStats> {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const d = db();
  const [r] = await d
    .select({ n: count() })
    .from(messages)
    .where(and(eq(messages.businessId, businessId), eq(messages.direction, "outbound"), gte(messages.createdAt, startOfMonth)));
  const [o] = await d
    .select({ n: count() })
    .from(orders)
    .where(and(eq(orders.businessId, businessId), gte(orders.createdAt, startOfMonth)));
  const replies = r?.n ?? 0;
  const s = estimateSavings(replies);
  return { replies, orders: o?.n ?? 0, savedMinutes: s.savedMinutes, savedEur: s.savedEur };
}

export interface AiCostWindows {
  daily: number;
  weekly: number;
  monthly: number;
}

/**
 * AI cost (USD) for one business, over three rolling windows — admin-only
 * ("Est. AI cost" is never exposed client-side, see /admin). Strictly scoped
 * by businessId, same as every other query in this file: two businesses'
 * spend never mixes, even if their messages were sent in the same second.
 */
export async function aiCostWindows(
  businessId: string,
  now: Date = new Date(),
  costTrackingSince?: Date | null
): Promise<AiCostWindows> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d = db();
  // A reset point never makes a window LONGER — it only clamps the start
  // forward (e.g. "today" stays "today" even if the reset was last month).
  const clamp = (since: Date) => (costTrackingSince && costTrackingSince > since ? costTrackingSince : since);
  const sumSince = async (since: Date) => {
    const [row] = await d
      .select({ c: sql<string>`coalesce(sum(${messages.costEstimate}), 0)` })
      .from(messages)
      .where(and(eq(messages.businessId, businessId), gte(messages.createdAt, clamp(since))));
    return Number(row?.c ?? 0);
  };
  const [daily, weekly, monthly] = await Promise.all([sumSince(dayAgo), sumSince(weekAgo), sumSince(monthAgo)]);
  return { daily, weekly, monthly };
}
