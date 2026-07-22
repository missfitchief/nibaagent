import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import { businesses } from "../src/lib/db/schema";
import { setPlatform } from "../src/lib/platform";
import { fetchRealOpenAiCost, getRealCostWindows, type CostsFetch } from "../src/lib/openai-costs";

/**
 * Real-spend cross-check against OpenAI's Costs API. The fetch itself is
 * injected — these tests never touch the network, only prove: the Admin key
 * is read from platform settings, results across pages get summed, and
 * every failure mode fails soft (never throws, always returns ok:false with
 * a reason instead of blocking the page it's rendered on).
 */
let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
});

describe("fetchRealOpenAiCost", () => {
  it("fails soft with no admin key configured — never throws", async () => {
    const r = await fetchRealOpenAiCost("key_abc", new Date(0), new Date());
    expect(r.ok).toBe(false);
    expect(r.usd).toBe(0);
    expect(r.error).toContain("OPENAI_ADMIN_API_KEY");
  });

  it("fails soft with no business api key id set", async () => {
    await setPlatform("OPENAI_ADMIN_API_KEY", "sk-admin-1");
    const r = await fetchRealOpenAiCost("", new Date(0), new Date());
    expect(r.ok).toBe(false);
    expect(r.usd).toBe(0);
  });

  it("sums results across a single page and passes the admin key + api key id through", async () => {
    await setPlatform("OPENAI_ADMIN_API_KEY", "sk-admin-1");
    const calls: Array<{ adminKey: string; apiKeyId: string }> = [];
    const fetchStub: CostsFetch = async ({ adminKey, apiKeyId }) => {
      calls.push({ adminKey, apiKeyId });
      return {
        data: [
          { results: [{ amount: { value: 0.03 } }] },
          { results: [{ amount: { value: 0.015 } }, { amount: { value: 0.005 } }] }
        ],
        has_more: false
      };
    };
    const r = await fetchRealOpenAiCost("key_starlight", new Date(0), new Date(), fetchStub);
    expect(r.ok).toBe(true);
    expect(r.usd).toBeCloseTo(0.05);
    expect(calls).toEqual([{ adminKey: "sk-admin-1", apiKeyId: "key_starlight" }]);
  });

  it("paginates until has_more is false", async () => {
    await setPlatform("OPENAI_ADMIN_API_KEY", "sk-admin-1");
    let call = 0;
    const fetchStub: CostsFetch = async ({ page }) => {
      call += 1;
      if (call === 1) {
        expect(page).toBeUndefined();
        return { data: [{ results: [{ amount: { value: 1 } }] }], has_more: true, next_page: "cursor-2" };
      }
      expect(page).toBe("cursor-2");
      return { data: [{ results: [{ amount: { value: 2 } }] }], has_more: false };
    };
    const r = await fetchRealOpenAiCost("key_x", new Date(0), new Date(), fetchStub);
    expect(r.ok).toBe(true);
    expect(r.usd).toBeCloseTo(3);
    expect(call).toBe(2);
  });

  it("fails soft on an API error instead of throwing", async () => {
    await setPlatform("OPENAI_ADMIN_API_KEY", "sk-admin-1");
    const fetchStub: CostsFetch = async () => ({ error: { message: "invalid_api_key" } });
    const r = await fetchRealOpenAiCost("key_x", new Date(0), new Date(), fetchStub);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid_api_key");
  });

  it("fails soft when the fetch itself throws (network error)", async () => {
    await setPlatform("OPENAI_ADMIN_API_KEY", "sk-admin-1");
    const fetchStub: CostsFetch = async () => {
      throw new Error("fetch failed");
    };
    const r = await fetchRealOpenAiCost("key_x", new Date(0), new Date(), fetchStub);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("fetch failed");
  });
});

describe("getRealCostWindows (cached)", () => {
  it("returns null when the business has no API key id set — no fetch attempted", async () => {
    const { business } = await seedBusiness(db, "NoKeyIdCo");
    const calls: number[] = [];
    const fetchStub: CostsFetch = async () => {
      calls.push(1);
      return { data: [], has_more: false };
    };
    const r = await getRealCostWindows({ id: business.id, openaiApiKeyId: "", realCostCache: null }, new Date(), 5 * 60 * 1000, fetchStub);
    expect(r).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("fetches on a cold cache, writes the cache, then reuses it on the next call within the TTL — never re-fetching", async () => {
    await setPlatform("OPENAI_ADMIN_API_KEY", "sk-admin-1");
    const { business } = await seedBusiness(db, "CacheCo");
    let calls = 0;
    const fetchStub: CostsFetch = async () => {
      calls += 1;
      return { data: [{ results: [{ amount: { value: 1.23 } }] }], has_more: false };
    };
    const now = new Date();

    const r1 = await getRealCostWindows({ id: business.id, openaiApiKeyId: "key_cache", realCostCache: null }, now, 5 * 60 * 1000, fetchStub);
    expect(r1?.daily.usd).toBeCloseTo(1.23);
    expect(calls).toBe(3); // one fetch per window (daily/weekly/monthly)

    const [row] = await db.select().from(businesses).where(eq(businesses.id, business.id));
    expect(row.realCostCache).toBeTruthy();

    // A "warm" call one minute later, well inside the 5-minute TTL — reuses
    // the cache from the DB, makes zero additional OpenAI calls.
    const warm = await getRealCostWindows(
      { id: business.id, openaiApiKeyId: "key_cache", realCostCache: row.realCostCache },
      new Date(now.getTime() + 60_000),
      5 * 60 * 1000,
      fetchStub
    );
    expect(warm?.daily.usd).toBeCloseTo(1.23);
    expect(calls).toBe(3); // unchanged — no new fetch happened
  });

  it("re-fetches once the cache is older than the TTL", async () => {
    await setPlatform("OPENAI_ADMIN_API_KEY", "sk-admin-1");
    const { business } = await seedBusiness(db, "StaleCacheCo");
    let calls = 0;
    const fetchStub: CostsFetch = async () => {
      calls += 1;
      return { data: [{ results: [{ amount: { value: 5 } }] }], has_more: false };
    };
    const now = new Date();
    const r1 = await getRealCostWindows({ id: business.id, openaiApiKeyId: "key_stale", realCostCache: null }, now, 60_000, fetchStub);
    expect(calls).toBe(3);

    const [row] = await db.select().from(businesses).where(eq(businesses.id, business.id));
    const r2 = await getRealCostWindows(
      { id: business.id, openaiApiKeyId: "key_stale", realCostCache: row.realCostCache },
      new Date(now.getTime() + 120_000), // 2 minutes later, past the 60s TTL
      60_000,
      fetchStub
    );
    expect(calls).toBe(6); // re-fetched
    expect(r1?.daily.usd).toBe(r2?.daily.usd);
  });
});
