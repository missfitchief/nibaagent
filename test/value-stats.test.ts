import { beforeEach, describe, expect, it } from "vitest";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { AGENT_MONTHLY_COST_EUR, estimateSavings, MINUTES_SAVED_PER_AI_REPLY } from "../src/lib/plans";
import { monthlyValueStats } from "../src/lib/usage";

/**
 * "Vrednost ovog meseca" value card: savings math assumes a €700/month worker
 * (22 days × 8h) and ~2 minutes saved per AI-handled reply. Counts are live:
 * this calendar month's outbound bot replies + collected orders.
 */

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
});

describe("estimateSavings (€700/month worker)", () => {
  it("uses the €700 monthly cost assumption", () => {
    expect(AGENT_MONTHLY_COST_EUR).toBe(700);
  });

  it("computes minutes and euros from the minute cost", () => {
    const s = estimateSavings(1000);
    expect(s.savedMinutes).toBe(2000); // 1000 × 2 min
    // minute cost = 700 / (22×8×60) = 700/10560; 2000 min × that ≈ €132.58
    const expected = Math.round(2000 * (700 / 10560) * 100) / 100;
    expect(s.savedEur).toBe(expected);
    expect(s.savedEur).toBe(132.58);
  });

  it("zero replies → zero savings", () => {
    expect(estimateSavings(0)).toEqual({ savedMinutes: 0, savedEur: 0 });
  });

  it("minute-rate constant is unchanged", () => {
    expect(MINUTES_SAVED_PER_AI_REPLY).toBe(2);
  });
});

describe("monthlyValueStats (live counts)", () => {
  it("counts this month's outbound replies + orders, ignores inbound and older rows", async () => {
    const { business } = await seedBusiness(db, "ValueCo");
    const [convo] = await db.insert(schema.conversations).values({ businessId: business.id, channel: "facebook", senderId: "v1" }).returning();

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

    // This month: 2 outbound + 1 inbound (inbound must NOT count as a bot reply).
    await db.insert(schema.messages).values({ businessId: business.id, conversationId: convo.id, channel: "facebook", direction: "outbound", text: "r1", intent: "ai" });
    await db.insert(schema.messages).values({ businessId: business.id, conversationId: convo.id, channel: "facebook", direction: "outbound", text: "r2", intent: "faq" });
    await db.insert(schema.messages).values({ businessId: business.id, conversationId: convo.id, channel: "facebook", direction: "inbound", text: "q1" });
    // Last month: 1 outbound (must NOT count).
    await db
      .insert(schema.messages)
      .values({ businessId: business.id, conversationId: convo.id, channel: "facebook", direction: "outbound", text: "old", createdAt: lastMonth });

    // Orders: 1 this month, 1 last month.
    await db.insert(schema.orders).values({ businessId: business.id, conversationId: convo.id, customerName: "Marko" });
    await db.insert(schema.orders).values({ businessId: business.id, conversationId: convo.id, customerName: "Stari", createdAt: lastMonth });

    const stats = await monthlyValueStats(business.id, now);
    expect(stats.replies).toBe(2);
    expect(stats.orders).toBe(1);
    const s = estimateSavings(2);
    expect(stats.savedMinutes).toBe(s.savedMinutes);
    expect(stats.savedEur).toBe(s.savedEur);
  });

  it("another business's activity never leaks into the counts", async () => {
    const a = await seedBusiness(db, "A");
    const b = await seedBusiness(db, "B");
    const [convo] = await db.insert(schema.conversations).values({ businessId: a.business.id, channel: "facebook", senderId: "v2" }).returning();
    await db.insert(schema.messages).values({ businessId: a.business.id, conversationId: convo.id, channel: "facebook", direction: "outbound", text: "r" });
    await db.insert(schema.orders).values({ businessId: a.business.id, conversationId: convo.id, customerName: "X" });

    const statsB = await monthlyValueStats(b.business.id);
    expect(statsB.replies).toBe(0);
    expect(statsB.orders).toBe(0);
    expect(statsB.savedEur).toBe(0);
  });
});
