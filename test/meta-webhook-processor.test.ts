import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { resetEnvCache } from "../src/lib/env";
import { encryptToken } from "../src/lib/crypto";
import { parseMetaWebhookEvents, processMetaWebhook, WEBHOOK_DEBOUNCE_MS } from "../src/lib/meta-webhook-processor";
import { deleteBusinessSecret, setBusinessSecret } from "../src/lib/secrets";
import type { Channel } from "../src/lib/conversation-memory";

/**
 * End-to-end Meta webhook processor tests (PGlite, zero network):
 *  - parsing (Messenger + Instagram, echo/delivery/read guards)
 *  - dedupe on Meta retries
 *  - tenant isolation per business
 *  - burst debounce → ONE coherent reply, not many
 *  - full order flow through the webhook, with Google Sheets sync
 *  - AI failure → the bot still answers (fallback apology)
 *  - handoff → 24h silence for the human agent
 */

process.env.OPENAI_API_KEY = "sk-test-key";

type SendCall = { channel: Channel; token: string; igBusinessAccountId: string; recipientId: string; text: string };

function messengerPayload(pageId: string, senderId: string, mid: string, text: string, ts = 1000) {
  return {
    object: "page",
    entry: [{ id: pageId, time: ts, messaging: [{ sender: { id: senderId }, recipient: { id: pageId }, timestamp: ts, message: { mid, text } }] }]
  };
}

function instagramPayload(igId: string, senderId: string, mid: string, text: string, ts = 1000) {
  return {
    object: "instagram",
    entry: [{ id: igId, time: ts, messaging: [{ sender: { id: senderId }, timestamp: ts, message: { mid, text } }] }]
  };
}

function messengerImagePayload(pageId: string, senderId: string, mid: string, imageUrl: string, ts = 1000) {
  return {
    object: "page",
    entry: [
      {
        id: pageId,
        time: ts,
        messaging: [{ sender: { id: senderId }, recipient: { id: pageId }, timestamp: ts, message: { mid, attachments: [{ type: "image", payload: { url: imageUrl } }] } }]
      }
    ]
  };
}

