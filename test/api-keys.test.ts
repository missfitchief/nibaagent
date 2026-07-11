import { beforeEach, describe, expect, it } from "vitest";
import { desc } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import { eventLogs } from "../src/lib/db/schema";
import { setPlatform } from "../src/lib/platform";
import { getBusinessSecret, listMaskedSecrets, resolveAnthropicKey, resolveOpenAiKey, setBusinessSecret } from "../src/lib/secrets";
import { resolveProviderRuntimeConfig } from "../src/lib/ai-runtime";

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
});

describe("AI API key usage modes", () => {
  it("platform_key_only uses the platform key and ignores a business key", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await setPlatform("AI_USAGE_MODE", "platform_key_only");
    await setPlatform("OPENAI_API_KEY", "sk-platform-1");
    await setBusinessSecret(business.id, "openai_api_key", "sk-business-1");
    const r = await resolveOpenAiKey(business.id);
    expect(r.source).toBe("platform_key");
    expect(r.key).toBe("sk-platform-1");
  });

  it("business_key_allowed uses the business key when present", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await setPlatform("AI_USAGE_MODE", "business_key_allowed");
    await setPlatform("OPENAI_API_KEY", "sk-platform-1");
    await setBusinessSecret(business.id, "openai_api_key", "sk-business-1");
    const r = await resolveOpenAiKey(business.id);
    expect(r.source).toBe("business_key");
    expect(r.key).toBe("sk-business-1");
  });

  it("business_key_allowed falls back to the platform key when the business has none", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await setPlatform("AI_USAGE_MODE", "business_key_allowed");
    await setPlatform("OPENAI_API_KEY", "sk-platform-1");
    const r = await resolveOpenAiKey(business.id);
    expect(r.source).toBe("platform_key");
  });

  it("business_key_required blocks (no platform fallback) when the business key is missing", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await setPlatform("AI_USAGE_MODE", "business_key_required");
    await setPlatform("OPENAI_API_KEY", "sk-platform-1"); // must NOT be used
    const r = await resolveOpenAiKey(business.id);
    expect(r.source).toBe("none");
    expect(r.key).toBe("");
    const cfg = await resolveProviderRuntimeConfig(business.id);
    expect(cfg.ready).toBe(false);
    expect(cfg.reason).toMatch(/obavezan/i); // Serbian: "…je obavezan…"
  });

  it("business_key_required uses the business key when present", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await setPlatform("AI_USAGE_MODE", "business_key_required");
    await setBusinessSecret(business.id, "openai_api_key", "sk-business-1");
    const r = await resolveOpenAiKey(business.id);
    expect(r.source).toBe("business_key");
    expect(r.key).toBe("sk-business-1");
  });

  it("supports a per-business Anthropic key", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await setPlatform("AI_USAGE_MODE", "business_key_allowed");
    await setBusinessSecret(business.id, "anthropic_api_key", "sk-ant-biz");
    const r = await resolveAnthropicKey(business.id);
    expect(r.source).toBe("business_key");
    expect(r.key).toBe("sk-ant-biz");
  });

  it("stores keys encrypted and only ever exposes a masked preview", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await setBusinessSecret(business.id, "openai_api_key", "sk-secret-value-9999");
    const masked = await listMaskedSecrets(business.id);
    const openai = masked.find((m) => m.kind === "openai_api_key")!;
    expect(openai.hasValue).toBe(true);
    expect(openai.preview).toBe("…9999");
    expect(JSON.stringify(masked)).not.toContain("sk-secret-value-9999");
    // Round-trips server-side only.
    expect(await getBusinessSecret(business.id, "openai_api_key")).toBe("sk-secret-value-9999");
  });

  it("never writes the API key into event logs — only the source", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await setPlatform("AI_USAGE_MODE", "business_key_allowed");
    await setBusinessSecret(business.id, "openai_api_key", "sk-should-not-log-1234");
    await resolveOpenAiKey(business.id);
    const rows = await db.select().from(eventLogs).orderBy(desc(eventLogs.createdAt));
    expect(JSON.stringify(rows)).not.toContain("sk-should-not-log-1234");
    expect(rows.some((r) => r.message.includes("business_key"))).toBe(true);
  });
});
