import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
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
