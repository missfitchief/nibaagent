import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { businesses } from "./db/schema";
import { resolvePlatform } from "./platform";

/**
 * Real spend from OpenAI's Costs API (org-level Admin key required — see
 * PLATFORM_KEYS.OPENAI_ADMIN_API_KEY), filtered to one business's own API
 * key id. This is ground truth, unlike lib/plans.ts's estimateCostUsd(),
 * which is our own token-based guess and can drift from a provider's real
 * bill (wrong per-model price, model routing changes, etc. — see the
 * gpt-5.5 vision-cost incident this was built to cross-check against).
 *
 * https://api.openai.com/v1/organization/costs — requires an Admin key,
 * buckets results by day, supports filtering by api_key_ids.
 */

export interface OpenAiCostResult {
  usd: number;
  ok: boolean;
  error?: string;
}

interface CostsApiResponse {
  data?: Array<{ results?: Array<{ amount?: { value?: number } }> }>;
  has_more?: boolean;
  next_page?: string | null;
  error?: { message?: string };
}

export type CostsFetch = (params: { adminKey: string; apiKeyId: string; startTime: Date; endTime: Date; page?: string }) => Promise<CostsApiResponse>;

const defaultCostsFetch: CostsFetch = async ({ adminKey, apiKeyId, startTime, endTime, page }) => {
  const url = new URL("https://api.openai.com/v1/organization/costs");
  url.searchParams.set("start_time", String(Math.floor(startTime.getTime() / 1000)));
  url.searchParams.set("end_time", String(Math.floor(endTime.getTime() / 1000)));
  url.searchParams.set("limit", "180");
  url.searchParams.append("api_key_ids[]", apiKeyId);
  if (page) url.searchParams.set("page", page);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${adminKey}` } });
  const body = (await res.json()) as CostsApiResponse;
  if (!res.ok) return { error: { message: body.error?.message ?? `openai_costs_${res.status}` } };
  return body;
};

/**
 * Sums real USD spend for one business's OpenAI API key over [startTime, endTime).
 * Paginates until has_more is false. Fails soft — callers should treat
 * `ok: false` as "not available right now" and keep showing the estimate,
 * never block the page on this.
 */
export async function fetchRealOpenAiCost(
  apiKeyId: string,
  startTime: Date,
  endTime: Date,
  costsFetch: CostsFetch = defaultCostsFetch
): Promise<OpenAiCostResult> {
  const adminKey = (await resolvePlatform("OPENAI_ADMIN_API_KEY")).value;
  if (!adminKey) return { usd: 0, ok: false, error: "OPENAI_ADMIN_API_KEY not configured" };
  if (!apiKeyId) return { usd: 0, ok: false, error: "no api key id set for this business" };

  let total = 0;
  let page: string | undefined;
  try {
    for (let i = 0; i < 20; i++) {
      const body = await costsFetch({ adminKey, apiKeyId, startTime, endTime, page });
      if (body.error) return { usd: 0, ok: false, error: body.error.message };
      for (const bucket of body.data ?? []) {
        for (const r of bucket.results ?? []) total += r.amount?.value ?? 0;
      }
      if (!body.has_more || !body.next_page) break;
      page = body.next_page;
    }
    return { usd: Math.round(total * 1_000_000) / 1_000_000, ok: true };
  } catch (err) {
    return { usd: 0, ok: false, error: (err as Error).message };
  }
}

export interface RealCostWindows {
  daily: OpenAiCostResult;
  weekly: OpenAiCostResult;
  monthly: OpenAiCostResult;
}

interface RealCostCache {
  fetchedAt: string;
  windows: RealCostWindows;
}

/** How long a cached real-cost pull stays fresh before the next page load re-hits OpenAI. */
export const REAL_COST_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Cached real-cost windows for one business — avoids re-hitting OpenAI's
 * Costs API (30 req/min org-wide rate limit) on every Overview page load,
 * which needs 3 calls (today/7d/30d) and hits the limit fast if the admin
 * refreshes a few times in a row. Returns null when the business has no
 * OpenAI API key id set (nothing to fetch). The DB write only happens on a
 * cache miss, so a "warm" page load is a single read, no external call.
 */
export async function getRealCostWindows(
  business: { id: string; openaiApiKeyId: string; realCostCache: unknown },
  now: Date = new Date(),
  ttlMs = REAL_COST_CACHE_TTL_MS,
  costsFetch: CostsFetch = defaultCostsFetch
): Promise<RealCostWindows | null> {
  if (!business.openaiApiKeyId) return null;
  const cache = business.realCostCache as RealCostCache | null | undefined;
  if (cache?.fetchedAt) {
    const age = now.getTime() - new Date(cache.fetchedAt).getTime();
    if (age >= 0 && age < ttlMs) return cache.windows;
  }
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [daily, weekly, monthly] = await Promise.all([
    fetchRealOpenAiCost(business.openaiApiKeyId, dayAgo, now, costsFetch),
    fetchRealOpenAiCost(business.openaiApiKeyId, weekAgo, now, costsFetch),
    fetchRealOpenAiCost(business.openaiApiKeyId, monthAgo, now, costsFetch)
  ]);
  const windows: RealCostWindows = { daily, weekly, monthly };
  await db()
    .update(businesses)
    .set({ realCostCache: { fetchedAt: now.toISOString(), windows } as unknown as Record<string, unknown> })
    .where(eq(businesses.id, business.id));
  return windows;
}
