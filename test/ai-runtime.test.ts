import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callOpenAiChat, getTokenParamForModel, sanitizeAiError } from "../src/lib/ai-runtime";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import { setBusinessSecret } from "../src/lib/secrets";
import { products } from "../src/lib/db/schema";
import { runEngine } from "../src/lib/engine";

interface MockResp {
  ok: boolean;
  status?: number;
  body: unknown;
}

/** Install a fetch mock that returns queued responses and records request bodies. */
function mockFetch(responses: MockResp[]) {
  const bodies: Record<string, unknown>[] = [];
  let i = 0;
  const fn = vi.fn(async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 400), json: async () => r.body } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return { bodies, fn };
}

afterEach(() => vi.unstubAllGlobals());

describe("getTokenParamForModel", () => {
  it("uses max_tokens for gpt-4o / gpt-4.1 / older", () => {
    expect(getTokenParamForModel("openai", "gpt-4o")).toBe("max_tokens");
    expect(getTokenParamForModel("openai", "gpt-4o-mini")).toBe("max_tokens");
    expect(getTokenParamForModel("openai", "gpt-4.1")).toBe("max_tokens");
    expect(getTokenParamForModel("openai", "gpt-3.5-turbo")).toBe("max_tokens");
  });

  it("uses max_completion_tokens for reasoning/newer families (o-series, gpt-5)", () => {
    expect(getTokenParamForModel("openai", "o1-mini")).toBe("max_completion_tokens");
    expect(getTokenParamForModel("openai", "o3")).toBe("max_completion_tokens");
    expect(getTokenParamForModel("openai", "o4-mini")).toBe("max_completion_tokens");
    expect(getTokenParamForModel("openai", "gpt-5")).toBe("max_completion_tokens");
    expect(getTokenParamForModel("openai", "gpt-5-mini")).toBe("max_completion_tokens");
  });

  it("always uses max_tokens for anthropic", () => {
    expect(getTokenParamForModel("anthropic", "claude-3-5-sonnet-latest")).toBe("max_tokens");
    expect(getTokenParamForModel("anthropic", "claude-sonnet-4-6")).toBe("max_tokens");
  });

  it("defaults an unknown/future model to max_tokens (safe, retry covers surprises)", () => {
    expect(getTokenParamForModel("openai", "gpt-6-omega-2027")).toBe("max_tokens");
    expect(getTokenParamForModel("openai", "totally-made-up")).toBe("max_tokens");
  });
});

describe("callOpenAiChat parameter selection", () => {
  it("sends max_tokens (with temperature) for a gpt-4o model", async () => {
    const { bodies } = mockFetch([{ ok: true, body: { choices: [{ message: { content: "hi" } }], usage: { total_tokens: 10 } } }]);
    const r = await callOpenAiChat({ key: "sk-x", model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], maxTokens: 50, temperature: 0.4 });
    expect(bodies[0].max_tokens).toBe(50);
    expect(bodies[0].max_completion_tokens).toBeUndefined();
    expect(bodies[0].temperature).toBe(0.4);
    expect(r.tokenParam).toBe("max_tokens");
    expect(r.retried).toBe(false);
    expect(r.text).toBe("hi");
  });

  it("sends max_completion_tokens and omits temperature for a reasoning model", async () => {
    const { bodies } = mockFetch([{ ok: true, body: { choices: [{ message: { content: "ok" } }], usage: { total_tokens: 5 } } }]);
    const r = await callOpenAiChat({ key: "sk-x", model: "o3-mini", messages: [{ role: "user", content: "hi" }], maxTokens: 50, temperature: 0.4 });
    expect(bodies[0].max_completion_tokens).toBe(50);
    expect(bodies[0].max_tokens).toBeUndefined();
    expect(bodies[0].temperature).toBeUndefined();
    expect(r.tokenParam).toBe("max_completion_tokens");
  });

  it("retries ONCE with max_completion_tokens when the provider rejects max_tokens", async () => {
    const { bodies } = mockFetch([
      { ok: false, status: 400, body: { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } } },
      { ok: true, body: { choices: [{ message: { content: "recovered" } }], usage: { total_tokens: 7 } } }
    ]);
    const r = await callOpenAiChat({ key: "sk-x", model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], maxTokens: 50, temperature: 0.4 });
    expect(bodies).toHaveLength(2);
    expect(bodies[0].max_tokens).toBe(50); // first attempt
    expect(bodies[1].max_completion_tokens).toBe(50); // retry swapped param
    expect(bodies[1].temperature).toBeUndefined(); // and dropped temperature
    expect(r.retried).toBe(true);
    expect(r.tokenParam).toBe("max_completion_tokens");
    expect(r.text).toBe("recovered");
  });

  it("does not spam retries — a persistent error throws a sanitized message once", async () => {
    const { bodies } = mockFetch([
      { ok: false, status: 400, body: { error: { message: "Use 'max_completion_tokens' instead. token sk-abcdefghijklmnop leaked" } } },
      { ok: false, status: 400, body: { error: { message: "still failing" } } }
    ]);
    await expect(
      callOpenAiChat({ key: "sk-secret", model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], maxTokens: 50 })
    ).rejects.toThrow(/still failing/);
    expect(bodies).toHaveLength(2); // exactly one retry, no more
  });
});

describe("sanitizeAiError", () => {
  it("redacts sk- keys and Bearer tokens", () => {
    expect(sanitizeAiError("bad key sk-abcdefghij1234567890")).not.toContain("sk-abcdefghij1234567890");
    expect(sanitizeAiError("Authorization: Bearer sk-xyz1234567890abcd")).not.toContain("sk-xyz1234567890abcd");
    expect(sanitizeAiError("")).toBe("unknown error");
  });
});

describe("bot test run survives the max_tokens/max_completion_tokens error", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await makeDb();
  });

  it("recovers via retry and returns an AI reply instead of failing", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await setBusinessSecret(business.id, "openai_api_key", "sk-test-key");
    await db.insert(products).values({ businessId: business.id, title: "Crvena haljina", description: "pamučna", stockStatus: "available" });
    mockFetch([
      { ok: false, status: 400, body: { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } } },
      { ok: true, body: { choices: [{ message: { content: "Imamo crvenu haljinu na stanju." } }], usage: { total_tokens: 42 } } }
    ]);
    const r = await runEngine(business.id, "crvena haljina");
    expect(r.intent).toBe("ai");
    expect(r.reply).toContain("crvenu haljinu");
    expect(r.aiCalled).toBe(true);
  });
});
