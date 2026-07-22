import "server-only";
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
