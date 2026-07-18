import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { runEngine } from "../src/lib/engine";
import { resetEnvCache } from "../src/lib/env";
import {
  extractOrderFields,
  findOrCreateConversation,
  loadConversationHistory,
  mergeOrderData,
  missingOrderFields,
  parseConversationState
} from "../src/lib/conversation-memory";

/**
 * End-to-end conversation-memory tests. Same-user threads must keep context,
 * the bot must not re-ask known order fields, the AI must receive the recent
 * history, and memory must never leak across senders or businesses.
 * The AI call is intercepted by the chatCompletion seam — zero network.
 */

// Platform-fallback key so the AI branch is reachable; the seam intercepts the call.
process.env.OPENAI_API_KEY = "sk-test-key";

type SeamCall = {
  system: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
};

describe("conversation memory", () => {
  let db: TestDb;
  let biz1: string;
  let biz2: string;

  beforeAll(async () => {
    resetEnvCache();
    db = await makeDb();
    const s1 = await seedBusiness(db, "MemoCo");
    biz1 = s1.business.id;
    await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr" }).where(eq(schema.businesses.id, biz1));
    const s2 = await seedBusiness(db, "OtherCo");
    biz2 = s2.business.id;
    await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr" }).where(eq(schema.businesses.id, biz2));
  });

  it("order flow: 5 related messages — collects fields progressively, never re-asks, saves the order", async () => {
    const sender = { channel: "facebook" as const, senderId: "fb-user-order" };

    // 1) order intent → full collection prompt
    const r1 = await runEngine(biz1, "Ćao! Želim da naručim", { conversation: sender });
    expect(r1.intent).toBe("order");
    expect(r1.conversationId).toBeTruthy();
    expect(r1.reply).toContain("ime i prezime");
    expect(r1.reply).toContain("telefon");
    const convoId = r1.conversationId!;

    // 2) name + city → asks only for street / postal code / phone
    const r2 = await runEngine(biz1, "Ime i prezime: Marko Marković, grad Sarajevo", { conversation: sender });
    expect(r2.conversationId).toBe(convoId);
    expect(r2.intent).toBe("order");
    expect(r2.reply).toContain("ulicu i broj");
    expect(r2.reply).toContain("poštanski broj");
    expect(r2.reply).toContain("broj telefona");
    expect(r2.reply).not.toContain("ime i prezime");
    expect(r2.reply).not.toContain("grad,");

    // 3) street + postal → asks only for phone
    const r3 = await runEngine(biz1, "Ulica Ferhadija 12, poštanski 71000", { conversation: sender });
    expect(r3.intent).toBe("order");
    expect(r3.reply).toContain("broj telefona");
    expect(r3.reply).not.toContain("ulicu");
    expect(r3.reply).not.toContain("poštanski");

    // 4) phone only → complete: confirmation summary + order row persisted
    const r4 = await runEngine(biz1, "061 123 456", { conversation: sender });
    expect(r4.intent).toBe("order");
    expect(r4.reply).toContain("Marko Marković");
    expect(r4.reply).toContain("Ferhadija 12");
    expect(r4.reply).toContain("71000");
    expect(r4.reply).toContain("Sarajevo");
    expect(r4.reply).toContain("061 123 456");

    const orderRows = await db.select().from(schema.orders).where(and(eq(schema.orders.businessId, biz1), eq(schema.orders.conversationId, convoId)));
    expect(orderRows.length).toBe(1);
    expect(orderRows[0].customerName).toBe("Marko Marković");
    expect(orderRows[0].streetAndNumber).toBe("Ferhadija 12");
    expect(orderRows[0].city).toBe("Sarajevo");
    expect(orderRows[0].postalCode).toBe("71000");
    expect(orderRows[0].phone).toBe("061 123 456");

    // state is marked completed
    const [convo] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, convoId));
    expect(parseConversationState(convo.conversationState).order?.completed).toBe(true);

    // 5) a casual thanks must NOT restart the order flow nor duplicate the order
    const r5 = await runEngine(biz1, "Hvala!", { conversation: sender });
    expect(r5.intent).not.toBe("order");
    const stillOne = await db.select().from(schema.orders).where(eq(schema.orders.conversationId, convoId));
    expect(stillOne.length).toBe(1);

    // full thread persisted: 5 inbound + 5 outbound
    const thread = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, convoId));
    expect(thread.filter((m) => m.direction === "inbound").length).toBe(5);
    expect(thread.filter((m) => m.direction === "outbound").length).toBe(5);
  });

  it("AI reply: the model receives recent history — follow-up questions stay coherent", async () => {
    await db.insert(schema.knowledgeSources).values({
      businessId: biz1,
      type: "delivery",
      title: "Dostava",
      content: "Dostava je 10 KM za celu BiH. Isporuka je 2-3 radna dana.",
      status: "active"
    });

    const calls: SeamCall[] = [];
    const seam = async (input: { system: string; messages: SeamCall["messages"] }) => {
      calls.push({ system: input.system, messages: input.messages });
      return { text: calls.length === 1 ? "Dostava je 10 KM za celu BiH." : "Isporuka je 2-3 radna dana.", tokens: 12 };
    };
    const sender = { channel: "facebook" as const, senderId: "fb-user-ai" };

    const t1 = await runEngine(biz1, "Koliko je dostava?", { conversation: sender, chatCompletion: seam });
    expect(t1.intent).toBe("ai");
    expect(t1.aiCalled).toBe(true);
    expect(t1.reply).toContain("10 KM");

    const t2 = await runEngine(biz1, "A kad stiže?", { conversation: sender, chatCompletion: seam });
    expect(t2.intent).toBe("ai");
    expect(t2.reply).toContain("2-3 radna dana");

    // The second call carried the whole thread: t1 question, t1 answer, t2 question.
    expect(calls.length).toBe(2);
    const msgs = calls[1].messages;
    expect(msgs.length).toBe(3);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toContain("Koliko je dostava");
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[1].content).toContain("10 KM");
    expect(msgs[2].role).toBe("user");
    expect(msgs[2].content).toContain("kad stiže");
    // …and the system prompt says this is one ongoing conversation.
    expect(calls[1].system).toContain("ongoing conversation");
  });

  it("isolation: another sender gets a separate thread; another business sees nothing", async () => {
    const a = { channel: "facebook" as const, senderId: "iso-a" };
    const b = { channel: "facebook" as const, senderId: "iso-b" };
    // Deterministic AI stub — these calls reach the AI branch (knowledge exists).
    const seam = async () => ({ text: "Zabeleženo.", tokens: 5 });

    const rA = await runEngine(biz1, "Moja tajna poruka A", { conversation: a, chatCompletion: seam });
    const convoA = rA.conversationId!;
    const convoB = await findOrCreateConversation(biz1, b);
    expect(convoB.id).not.toBe(convoA);

    // Thread A has the secret; thread B is empty.
    const histA = await loadConversationHistory(biz1, convoA);
    expect(histA.some((m) => m.text.includes("tajna"))).toBe(true);
    const histB = await loadConversationHistory(biz1, convoB.id);
    expect(histB.length).toBe(0);

    // Same sender id on ANOTHER business = a different, empty thread.
    const rC = await runEngine(biz2, "Poruka za drugi biznis", { conversation: a, chatCompletion: seam });
    expect(rC.conversationId).not.toBe(convoA);
    const histC = await loadConversationHistory(biz2, rC.conversationId!);
    expect(histC.length).toBe(2); // inbound + bot reply
    expect(histC[0].text).toContain("drugi biznis");
    expect(histC.some((m) => m.text.includes("tajna"))).toBe(false);
    // Cross-tenant read of thread A returns nothing.
    const crossRead = await loadConversationHistory(biz2, convoA);
    expect(crossRead.length).toBe(0);

    // Same sender on instagram = yet another thread (channel is part of the key).
    const ig = await findOrCreateConversation(biz1, { channel: "instagram", senderId: "iso-a" });
    expect(ig.id).not.toBe(convoA);
  });

  it("handoff: bot goes silent during human takeover and resumes after resolution", async () => {
    const sender = { channel: "facebook" as const, senderId: "fb-user-handoff" };
    const seam = async () => ({ text: "Tu sam, kako mogu da pomognem?", tokens: 5 });
    const r1 = await runEngine(biz1, "hoću da pričam sa agent", { conversation: sender, chatCompletion: seam });
    expect(r1.intent).toBe("handoff");
    expect(r1.handoffTriggered).toBe(true);
    expect(r1.reply.length).toBeGreaterThan(0);

    // While takeover is active the bot records but does not reply.
    const r2 = await runEngine(biz1, "halo, jesi tu?", { conversation: sender, chatCompletion: seam });
    expect(r2.intent).toBe("handoff");
    expect(r2.reply).toBe("");

    // Operator resolves → bot speaks again.
    await db
      .update(schema.conversations)
      .set({ humanTakeoverUntil: null, status: "ai" })
      .where(and(eq(schema.conversations.id, r1.conversationId!), eq(schema.conversations.businessId, biz1)));
    const r3 = await runEngine(biz1, "halo?", { conversation: sender, chatCompletion: seam });
    expect(r3.reply.length).toBeGreaterThan(0);
  });

  it("extractOrderFields: pulls name/phone/postal/street/city/note from free text", () => {
    const f = extractOrderFields("Ime i prezime: Marko Marković, grad Sarajevo. Ulica Ferhadija 12, 71000. Telefon 061 123 456. Napomena: poklon za mamu");
    expect(f.customerName).toBe("Marko Marković");
    expect(f.city).toBe("Sarajevo");
    expect(f.streetAndNumber).toBe("Ferhadija 12");
    expect(f.postalCode).toBe("71000");
    expect(f.phone).toBe("061 123 456");
    expect(f.note).toContain("poklon za mamu");
  });

  it("mergeOrderData: latest non-empty value wins; missingOrderFields tracks the gaps", () => {
    const merged = mergeOrderData({ customerName: "Staro Ime", phone: "061111111" }, { customerName: "Novo Ime" }, { city: "Tuzla" });
    expect(merged.customerName).toBe("Novo Ime");
    expect(merged.phone).toBe("061111111");
    expect(merged.city).toBe("Tuzla");
    const missing = missingOrderFields(merged);
    expect(missing).toContain("streetAndNumber");
    expect(missing).toContain("postalCode");
    expect(missing).not.toContain("customerName");
    expect(missing).not.toContain("phone");
  });
});
