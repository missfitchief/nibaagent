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

  it("order flow: two overlapping completions for the same thread never save the order twice", async () => {
    // Regression for a real prod bug: a customer's final order message got
    // processed twice (Meta redelivery / overlapping debounce windows) and
    // the SAME order was saved as two separate rows.
    const sender = { channel: "facebook" as const, senderId: "fb-user-race" };

    const r1 = await runEngine(biz1, "Želim da naručim", { conversation: sender });
    const convoId = r1.conversationId!;
    await runEngine(biz1, "Ime i prezime: Ana Anić, grad Mostar", { conversation: sender });
    await runEngine(biz1, "Ulica Kralja Tomislava 5, poštanski 88000", { conversation: sender });

    // The final missing field (phone) arrives "twice at once" — two concurrent
    // invocations racing to complete and save the same order.
    const finalMessage = "061 999 888";
    const [ra, rb] = await Promise.all([
      runEngine(biz1, finalMessage, { conversation: sender }),
      runEngine(biz1, finalMessage, { conversation: sender })
    ]);
    expect(ra.intent).toBe("order");
    expect(rb.intent).toBe("order");

    const orderRows = await db.select().from(schema.orders).where(eq(schema.orders.conversationId, convoId));
    expect(orderRows.length).toBe(1);
    expect(orderRows[0].customerName).toBe("Ana Anić");
    expect(orderRows[0].phone).toBe("061 999 888");
  });

  it("order flow: a farewell word mid-collection is not mistaken for the city", async () => {
    // Regression for a real prod bug: a customer said "Živeli" (a casual
    // sign-off) while an order was still missing fields. The bare-value
    // extractor matched it against the "single capitalized word = city"
    // heuristic, which flipped the message into "order-relevant" and made
    // the bot fire the canned "još mi treba ulica, ime i broj" reply over a
    // farewell instead of just letting the conversation close naturally.
    const sender = { channel: "facebook" as const, senderId: "fb-user-farewell" };
    await runEngine(biz1, "Zelim da naručim", { conversation: sender });
    const r2 = await runEngine(biz1, "Marko Marković", { conversation: sender });
    const convoId = r2.conversationId!;

    const r3 = await runEngine(biz1, "Živeli", { conversation: sender });
    expect(r3.intent).not.toBe("order");

    const [convo] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, convoId));
    expect(parseConversationState(convo.conversationState).order?.city).toBeFalsy();
  });

  it("order flow: street and town given together on one line are both captured", async () => {
    // Regression for a real prod bug: a customer typed her whole address as
    // one natural line ("Kozarska 36 bugojno" — street, number, town, no
    // labels, no comma). The bare-street heuristic only matched a street with
    // NOTHING after the house number, so the town was silently dropped and
    // never merged into the order — the bot kept asking as if the address
    // line had never been sent.
    const sender = { channel: "facebook" as const, senderId: "fb-user-address" };
    await runEngine(biz1, "Zelim da naručim", { conversation: sender });
    const r2 = await runEngine(biz1, "Danijela Kuna", { conversation: sender });
    const convoId = r2.conversationId!;

    await runEngine(biz1, "Kozarska 36 bugojno", { conversation: sender });

    const [convo] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, convoId));
    const order = parseConversationState(convo.conversationState).order;
    expect(order?.streetAndNumber).toBe("Kozarska 36");
    expect(order?.city).toBe("bugojno");
  });

  it("order flow: a space-separated postal code with the town is captured, and a phone number never false-matches as one", async () => {
    // Regression for a real prod bug: BiH postal codes are commonly typed
    // with a space ("88 000 Mostar"). The strict postal regex only matched 5
    // CONSECUTIVE digits, so the space broke it — postal code (and the town
    // riding along with it) were silently dropped from a long combined
    // address message the customer had already sent.
    const sender = { channel: "facebook" as const, senderId: "fb-user-postal" };
    await runEngine(biz1, "Zelim da naručim", { conversation: sender });
    const r2 = await runEngine(biz1, "Dario Ljevak", { conversation: sender });
    const convoId = r2.conversationId!;

    await runEngine(
      biz1,
      "Šanticeva ili Mile Budaka 118 ...ista je ul samo jos nije vracena. 88 000 Mostar",
      { conversation: sender }
    );

    const [convo] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, convoId));
    const order = parseConversationState(convo.conversationState).order;
    expect(order?.postalCode).toBe("88000");
    expect(order?.city).toBe("Mostar");

    // A phone number immediately followed by a farewell must NEVER be misread
    // as a "postal code + town" — e.g. "063 533 396 Hvala" must not produce a
    // bogus postal code out of digits that happen to sit inside the phone run.
    const sender2 = { channel: "facebook" as const, senderId: "fb-user-postal-2" };
    await runEngine(biz1, "Zelim da naručim", { conversation: sender2 });
    const rb = await runEngine(biz1, "063 533 396 Hvala", { conversation: sender2 });
    const convoId2 = rb.conversationId!;
    const [convo2] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, convoId2));
    const order2 = parseConversationState(convo2.conversationState).order;
    expect(order2?.postalCode).toBeFalsy();
    expect(order2?.phone).toBe("063 533 396");
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

  it("hybrid: a meta question mid-order goes to the AI, which sees the thread + ORDER IN PROGRESS steer", async () => {
    await db.insert(schema.knowledgeSources).values({
      businessId: biz1,
      type: "products",
      title: "Lampa",
      content: "Lampa košta 49 KM. Dostava je 10 KM za celu BiH.",
      status: "active"
    });

    const sender = { channel: "facebook" as const, senderId: "fb-meta-q" };
    const calls: SeamCall[] = [];
    const seam = async (input: { system: string; messages: SeamCall["messages"] }) => {
      calls.push({ system: input.system, messages: input.messages });
      return { text: "Pričamo o lampi od 49 KM koju želite da naručite. Treba mi još samo vaše ime i prezime.", tokens: 20 };
    };

    // 1) explicit order intent → rules answer with the collection prompt
    const r1 = await runEngine(biz1, "Želim da naručim lampu", { conversation: sender });
    expect(r1.intent).toBe("order");
    expect(r1.reply).toContain("ime i prezime");

    // 2) a meta question ("what are we talking about?") must NOT be hijacked by
    //    the order state machine — the AI answers from the full thread instead.
    const r2 = await runEngine(biz1, "A o čemu mi to pričamo?", { conversation: sender, chatCompletion: seam });
    expect(r2.intent).toBe("ai");
    expect(r2.reply).toContain("lampi");
    expect(r2.reply).not.toContain("Za porudžbinu");
    expect(calls.length).toBe(1);
    expect(calls[0].system).toContain("ORDER IN PROGRESS");
    expect(calls[0].system).toContain("ime i prezime"); // still-missing list is steered
    expect(calls[0].messages.some((m) => m.content.includes("lampu"))).toBe(true);

    // 3) the order is still active afterwards — a bare value resumes collection
    const r3 = await runEngine(biz1, "Petar Petrović", { conversation: sender, chatCompletion: seam });
    expect(r3.intent).toBe("order");
    expect(r3.reply).toContain("ulicu i broj");
    expect(r3.reply).not.toContain("ime i prezime");
  });

  it("the AI is told not to falsely agree it already has data the customer claims to have sent", async () => {
    // Regression for a real prod bug: a customer insisted "imate gore moje
    // podatke" (you already have my info above) when the bot in fact had NO
    // order data on file at all — the model just kept agreeing ("da, imamo
    // vaše podatke... proslijediću timu") to be polite, three turns in a row,
    // without ever citing anything concrete. No order was ever actually
    // collected. The system prompt must tell the model to push back honestly
    // instead of caving to social pressure.
    const sender = { channel: "facebook" as const, senderId: "fb-truth-check" };
    const calls: SeamCall[] = [];
    const seam = async (input: { system: string; messages: SeamCall["messages"] }) => {
      calls.push({ system: input.system, messages: input.messages });
      return { text: "Nemam Vaše podatke zabeležene — možete li mi ih ponovo poslati?", tokens: 15 };
    };
    await db.insert(schema.knowledgeSources).values({
      businessId: biz1,
      type: "faq",
      title: "Dostava",
      content: "Dostava traje 2-3 radna dana.",
      status: "active"
    });
    await runEngine(biz1, "Moze?", { conversation: sender, chatCompletion: seam });
    const r = await runEngine(biz1, "Imate gore moje podatke", { conversation: sender, chatCompletion: seam });
    expect(r.intent).toBe("ai");
    const lastCall = calls[calls.length - 1];
    expect(lastCall.system).toContain("NEVER agree that you already have information you don't");
    expect(lastCall.system).not.toContain("already provided — do NOT ask again"); // the knownOrderNote block itself is absent — nothing is actually known here
  });

  it("loose extraction: bare values mid-order (no labels) fill name/city+postal/street", async () => {
    const sender = { channel: "facebook" as const, senderId: "fb-loose" };

    const r1 = await runEngine(biz1, "Želim da naručim", { conversation: sender });
    expect(r1.intent).toBe("order");
    expect(r1.reply).toContain("ime i prezime");

    // bare name — no label
    const r2 = await runEngine(biz1, "Marko Marković", { conversation: sender });
    expect(r2.intent).toBe("order");
    expect(r2.reply).toContain("ulicu i broj");
    expect(r2.reply).not.toContain("ime i prezime");

    // bare city + postal — no label; the 5-digit code must NOT become a street
    const r3 = await runEngine(biz1, "Sarajevo 71000", { conversation: sender });
    expect(r3.intent).toBe("order");
    expect(r3.reply).toContain("ulicu i broj");
    expect(r3.reply).toContain("broj telefona");
    expect(r3.reply).not.toContain("grad,");

    // bare street — no label
    const r4 = await runEngine(biz1, "Ferhadija 12", { conversation: sender });
    expect(r4.intent).toBe("order");
    expect(r4.reply).toContain("broj telefona");
    expect(r4.reply).not.toContain("ulicu");

    // phone completes the order
    const r5 = await runEngine(biz1, "061 999 888", { conversation: sender });
    expect(r5.intent).toBe("order");
    expect(r5.reply).toContain("Marko Marković");
    expect(r5.reply).toContain("Sarajevo");
    expect(r5.reply).toContain("Ferhadija 12");

    const orderRows = await db.select().from(schema.orders).where(and(eq(schema.orders.businessId, biz1), eq(schema.orders.conversationId, r1.conversationId!)));
    expect(orderRows.length).toBe(1);
    expect(orderRows[0].customerName).toBe("Marko Marković");
    expect(orderRows[0].city).toBe("Sarajevo");
    expect(orderRows[0].postalCode).toBe("71000");
    expect(orderRows[0].streetAndNumber).toBe("Ferhadija 12");
    expect(orderRows[0].phone).toBe("061 999 888");
  });
});