describe("meta webhook processor", () => {
  let db: TestDb;
  let biz1: string;
  let biz2: string;
  const PAGE1 = "page-111";
  const PAGE2 = "page-222";
  const IG1 = "ig-111";

  beforeAll(async () => {
    resetEnvCache();
    db = await makeDb();
    const s1 = await seedBusiness(db, "ShopOne");
    biz1 = s1.business.id;
    await db
      .update(schema.businesses)
      .set({ aiMode: "live", defaultLanguage: "sr", clientId: "shopone" })
      .where(eq(schema.businesses.id, biz1));
    const s2 = await seedBusiness(db, "ShopTwo");
    biz2 = s2.business.id;
    await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr", clientId: "shoptwo" }).where(eq(schema.businesses.id, biz2));

    // Tenant 1: Messenger page + IG account. Tenant 2: a different page.
    await db.insert(schema.metaConnections).values({
      businessId: biz1,
      clientId: "shopone",
      pageId: PAGE1,
      pageName: "ShopOne",
      encryptedPageAccessToken: encryptToken("page-token-1"),
      instagramBusinessAccountId: IG1,
      encryptedInstagramAccessToken: encryptToken("ig-token-1"),
      status: "active"
    });
    await db.insert(schema.metaConnections).values({
      businessId: biz2,
      clientId: "shoptwo",
      pageId: PAGE2,
      pageName: "ShopTwo",
      encryptedPageAccessToken: encryptToken("page-token-2"),
      status: "active"
    });

    // Same FAQ per tenant, different answers (isolation must be visible).
    await db.insert(schema.knowledgeSources).values([
      { businessId: biz1, type: "faq", title: "Koliko je dostava?", content: "Dostava je 10 KM za celu BiH.", status: "active" },
      { businessId: biz2, type: "faq", title: "Koliko je dostava?", content: "Dostava je 99 KM (drugačiji shop).", status: "active" }
    ]);
    // Order collection on for tenant 1.
    await db.update(schema.botSettings).set({ orderCollectionEnabled: true }).where(eq(schema.botSettings.businessId, biz1));
  });

  describe("parser", () => {
    it("parses messenger messages, skips echo/delivery/read, keeps images", () => {
      const body = {
        object: "page",
        entry: [
          {
            id: "p1",
            messaging: [
              { sender: { id: "u1" }, timestamp: 1, message: { mid: "m1", text: "zdravo" } },
              { sender: { id: "p1" }, timestamp: 2, message: { mid: "m2", text: "echo", is_echo: true } },
              { sender: { id: "u1" }, timestamp: 3, delivery: { mids: ["m1"] } },
              { sender: { id: "u1" }, timestamp: 4, read: { watermark: 3 } },
              { sender: { id: "u1" }, timestamp: 5, message: { mid: "m3", attachments: [{ type: "image", payload: { url: "https://cdn/pic.jpg" } }] } }
            ]
          }
        ]
      };
      const events = parseMetaWebhookEvents(body);
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ channel: "facebook", pageId: "p1", senderId: "u1", messageId: "m1", text: "zdravo" });
      expect(events[1]).toMatchObject({ messageId: "m3", imageUrl: "https://cdn/pic.jpg", text: "" });
    });

    it("marks instagram payloads as instagram channel", () => {
      const events = parseMetaWebhookEvents(instagramPayload("ig-9", "u9", "mid-9", "cao"));
      expect(events[0]).toMatchObject({ channel: "instagram", pageId: "ig-9", senderId: "u9" });
    });
  });

  describe("pipeline", () => {
    let sent: SendCall[];
    const sendSpy = (args: SendCall) => {
      sent.push(args);
      return Promise.resolve();
    };
    const fastDeps = { sleep: () => Promise.resolve(), sendText: sendSpy, debounceMs: 0 };

    beforeEach(() => {
      sent = [];
    });

    it("FAQ via webhook: per-tenant answers, strict isolation", async () => {
      const r1 = await processMetaWebhook(messengerPayload(PAGE1, "cust-1", "w-1", "Koliko je dostava?"), fastDeps);
      expect(r1.replied).toBe(1);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ channel: "facebook", token: "page-token-1", recipientId: "cust-1", text: "Dostava je 10 KM za celu BiH." });

      const r2 = await processMetaWebhook(messengerPayload(PAGE2, "cust-1", "w-2", "Koliko je dostava?"), fastDeps);
      expect(r2.replied).toBe(1);
      expect(sent[1].text).toBe("Dostava je 99 KM (drugačiji shop).");
      expect(sent[1].token).toBe("page-token-2");

      const convos1 = await db.select().from(schema.conversations).where(eq(schema.conversations.businessId, biz1));
      const convos2 = await db.select().from(schema.conversations).where(eq(schema.conversations.businessId, biz2));
      expect(convos1).toHaveLength(1);
      expect(convos2).toHaveLength(1);
      expect(convos1[0].id).not.toBe(convos2[0].id);
    });

    it("dedupe: same Meta retry is processed exactly once", async () => {
      const payload = messengerPayload(PAGE1, "cust-2", "dup-1", "Koliko je dostava?");
      const first = await processMetaWebhook(payload, fastDeps);
      const second = await processMetaWebhook(payload, fastDeps);
      expect(first.replied).toBe(1);
      expect(second.received).toBe(1);
      expect(second.replied).toBe(0);
      expect(sent).toHaveLength(1);

      const rows = await db.select().from(schema.messages).where(eq(schema.messages.senderId, "cust-2"));
      expect(rows.filter((r) => r.direction === "inbound")).toHaveLength(1);
    });

    it("burst debounce: 5 rapid messages → ONE reply, all 5 in history", async () => {
      const sender = "cust-burst";
      const texts = ["Ćao", "zanima me nešto", "molim te reci", "znači baš me zanima", "Koliko je dostava?"];
      const payloads = texts.map((t, i) => messengerPayload(PAGE1, sender, `burst-${i}`, t, 1000 + i));

      // Concurrent invocations: starts staggered by 10ms, debounce window 100ms.
      const deps = {
        sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 120))),
        sendText: sendSpy,
        debounceMs: 100
      };
      const runs = payloads.map((p, i) => new Promise<void>((res) => setTimeout(() => void processMetaWebhook(p, deps).then(() => res()), i * 10)));
      await Promise.all(runs);

      // Only the LAST message's run replies.
      expect(sent).toHaveLength(1);
      expect(sent[0].text).toContain("Dostava je 10 KM");

      const convo = (await db.select().from(schema.conversations).where(eq(schema.conversations.businessId, biz1))).find(
        (c) => c.senderId === sender
      );
      expect(convo).toBeTruthy();
      const rows = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, convo!.id));
      expect(rows.filter((r) => r.direction === "inbound")).toHaveLength(5);
      expect(rows.filter((r) => r.direction === "outbound")).toHaveLength(1);
    });

    it("instagram: routed via IG account, sends with IG token + account id", async () => {
      const r = await processMetaWebhook(instagramPayload(IG1, "ig-cust-1", "ig-mid-1", "Koliko je dostava?"), fastDeps);
      expect(r.replied).toBe(1);
      expect(sent[0]).toMatchObject({ channel: "instagram", token: "ig-token-1", igBusinessAccountId: IG1, recipientId: "ig-cust-1" });
      const convo = (await db.select().from(schema.conversations).where(eq(schema.conversations.businessId, biz1))).find(
        (c) => c.senderId === "ig-cust-1"
      );
      expect(convo?.channel).toBe("instagram");
    });

    it("unknown page: no reply, no crash", async () => {
      const r = await processMetaWebhook(messengerPayload("page-unknown", "x", "u-1", "hello"), fastDeps);
      expect(r.replied).toBe(0);
      expect(sent).toHaveLength(0);
    });

    it("order flow end-to-end: asks only missing fields, saves order, syncs sheet", async () => {
      const sender = "cust-order";
      await db.update(schema.businesses).set({ googleSheetUrl: "https://script.google.com/fake" }).where(eq(schema.businesses.id, biz1));

      const sheetCalls: string[] = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
        sheetCalls.push(String(init?.body ?? ""));
        return new Response("ok", { status: 200 });
      }) as typeof fetch;
      try {
        // 1) order intent → the full collection prompt
        let r = await processMetaWebhook(messengerPayload(PAGE1, sender, "ord-1", "Želim da naručim majicu"), fastDeps);
        expect(r.replied).toBe(1);
        expect(sent[0].text).toMatch(/ime i prezime/i);

        // 2) name → asks street/city/postal/phone, NOT the name again
        sent = [];
        r = await processMetaWebhook(messengerPayload(PAGE1, sender, "ord-2", "Ime i prezime: Marko Marković"), fastDeps);
        expect(sent[0].text).toMatch(/još mi treba/i);
        expect(sent[0].text).toMatch(/ulicu i broj/i);
        expect(sent[0].text).not.toMatch(/ime i prezime/i);

        // 3) city + postal → asks street + phone, NOT city again
        sent = [];
        r = await processMetaWebhook(messengerPayload(PAGE1, sender, "ord-3", "Grad: Sarajevo, poštanski broj 71000"), fastDeps);
        expect(sent[0].text).toMatch(/ulicu i broj/i);
        expect(sent[0].text).toMatch(/broj telefona/i);
        expect(sent[0].text).not.toMatch(/grad,/i);

        // 4) street → asks ONLY phone
        sent = [];
        r = await processMetaWebhook(messengerPayload(PAGE1, sender, "ord-4", "Ulica: Hrvatske kraljice 12"), fastDeps);
        expect(sent[0].text).toMatch(/broj telefona/i);
        expect(sent[0].text).not.toMatch(/ulicu/i);

        // 5) phone → confirms with a summary (no questions)
        sent = [];
        r = await processMetaWebhook(messengerPayload(PAGE1, sender, "ord-5", "Telefon: 061 555 333"), fastDeps);
        expect(sent[0].text).toMatch(/Hvala, Marko Marković/);
        expect(sent[0].text).toMatch(/zabeležena/i);

        const orderRows = await db.select().from(schema.orders).where(eq(schema.orders.businessId, biz1));
        expect(orderRows).toHaveLength(1);
        expect(orderRows[0]).toMatchObject({ customerName: "Marko Marković", city: "Sarajevo", postalCode: "71000", streetAndNumber: "Hrvatske kraljice 12" });
        expect(orderRows[0].googleSheetSynced).toBe(true);
        expect(sheetCalls).toHaveLength(1);
        const payload = JSON.parse(sheetCalls[0]);
        expect(payload).toMatchObject({ tenant_id: "shopone", customer_name: "Marko Marković", city: "Sarajevo", postal_code: "71000", channel: "facebook" });
      } finally {
        globalThis.fetch = realFetch;
        await db.update(schema.businesses).set({ googleSheetUrl: "" }).where(eq(schema.businesses.id, biz1));
      }
    });

    it("sheet failure does NOT break the order — error recorded, reply still sent", async () => {
      const sender = "cust-order-fail";
      await db.update(schema.businesses).set({ googleSheetUrl: "https://script.google.com/fail" }).where(eq(schema.businesses.id, biz1));
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
      try {
        await processMetaWebhook(messengerPayload(PAGE1, sender, "fo-1", "Želim da naručim"), fastDeps);
        const r = await processMetaWebhook(
          messengerPayload(PAGE1, sender, "fo-2", "Ime i prezime: Ana Anić, grad: Sarajevo 71000, ulica: Maršala Tita 5, telefon: 061 000 111"),
          fastDeps
        );
        expect(r.replied).toBe(1);

        const orderRows = await db.select().from(schema.orders).where(and(eq(schema.orders.businessId, biz1), eq(schema.orders.customerName, "Ana Anić")));
        expect(orderRows).toHaveLength(1);
        expect(orderRows[0].googleSheetSynced).toBe(false);
        expect(orderRows[0].sheetSyncError).toContain("sheet_http_500");
      } finally {
        globalThis.fetch = realFetch;
        await db.update(schema.businesses).set({ googleSheetUrl: "" }).where(eq(schema.businesses.id, biz1));
      }
    });

    it("AI failure: live tenant gets an apology, draft tenant stays quiet", async () => {
      const throwingDeps = {
        ...fastDeps,
        engineOptions: { chatCompletion: () => Promise.reject(new Error("openai_down")) }
      };
      const r1 = await processMetaWebhook(messengerPayload(PAGE1, "cust-ai-fail", "af-1", "Imate li ovo u zelenoj boji?"), throwingDeps);
      expect(r1.replied).toBe(1);
      expect(sent[0].text).toMatch(/tehničkih poteškoća/);

      await db.update(schema.businesses).set({ aiMode: "draft" }).where(eq(schema.businesses.id, biz2));
      sent = [];
      const r2 = await processMetaWebhook(messengerPayload(PAGE2, "cust-ai-fail-2", "af-2", "Imate li ovo u zelenoj boji?"), throwingDeps);
      expect(r2.replied).toBe(0);
      expect(sent).toHaveLength(0);
      await db.update(schema.businesses).set({ aiMode: "live" }).where(eq(schema.businesses.id, biz2));
    });

    it("handoff: trigger word → human takeover, bot goes silent", async () => {
      const sender = "cust-handoff";
      const r1 = await processMetaWebhook(messengerPayload(PAGE1, sender, "h-1", "Hoću da pričam sa čovekom"), fastDeps);
      expect(r1.replied).toBe(1);
      expect(sent[0].text).toMatch(/kolegu/i);

      sent = [];
      const r2 = await processMetaWebhook(messengerPayload(PAGE1, sender, "h-2", "Halo?"), fastDeps);
      expect(r2.replied).toBe(0);
      expect(sent).toHaveLength(0);

      const convo = (await db.select().from(schema.conversations).where(eq(schema.conversations.businessId, biz1))).find((c) => c.senderId === sender);
      expect(convo?.humanTakeoverUntil).toBeTruthy();
      const rows = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, convo!.id));
      expect(rows.filter((r) => r.direction === "inbound")).toHaveLength(2);
    });

    it("resilience: broken tenant key falls back to the platform key (bot keeps working)", async () => {
      await setBusinessSecret(biz1, "openai_api_key", "sk-bad-tenant-key");
      const calls: string[] = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        const auth = headers.Authorization ?? headers.authorization ?? "";
        calls.push(auth);
        if (auth.includes("sk-bad-tenant-key")) {
          return new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), { status: 401 });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: "Odgovor preko platformskog ključa." } }], usage: { total_tokens: 12 } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }) as typeof fetch;
      try {
        const r = await processMetaWebhook(messengerPayload(PAGE1, "cust-retry", "rk-1", "Imate li ovo u plavoj boji?"), fastDeps);
        expect(r.replied).toBe(1);
        expect(sent[0].text).toContain("platformskog ključa");
        // First attempt used the tenant key (401), retry used the platform key.
        expect(calls).toHaveLength(2);
        expect(calls[0]).toContain("sk-bad-tenant-key");
        expect(calls[1]).toContain("sk-test-key");
      } finally {
        globalThis.fetch = realFetch;
        await deleteBusinessSecret(biz1, "openai_api_key");
      }
    });

    it("image: the answering model receives the photo directly (like n8n did)", async () => {
      const bodies: Array<{ model: string; messages: Array<{ role: string; content: unknown }> }> = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ choices: [{ message: { content: "Crna kožna torba sa zlatnom kopčom, dostupna je." } }], usage: { total_tokens: 20 } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }) as typeof fetch;
      try {
        const r = await processMetaWebhook(messengerImagePayload(PAGE1, "cust-img", "img-1", "https://cdn.meta/torba.jpg"), fastDeps);
        expect(r.replied).toBe(1);
        // Call 1 = vision describe; the LAST call = the answering call.
        expect(bodies.length).toBeGreaterThanOrEqual(2);
        const answer = bodies[bodies.length - 1];
        const lastMsg = answer.messages[answer.messages.length - 1];
        expect(Array.isArray(lastMsg.content)).toBe(true);
        const parts = lastMsg.content as Array<{ type: string; image_url?: { url: string } }>;
        expect(parts.some((p) => p.type === "image_url" && p.image_url?.url === "https://cdn.meta/torba.jpg")).toBe(true);
        expect(sent[0].text).toContain("torba");
      } finally {
        globalThis.fetch = realFetch;
      }
    });

    it("debounce constant is the owner-approved 10 seconds", () => {
      expect(WEBHOOK_DEBOUNCE_MS).toBe(10_000);
    });
  });
});
