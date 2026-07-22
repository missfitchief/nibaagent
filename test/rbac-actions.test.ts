import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { resetEnvCache } from "../src/lib/env";
import { updateBotSettingsAction, setAiModeAction, updateBusinessSettingsAction } from "../src/lib/actions/settings";
import { createKnowledgeAction, deleteKnowledgeAction } from "../src/lib/actions/knowledge";
import { resolveHandoffAction, setOrderStatusAction } from "../src/lib/actions/inbox";
import { telegramTestAction, testBotAction, testImageRecognitionAction } from "../src/lib/actions/tools";
import { adminUpdateBusinessAction } from "../src/lib/actions/admin";
import { deleteBusinessAction } from "../src/lib/actions/danger";
import { resolveAllErrorLogsAction } from "../src/lib/actions/logs";
import { hashPassword } from "../src/lib/auth/password";

/**
 * RBAC enforcement: mutating server actions must reject members below admin
 * (viewer/agent) instead of silently applying changes. The session is mocked
 * through next/headers cookies; requireBusiness() redirects under-privileged
 * callers (Next throws NEXT_REDIRECT), which these tests assert.
 */

const sessionState = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (sessionState.token ? { name, value: sessionState.token } : undefined),
    set: () => {},
    delete: () => {}
  })
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

