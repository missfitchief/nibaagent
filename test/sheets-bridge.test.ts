import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import {
  isAppsScriptExecUrl,
  isPlainSheetUrl,
  isSheetTargetUrl,
  routeSheetSync,
  syncOrderToSheet,
  type SheetOrderPayload
} from "../src/lib/sheets-sync";
import { resetEnvCache } from "../src/lib/env";

const SHEET = "https://docs.google.com/spreadsheets/d/1AbC-xyz/edit#gid=0";
const EXEC = "https://script.google.com/macros/s/AKfycbxyz123/exec";
const BRIDGE = "https://script.google.com/macros/s/PLATFORMBRIDGE/exec";

const payload: SheetOrderPayload = {
  order_id: "ord-1",
  created_at: "2026-01-01T10:00:00.000Z",
  tenant_id: "shop",
  business_name: "Shop",
  channel: "facebook",
  customer_name: "Marko",
  phone: "061",
  city: "Sarajevo",
  postal_code: "71000",
  street_and_number: "Ferhadija 12",
  address: "Ferhadija 12, 71000 Sarajevo",
  order_text: "haljina M",
  product: "haljina",
  note: "",
  status: "new"
};

describe("sheet URL classification + validation", () => {
  it("accepts a plain Google Sheet link and Apps Script /exec URLs; rejects garbage", () => {
    expect(isPlainSheetUrl(SHEET)).toBe(true);
    expect(isAppsScriptExecUrl(EXEC)).toBe(true);
    expect(isAppsScriptExecUrl("https://script.googleusercontent.com/macros/echo?lib=x")).toBe(true);

    expect(isSheetTargetUrl(SHEET)).toBe(true);
    expect(isSheetTargetUrl(EXEC)).toBe(true);
    expect(isSheetTargetUrl("https://evil.example.com/steal")).toBe(false);
    expect(isSheetTargetUrl("not a url")).toBe(false);
    expect(isSheetTargetUrl("")).toBe(false);
    expect(isSheetTargetUrl("http://docs.google.com/spreadsheets/d/x")).toBe(false); // https only
  });
});

describe("routeSheetSync — URL-shape routing", () => {
  it("plain sheet link → platform bridge with secret + sheetUrl + payload", () => {
    const r = routeSheetSync(SHEET, payload, { url: BRIDGE, secret: "s3cr3t" });
    expect(r.mode).toBe("bridge");
    if (r.mode !== "bridge") return;
    expect(r.url).toBe(BRIDGE);
    const body = JSON.parse(r.body);
    expect(body.secret).toBe("s3cr3t");
    expect(body.sheetUrl).toBe(SHEET);
    expect(body.order_id).toBe("ord-1");
    expect(body.customer_name).toBe("Marko");
  });

  it("plain sheet link without bridge env → unconfigured (never a raw POST to the sheet)", () => {
    expect(routeSheetSync(SHEET, payload, { url: "", secret: "" }).mode).toBe("unconfigured");
  });

  it("Apps Script /exec URL → direct POST, payload unchanged (legacy behavior)", () => {
    const r = routeSheetSync(EXEC, payload, { url: BRIDGE, secret: "s3cr3t" });
    expect(r.mode).toBe("direct");
    if (r.mode !== "direct") return;
    expect(r.url).toBe(EXEC);
    const body = JSON.parse(r.body);
    expect(body.order_id).toBe("ord-1");
    expect(body.secret).toBeUndefined();
    expect(body.sheetUrl).toBeUndefined();
  });
});

describe("syncOrderToSheet end-to-end (fake fetch)", () => {
  let db: TestDb;
  let orderId: string;
  let businessId: string;

  beforeEach(async () => {
    db = await makeDb();
    const s = await seedBusiness(db, "SheetCo");
    businessId = s.business.id;
    const [convo] = await db.insert(schema.conversations).values({ businessId, channel: "facebook", senderId: "s1" }).returning();
    const [order] = await db.insert(schema.orders).values({ businessId, conversationId: convo.id, customerName: "Marko" }).returning();
    orderId = order.id;
  });

  afterEach(() => {
    delete process.env.SHEETS_BRIDGE_URL;
    delete process.env.SHEETS_BRIDGE_SECRET;
    resetEnvCache();
  });

  const okFetch = (seen: Array<{ url: string; body: string }>) => async (url: string, init: { body: string }) => {
    seen.push({ url, body: init.body });
    return { ok: true, status: 200 };
  };

  it("plain link → bridge URL is called with secret+sheetUrl; order marked synced", async () => {
    process.env.SHEETS_BRIDGE_URL = BRIDGE;
    process.env.SHEETS_BRIDGE_SECRET = "s3cr3t";
    resetEnvCache();
    const seen: Array<{ url: string; body: string }> = [];
    const r = await syncOrderToSheet({ businessId, sheetUrl: SHEET, payload: { ...payload, order_id: orderId } }, okFetch(seen));
    expect(r).toEqual({ synced: true, error: "" });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(BRIDGE);
    const body = JSON.parse(seen[0].body);
    expect(body.secret).toBe("s3cr3t");
    expect(body.sheetUrl).toBe(SHEET);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order.googleSheetSynced).toBe(true);
    expect(order.sheetSyncError).toBe("");
  });

  it("plain link without bridge env → bridge_not_configured recorded, no fetch, never throws", async () => {
    resetEnvCache(); // no bridge env
    let fetches = 0;
    const r = await syncOrderToSheet({ businessId, sheetUrl: SHEET, payload: { ...payload, order_id: orderId } }, async () => {
      fetches += 1;
      return { ok: true, status: 200 };
    });
    expect(r).toEqual({ synced: false, error: "bridge_not_configured" });
    expect(fetches).toBe(0);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order.sheetSyncError).toBe("bridge_not_configured");
    expect(order.googleSheetSynced).toBe(false);
  });

  it("exec URL → direct POST to the tenant script", async () => {
    resetEnvCache();
    const seen: Array<{ url: string; body: string }> = [];
    const r = await syncOrderToSheet({ businessId, sheetUrl: EXEC, payload: { ...payload, order_id: orderId } }, okFetch(seen));
    expect(r.synced).toBe(true);
    expect(seen[0].url).toBe(EXEC);
    expect(JSON.parse(seen[0].body).secret).toBeUndefined();
  });

  it("a failing endpoint records sheet_sync_error but never throws", async () => {
    resetEnvCache();
    const r = await syncOrderToSheet({ businessId, sheetUrl: EXEC, payload: { ...payload, order_id: orderId } }, async () => {
      throw new Error("network down");
    });
    expect(r).toEqual({ synced: false, error: "network down" });
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order.sheetSyncError).toBe("network down");
  });
});
