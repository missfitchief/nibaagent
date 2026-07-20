import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { runEngine, type OwnerNotification } from "../src/lib/engine";
import { messageUsage } from "../src/lib/usage";
import { resetEnvCache } from "../src/lib/env";

/**
 * Plan message limits: outbound bot messages are counted per business per
 * day / calendar month. When a business is over its effective limit (positive
 * per-business override, else the plan default), the engine skips the AI call
 * and returns a polite Serbian fallback — rules-only replies keep working.
 */

// Platform-fallback key so the AI branch is reachable; the seam intercepts it.
process.env.OPENAI_API_KEY = "sk-test-key";

let db: TestDb;
beforeEach(async () => {
  resetEnvCache();
  db = await makeDb();
});

async function setup(opts: { plan?: string; daily?: number; monthly?: number }) {
  const s = await seedBusiness(db, "LimitCo");
  await db
    .update(schema.businesses)
    .set({
      aiMode: "live",
      defaultLanguage: "sr",
      plan: (opts.plan ?? "standard") as "standard",
      dailyMessageLimit: opts.daily ?? 0,
      monthlyMessageLimit: opts.monthly ?? 0
    })
    .where(eq(schema.businesses.id, s.business.id));
  // Grounding so the message WOULD reach the AI when under the limit.
  await db.insert(schema.knowledgeSources).values({
    businessId: s.business.id,
    type: "delivery",
    title: "Dostava",
    content: "Dostava je 10 KM za celu BiH.",
    status: "active"
  });
  return s;
}

/** Seed N outbound bot messages (today) for the business. */
async function seedOutbound(businessId: string, n: number) {
  const [convo] = await db.insert(schema.conversations).values({ businessId, channel: "facebook", senderId: "limit-sender" }).returning();
  for (let i = 0; i < n; i++) {
    await db.insert(schema.messages).values({ businessId, conversationId: convo.id, channel: "facebook", direction: "outbound", text: `reply ${i}`, intent: "ai" });
  }
  return convo;
}

describe("plan message limits", () => {
  it("messageUsage counts outbound messages and applies override/plan limits", async () => {
    const { business } = await setup({ daily: 5, monthly: 50 });
    await seedOutbound(business.id, 3);
    const u = await messageUsage(business.id, business.plan, 5, 50);
    expect(u.usedToday).toBe(3);
    expect(u.usedMonth).toBe(3);
    expect(u.dailyLimit).toBe(5);
    expect(u.monthlyLimit).toBe(50);
    // Zero overrides fall back to plan defaults (standard = 4000/month, no daily cap).
    const u2 = await messageUsage(business.id, "standard", 0, 0);
    expect(u2.monthlyLimit).toBe(4000);
    expect(u2.dailyLimit).toBe(Number.POSITIVE_INFINITY);
  });

  it("at the limit: AI seam is NOT called, Serbian fallback returned, owner notified once", async () => {
    const { business } = await setup({ monthly: 2 });
    await seedOutbound(business.id, 2); // usedMonth == limit → THIS reply would be limit+1

    let aiCalls = 0;
    const chatCompletion = async () => {
      aiCalls += 1;
      return { text: "Dostava je 10 KM.", tokens: 10 };
    };
    const sent: OwnerNotification[] = [];
    const notify = async (n: OwnerNotification) => {
      sent.push(n);
    };

    const r = await runEngine(business.id, "Koliko je dostava?", { chatCompletion, notify });
    expect(aiCalls).toBe(0); // AI never called
    expect(r.intent).toBe("limit");
    expect(r.aiCalled).toBe(false);
    expect(r.reply).toContain("Hvala na poruci!");
    expect(r.shouldSend).toBe(true); // business is live — the fallback is sendable

    await vi.waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0].kind).toBe("event");
    expect(sent[0].text).toContain("limit");

    // The limit breach is logged for triage.
    const logs = await db.select().from(schema.eventLogs).where(eq(schema.eventLogs.businessId, business.id));
    expect(logs.some((l) => l.level === "warn" && l.message.includes("Limit poruka dostignut"))).toBe(true);
  });

  it("past the crossing point the owner is NOT spammed again", async () => {
    const { business } = await setup({ monthly: 2 });
    await seedOutbound(business.id, 5); // already past limit (5 > 2, not == 2)
    const sent: OwnerNotification[] = [];
    const r = await runEngine(business.id, "Koliko je dostava?", { notify: async (n) => void sent.push(n) });
    expect(r.intent).toBe("limit");
    await new Promise((r2) => setTimeout(r2, 20)); // give fire-and-forget a chance (should be nothing)
    expect(sent).toHaveLength(0);
  });

  it("under the limit: normal AI flow", async () => {
    const { business } = await setup({ monthly: 10 });
    await seedOutbound(business.id, 2);
    let aiCalls = 0;
    const r = await runEngine(business.id, "Koliko je dostava?", {
      chatCompletion: async () => {
        aiCalls += 1;
        return { text: "Dostava je 10 KM za celu BiH.", tokens: 10 };
      }
    });
    expect(aiCalls).toBe(1);
    expect(r.intent).toBe("ai");
    expect(r.aiCalled).toBe(true);
  });

  it("plan default applies when the business override is 0 (free plan = 100/month)", async () => {
    const { business } = await setup({ plan: "free", monthly: 0 });
    await seedOutbound(business.id, 100);
    let aiCalls = 0;
    const r = await runEngine(business.id, "Koliko je dostava?", {
      chatCompletion: async () => {
        aiCalls += 1;
        return { text: "x", tokens: 1 };
      }
    });
    expect(aiCalls).toBe(0);
    expect(r.intent).toBe("limit");
  });

  it("daily cap gates independently of the monthly cap", async () => {
    const { business } = await setup({ daily: 1, monthly: 1000 });
    await seedOutbound(business.id, 1);
    const r = await runEngine(business.id, "Koliko je dostava?", {
      chatCompletion: async () => ({ text: "x", tokens: 1 })
    });
    expect(r.intent).toBe("limit");
  });

  it("rules-only replies (order collection) still work over the limit", async () => {
    const { business } = await setup({ monthly: 1 });
    await seedOutbound(business.id, 3); // over limit
    const sender = { channel: "facebook" as const, senderId: "limit-order-sender" };
    const r = await runEngine(business.id, "Ćao! Želim da naručim", { conversation: sender });
    expect(r.intent).toBe("order"); // order flow is rules — NOT gated
    expect(r.reply).toContain("ime i prezime");
  });
});