async function makeSession(userId: string, role: "admin" | "client", email = "u@test.local"): Promise<string> {
  return new SignJWT({ email, role, name: "U" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1209600s")
    .sign(new TextEncoder().encode("nibachat-dev-session-secret"));
}

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

let db: TestDb;
let A: Awaited<ReturnType<typeof seedBusiness>>;
let viewerId: string;
let agentId: string;
let adminMemberId: string;

beforeAll(async () => {
  resetEnvCache();
  db = await makeDb();
  A = await seedBusiness(db, "Alpha");
  const mkUser = async (email: string) =>
    (await db.insert(schema.users).values({ email, name: "U", passwordHash: "x", role: "client" }).returning())[0];
  const v = await mkUser("viewer@test.local");
  const g = await mkUser("agent@test.local");
  const a = await mkUser("bizadmin@test.local");
  viewerId = v.id;
  agentId = g.id;
  adminMemberId = a.id;
  await db.insert(schema.businessMembers).values({ businessId: A.business.id, userId: viewerId, role: "viewer" });
  await db.insert(schema.businessMembers).values({ businessId: A.business.id, userId: agentId, role: "agent" });
  await db.insert(schema.businessMembers).values({ businessId: A.business.id, userId: adminMemberId, role: "admin" });
});

beforeEach(() => {
  sessionState.token = undefined;
});

const asViewer = () => makeSession(viewerId, "client", "viewer@test.local").then((t) => (sessionState.token = t));
const asAgent = () => makeSession(agentId, "client", "agent@test.local").then((t) => (sessionState.token = t));
const asOwner = () => makeSession(A.user.id, "client", A.user.email).then((t) => (sessionState.token = t));
const asBizAdmin = () => makeSession(adminMemberId, "client", "bizadmin@test.local").then((t) => (sessionState.token = t));

describe("mutating actions reject viewers/agents (RBAC)", () => {
  it("updateBotSettingsAction", async () => {
    await asViewer();
    await expect(updateBotSettingsAction({}, fd({ businessId: A.business.id }))).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("setAiModeAction", async () => {
    await asViewer();
    await expect(setAiModeAction(fd({ businessId: A.business.id, aiMode: "live" }))).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("updateBusinessSettingsAction", async () => {
    await asViewer();
    await expect(
      updateBusinessSettingsAction(
        {},
        fd({ businessId: A.business.id, name: "Alpha", defaultLanguage: "sr", googleSheetUrl: "", telegramChannelId: "", whatsappNotificationTarget: "" })
      )
    ).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("createKnowledgeAction", async () => {
    await asViewer();
    await expect(
      createKnowledgeAction({}, fd({ businessId: A.business.id, type: "faq", title: "Q", content: "A", sourceUrl: "" }))
    ).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("deleteKnowledgeAction", async () => {
    await asViewer();
    await expect(deleteKnowledgeAction(fd({ businessId: A.business.id, id: crypto.randomUUID() }))).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("resolveHandoffAction", async () => {
    await asViewer();
    await expect(resolveHandoffAction(fd({ businessId: A.business.id, id: crypto.randomUUID() }))).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("setOrderStatusAction", async () => {
    await asViewer();
    await expect(setOrderStatusAction(fd({ businessId: A.business.id, id: crypto.randomUUID(), status: "confirmed" }))).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("testBotAction", async () => {
    await asViewer();
    await expect(testBotAction({}, fd({ businessId: A.business.id, message: "zdravo" }))).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("testImageRecognitionAction", async () => {
    await asViewer();
    await expect(
      testImageRecognitionAction({}, fd({ businessId: A.business.id, imageUrl: "https://example.com/x.jpg", message: "" }))
    ).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("telegramTestAction (agent too)", async () => {
    await asAgent();
    await expect(telegramTestAction({}, fd({ businessId: A.business.id }))).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("a viewer really cannot mutate: bot settings stay unchanged", async () => {
    const before = (await db.select().from(schema.botSettings).where(eq(schema.botSettings.businessId, A.business.id)))[0];
    await asViewer();
    await expect(updateBotSettingsAction({}, fd({ businessId: A.business.id, tone: "luxury" }))).rejects.toThrow(/NEXT_REDIRECT/);
    const after = (await db.select().from(schema.botSettings).where(eq(schema.botSettings.businessId, A.business.id)))[0];
    expect(after.tone).toBe(before.tone);
  });
});

describe("owner/admin can still edit", () => {
  it("owner updates bot settings", async () => {
    await asOwner();
    const res = await updateBotSettingsAction({}, fd({ businessId: A.business.id, tone: "casual" }));
    expect(res.ok).toBe(true);
    const row = (await db.select().from(schema.botSettings).where(eq(schema.botSettings.businessId, A.business.id)))[0];
    expect(row.tone).toBe("casual");
  });

  it("business admin member updates bot settings", async () => {
    await asBizAdmin();
    const res = await updateBotSettingsAction({}, fd({ businessId: A.business.id, tone: "professional" }));
    expect(res.ok).toBe(true);
  });

  it("replyDelaySeconds is capped at 30 by validation (webhook budget is 60s)", async () => {
    await asOwner();
    const res = await updateBotSettingsAction({}, fd({ businessId: A.business.id, replyDelaySeconds: "500" }));
    expect(res.error).toBeTruthy();
    expect(res.ok).toBeFalsy();
    const ok = await updateBotSettingsAction({}, fd({ businessId: A.business.id, replyDelaySeconds: "30" }));
    expect(ok.ok).toBe(true);
  });
});

describe("admin plan updates keep businesses.plan and subscriptions.plan in sync", () => {
  it("updates both rows (insert when missing, update on conflict)", async () => {
    const [adminUser] = await db
      .insert(schema.users)
      .values({ email: "platform-admin@test.local", name: "A", passwordHash: "x", role: "admin" })
      .returning();
    sessionState.token = await makeSession(adminUser.id, "admin", adminUser.email);

    const form = (plan: string) =>
      fd({
        businessId: A.business.id,
        plan,
        status: "active",
        aiMode: "live",
        handoffEnabled: "true",
        aiProvider: "openai",
        selectedModel: "gpt-4o-mini",
        dailyMessageLimit: "100",
        monthlyMessageLimit: "1000",
        tone: "friendly",
        clientId: ""
      });

    const r1 = await adminUpdateBusinessAction({}, form("pro"));
    expect(r1.ok).toBe(true);
    let biz = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, A.business.id)))[0];
    let sub = (await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.businessId, A.business.id)))[0];
    expect(biz.plan).toBe("pro");
    expect(sub?.plan).toBe("pro");

    const r2 = await adminUpdateBusinessAction({}, form("standard"));
    expect(r2.ok).toBe(true);
    biz = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, A.business.id)))[0];
    sub = (await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.businessId, A.business.id)))[0];
    expect(biz.plan).toBe("standard");
    expect(sub?.plan).toBe("standard");
    const subs = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.businessId, A.business.id));
    expect(subs).toHaveLength(1); // upsert, never a duplicate row
  });
});

describe("deleteBusinessAction: platform-admin-only, gated by the admin's own real password", () => {
  it("rejects a business-role admin (owner/member) — platform admin only, no matter their business role", async () => {
    const toDelete = await seedBusiness(db, "DeleteMeOwner");
    await asOwner(); // asOwner is A's owner, not toDelete's — irrelevant here, any non-platform-admin session must be rejected
    await expect(
      deleteBusinessAction({}, fd({ businessId: toDelete.business.id, confirm: toDelete.business.slug, password: "whatever" }))
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await db.select().from(schema.businesses).where(eq(schema.businesses.id, toDelete.business.id))).toHaveLength(1);
  });

  it("rejects the platform admin's own action when the password is wrong — business survives", async () => {
    const toDelete = await seedBusiness(db, "DeleteMeWrongPw");
    const [platformAdmin] = await db
      .insert(schema.users)
      .values({ email: "delete-admin-1@test.local", name: "A", passwordHash: await hashPassword("correct-horse-battery"), role: "admin" })
      .returning();
    sessionState.token = await makeSession(platformAdmin.id, "admin", platformAdmin.email);

    const res = await deleteBusinessAction({}, fd({ businessId: toDelete.business.id, confirm: toDelete.business.slug, password: "totally-wrong" }));
    expect(res.error).toBeTruthy();
    expect(await db.select().from(schema.businesses).where(eq(schema.businesses.id, toDelete.business.id))).toHaveLength(1);
  });

  it("rejects a correct password but wrong slug confirmation — business survives", async () => {
    const toDelete = await seedBusiness(db, "DeleteMeWrongSlug");
    const [platformAdmin] = await db
      .insert(schema.users)
      .values({ email: "delete-admin-2@test.local", name: "A", passwordHash: await hashPassword("correct-horse-battery"), role: "admin" })
      .returning();
    sessionState.token = await makeSession(platformAdmin.id, "admin", platformAdmin.email);

    const res = await deleteBusinessAction({}, fd({ businessId: toDelete.business.id, confirm: "not-the-slug", password: "correct-horse-battery" }));
    expect(res.error).toBeTruthy();
    expect(await db.select().from(schema.businesses).where(eq(schema.businesses.id, toDelete.business.id))).toHaveLength(1);
  });

  it("deletes for real once the platform admin gives BOTH the correct password AND the correct slug", async () => {
    const toDelete = await seedBusiness(db, "DeleteMeForReal");
    const [platformAdmin] = await db
      .insert(schema.users)
      .values({ email: "delete-admin-3@test.local", name: "A", passwordHash: await hashPassword("correct-horse-battery"), role: "admin" })
      .returning();
    sessionState.token = await makeSession(platformAdmin.id, "admin", platformAdmin.email);

    const res = await deleteBusinessAction({}, fd({ businessId: toDelete.business.id, confirm: toDelete.business.slug, password: "correct-horse-battery" }));
    expect(res.ok).toBe(true);
    expect(await db.select().from(schema.businesses).where(eq(schema.businesses.id, toDelete.business.id))).toHaveLength(0);
  });
});

describe("resolveAllErrorLogsAction: platform-admin-only, clears the whole error backlog", () => {
  it("rejects a business-role admin/owner — platform admin only", async () => {
    await asBizAdmin();
    await expect(resolveAllErrorLogsAction()).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("resolves every unresolved error across ALL businesses, leaves warn/info and already-resolved rows untouched", async () => {
    const B = await seedBusiness(db, "ErrLogsBeta");
    const [platformAdmin] = await db
      .insert(schema.users)
      .values({ email: "resolve-admin@test.local", name: "A", passwordHash: "x", role: "admin" })
      .returning();

    const [errA] = await db.insert(schema.eventLogs).values({ businessId: A.business.id, level: "error", area: "ai_reply", message: "boom A" }).returning();
    const [errB] = await db.insert(schema.eventLogs).values({ businessId: B.business.id, level: "error", area: "n8n_workflow", message: "boom B" }).returning();
    const [warnRow] = await db.insert(schema.eventLogs).values({ businessId: A.business.id, level: "warn", area: "ai_reply", message: "meh" }).returning();
    const alreadyResolvedAt = new Date("2020-01-01T00:00:00Z");
    const [preResolved] = await db
      .insert(schema.eventLogs)
      .values({ businessId: A.business.id, level: "error", area: "ai_reply", message: "old, already handled", resolvedAt: alreadyResolvedAt })
      .returning();

    sessionState.token = await makeSession(platformAdmin.id, "admin", platformAdmin.email);
    await resolveAllErrorLogsAction();

    const rows = await db.select().from(schema.eventLogs).where(eq(schema.eventLogs.id, errA.id));
    expect(rows[0].resolvedAt).not.toBeNull();
    const rowsB = await db.select().from(schema.eventLogs).where(eq(schema.eventLogs.id, errB.id));
    expect(rowsB[0].resolvedAt).not.toBeNull(); // platform-wide, not scoped to one business
    const warnAfter = await db.select().from(schema.eventLogs).where(eq(schema.eventLogs.id, warnRow.id));
    expect(warnAfter[0].resolvedAt).toBeNull(); // only level="error" rows are touched
    const preResolvedAfter = await db.select().from(schema.eventLogs).where(eq(schema.eventLogs.id, preResolved.id));
    expect(preResolvedAfter[0].resolvedAt?.getTime()).toBe(alreadyResolvedAt.getTime()); // untouched, not re-stamped
  });
});
