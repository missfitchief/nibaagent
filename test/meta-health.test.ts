import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { checkMetaConnectionHealth } from "../src/lib/meta-health";
import { META_TOKEN_TTL_MS } from "../src/lib/meta";
import { encryptToken } from "../src/lib/crypto";
import { GET } from "../src/app/api/cron/meta-health/route";

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

async function seedConnection(businessId: string, opts: { pageId: string; status: string; token?: string }) {
  await db.insert(schema.metaConnections).values({
    businessId,
    clientId: "test-client",
    pageId: opts.pageId,
    status: opts.status as "active",
    connectionType: "oauth",
    ...(opts.token ? { encryptedPageAccessToken: encryptToken(opts.token), pageAccessToken: opts.token } : {})
  });
}

const statusOf = async (pageId: string) =>
  (await db.select().from(schema.metaConnections).where(eq(schema.metaConnections.pageId, pageId)))[0].status;

describe("meta token health check", () => {
  it("active → error on an OAuth invalid-token failure (code 190), with an event log", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await seedConnection(business.id, { pageId: "P1", status: "active", token: "tok1" });

    const seen: string[] = [];
    const r = await checkMetaConnectionHealth(async (token) => {
      seen.push(token);
      return { ok: false, invalidToken: true, error: "Invalid OAuth access token (code 190)" };
    });

    expect(seen).toEqual(["tok1"]); // decrypted token was probed
    expect(await statusOf("P1")).toBe("error");
    expect(r.errored).toBe(1);
    const logs = await db.select().from(schema.eventLogs).where(eq(schema.eventLogs.businessId, business.id));
    expect(logs.some((l) => l.level === "error" && l.message.includes("invalid/expired"))).toBe(true);
  });

  it("error → active again on a healthy probe", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await seedConnection(business.id, { pageId: "P2", status: "error", token: "tok2" });
    const r = await checkMetaConnectionHealth(async () => ({ ok: true }));
    expect(await statusOf("P2")).toBe("active");
    expect(r.active).toBe(1);
  });

  it("transient failure leaves status untouched and logs a warning", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await seedConnection(business.id, { pageId: "P3", status: "active", token: "tok3" });
    const r = await checkMetaConnectionHealth(async () => ({ ok: false, error: "graph_500" }));
    expect(await statusOf("P3")).toBe("active"); // never flipped on a maybe
    expect(r.skipped).toBe(1);
    const logs = await db.select().from(schema.eventLogs).where(eq(schema.eventLogs.businessId, business.id));
    expect(logs.some((l) => l.level === "warn" && l.message.includes("inconclusive"))).toBe(true);
  });

  it("a row with no token at all is marked error; disconnected rows are skipped", async () => {
    const { business } = await seedBusiness(db, "Shop");
    await seedConnection(business.id, { pageId: "P4", status: "partial" });
    await seedConnection(business.id, { pageId: "P5", status: "disconnected", token: "tok5" });
    let probed = 0;
    const r = await checkMetaConnectionHealth(async () => {
      probed += 1;
      return { ok: true };
    });
    expect(probed).toBe(0); // P4 has no token (short-circuit), P5 is disconnected
    expect(await statusOf("P4")).toBe("error");
    expect(await statusOf("P5")).toBe("disconnected");
    expect(r.errored).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it("token expiry constant is the 60-day long-lived default", () => {
    expect(META_TOKEN_TTL_MS).toBe(60 * 24 * 60 * 60 * 1000);
  });
});

describe("cron route auth (fail closed)", () => {
  const req = (auth?: string) =>
    new NextRequest("http://localhost/api/cron/meta-health", auth ? { headers: { authorization: auth } } : undefined);

  it("401 when CRON_SECRET is unset", async () => {
    const res = await GET(req("Bearer anything"));
    expect(res.status).toBe(401);
  });

  it("401 on a wrong bearer token", async () => {
    process.env.CRON_SECRET = "cron-test-secret";
    const res = await GET(req("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("200 with the correct bearer token (no connections → no external calls)", async () => {
    process.env.CRON_SECRET = "cron-test-secret";
    const res = await GET(req("Bearer cron-test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, checked: 0, active: 0, errored: 0 });
  });
});
