import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { runEngine, type OwnerNotification } from "../src/lib/engine";
import { notifyBusiness } from "../src/lib/notify";
import { encryptToken } from "../src/lib/crypto";
import { resetEnvCache } from "../src/lib/env";

/**
 * Owner notifications: the engine fires notifyBusiness (via the injectable
 * notify seam) when an order completes and when a handoff is triggered —
 * fire-and-forget, never blocking or breaking the reply. The email channel
 * resolves the business owner's email and goes through the shared Resend path.
 */

// Platform-fallback key so the AI branch is reachable if a test strays there.
process.env.OPENAI_API_KEY = "sk-test-key";

let db: TestDb;
beforeEach(async () => {
  resetEnvCache();
  db = await makeDb();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function liveBusiness(name: string) {
  const s = await seedBusiness(db, name);
  await db.update(schema.businesses).set({ aiMode: "live", defaultLanguage: "sr" }).where(eq(schema.businesses.id, s.business.id));
  return s;
}

describe("engine owner notifications", () => {
  it("order completion notifies the owner with customer + order details", async () => {
    const { business } = await liveBusiness("NotifyCo");
    const sent: OwnerNotification[] = [];
    const notify = async (n: OwnerNotification) => {
      sent.push(n);
    };
    const sender = { channel: "facebook" as const, senderId: "fb-notify-order" };

    await runEngine(business.id, "Ćao! Želim da naručim", { conversation: sender, notify });
    await runEngine(business.id, "Ime i prezime: Marko Marković, grad Sarajevo", { conversation: sender, notify });
    await runEngine(business.id, "Ulica Ferhadija 12, poštanski 71000", { conversation: sender, notify });
    const r4 = await runEngine(business.id, "061 123 456", { conversation: sender, notify });
    expect(r4.intent).toBe("order");

    await vi.waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(1));
    const orderNotif = sent.find((n) => n.kind === "order");
    expect(orderNotif).toBeTruthy();
    expect(orderNotif!.text).toContain("Marko Marković");
    expect(orderNotif!.text).toContain("061 123 456");
    expect(orderNotif!.text).toContain("Sarajevo");
    expect(orderNotif!.text).toContain("71000");
    expect(orderNotif!.text).toContain("Ferhadija 12");
    expect(orderNotif!.text).toContain(r4.conversationId);
  });

  it("handoff trigger notifies the owner (fire-and-forget, reply still returned)", async () => {
    const { business } = await liveBusiness("NotifyCo");
    const sent: OwnerNotification[] = [];
    const notify = async (n: OwnerNotification) => {
      sent.push(n);
    };
    const r = await runEngine(business.id, "hoću da pričam sa agent", {
      conversation: { channel: "facebook", senderId: "fb-notify-handoff" },
      notify
    });
    expect(r.intent).toBe("handoff");
    expect(r.handoffTriggered).toBe(true);
    expect(r.reply.length).toBeGreaterThan(0); // reply was NOT blocked by the notification

    await vi.waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0].kind).toBe("handoff");
    expect(sent[0].text).toContain("agent");
    expect(sent[0].text).toContain(r.conversationId);
  });

  it("a throwing notify seam never breaks the reply path", async () => {
    const { business } = await liveBusiness("NotifyCo");
    const notify = async () => {
      throw new Error("telegram down");
    };
    const r = await runEngine(business.id, "hoću da pričam sa agent", {
      conversation: { channel: "facebook", senderId: "fb-notify-throw" },
      notify
    });
    expect(r.intent).toBe("handoff");
    expect(r.reply.length).toBeGreaterThan(0);
  });
});

describe("notifyBusiness email channel", () => {
  it("dev mode (email not configured) skips email silently — no error, no warn log", async () => {
    const { business } = await seedBusiness(db, "SilentCo");
    await notifyBusiness(
      { id: business.id, name: business.name, telegramChannelId: "", whatsappNotificationTarget: "" },
      "order",
      "test order"
    );
    const logs = await db.select().from(schema.eventLogs).where(eq(schema.eventLogs.businessId, business.id));
    expect(logs.filter((l) => l.level === "warn" && l.area === "notification")).toHaveLength(0);
  });

  it("resend mode emails the business owner (Resend API called with owner email)", async () => {
    const { user, business } = await seedBusiness(db, "MailCo");
    // Platform email config: resend mode + API key (secret values are AES-GCM at rest).
    await db.insert(schema.platformSettings).values({ key: "EMAIL_MODE", value: "resend", isSecret: false });
    await db.insert(schema.platformSettings).values({ key: "RESEND_API_KEY", value: encryptToken("re_test_key_123"), isSecret: true, lastFour: "_123" });

    const calls: Array<{ url: string; body: { to: string; subject: string }; auth: string }> = [];
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: String((init?.headers as Record<string, string>)?.Authorization ?? "") });
      return new Response("{}", { status: 200 });
    });

    await notifyBusiness(
      { id: business.id, name: business.name, telegramChannelId: "", whatsappNotificationTarget: "" },
      "order",
      "Nova porudžbina: Marko"
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].body.to).toBe(user.email); // the OWNER's email
    expect(calls[0].body.subject).toContain("MailCo");
    expect(calls[0].auth).toBe("Bearer re_test_key_123");
    const logs = await db.select().from(schema.eventLogs).where(eq(schema.eventLogs.businessId, business.id));
    expect(logs.filter((l) => l.level === "warn")).toHaveLength(0);
  });
});
