import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import { eventLogs, products } from "../src/lib/db/schema";
import { listBusinessLogs } from "../src/lib/logs";
import { setPlatform } from "../src/lib/platform";
import { setBusinessSecret } from "../src/lib/secrets";
import { runEngine } from "../src/lib/engine";

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
});
afterEach(() => vi.unstubAllGlobals());

describe("per-business logs", () => {
  it("are business-scoped — one tenant never sees another's logs", async () => {
    const a = await seedBusiness(db, "Alpha");
    const b = await seedBusiness(db, "Beta");
    await db.insert(eventLogs).values({ businessId: a.business.id, level: "info", area: "ai_reply", message: "A-log" });
    await db.insert(eventLogs).values({ businessId: b.business.id, level: "info", area: "ai_reply", message: "B-log" });
    const aLogs = await listBusinessLogs(a.business.id, "all");
    expect(aLogs).toHaveLength(1);
    expect(aLogs[0].message).toBe("A-log");
  });

  it("filters by source and by errors-only", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await db.insert(eventLogs).values([
      { businessId: business.id, level: "info", area: "ai_reply", message: "ai" },
      { businessId: business.id, level: "error", area: "meta_oauth", message: "meta boom" },
      { businessId: business.id, level: "info", area: "product_import", message: "import" }
    ]);
    expect((await listBusinessLogs(business.id, "ai")).every((l) => l.area === "ai_reply")).toBe(true);
    expect((await listBusinessLogs(business.id, "meta")).map((l) => l.message)).toEqual(["meta boom"]);
    const errors = await listBusinessLogs(business.id, "errors");
    expect(errors).toHaveLength(1);
    expect(errors[0].level).toBe("error");
  });

  it("records a sanitized error log when an AI call fails (no key leaked)", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await setPlatform("AI_USAGE_MODE", "business_key_allowed");
    await setBusinessSecret(business.id, "openai_api_key", "sk-must-not-appear-1234");
    await db.insert(products).values({ businessId: business.id, title: "Crvena haljina", stockStatus: "available" });
    // Persistent provider failure (both attempts) → engine logs an error and rethrows.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Use 'max_completion_tokens' instead." } }) }) as unknown as Response)
    );
    await expect(runEngine(business.id, "crvena haljina")).rejects.toBeTruthy();
    const errors = await listBusinessLogs(business.id, "errors");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].area).toBe("ai_reply");
    expect(JSON.stringify(errors)).not.toContain("sk-must-not-appear-1234");
  });
});
