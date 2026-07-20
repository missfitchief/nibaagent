import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { orders } from "./db/schema";
import { logEvent } from "./meta";
import { env } from "./env";
import type { OrderData } from "./conversation-memory";

/**
 * Google Sheets sync for completed orders. Two URL shapes are supported:
 *   1. Apps Script web-app URL (script.google.com/macros/…/exec) — the tenant's
 *      own script; we POST the order JSON directly (legacy behavior).
 *   2. A plain Google Sheet link (docs.google.com/spreadsheets/…) — we POST to
 *      the PLATFORM bridge (one Apps Script web app deployed once by the
 *      platform owner, env SHEETS_BRIDGE_URL) with { secret, sheetUrl, ...order };
 *      the bridge opens the sheet by URL and appends the row.
 * Failures NEVER break the order flow: they are recorded on the order
 * (sheet_sync_error) and logged, so an admin can retry/re-sync later.
 */

export interface SheetOrderPayload {
  order_id: string;
  created_at: string;
  tenant_id: string;
  business_name: string;
  channel: string;
  customer_name: string;
  phone: string;
  city: string;
  postal_code: string;
  street_and_number: string;
  address: string;
  order_text: string;
  product: string;
  note: string;
  status: string;
}

export function buildSheetPayload(input: {
  orderId: string;
  createdAt: Date;
  clientId: string;
  businessName: string;
  channel: string;
  order: OrderData;
  orderText: string;
}): SheetOrderPayload {
  const { order } = input;
  return {
    order_id: input.orderId,
    created_at: input.createdAt.toISOString(),
    tenant_id: input.clientId,
    business_name: input.businessName,
    channel: input.channel,
    customer_name: order.customerName ?? "",
    phone: order.phone ?? "",
    city: order.city ?? "",
    postal_code: order.postalCode ?? "",
    street_and_number: order.streetAndNumber ?? "",
    address: [order.streetAndNumber, [order.postalCode, order.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    order_text: input.orderText,
    product: order.productText ?? "",
    note: order.note ?? "",
    status: "new"
  };
}

/** Plain Google Sheet link (what a client pastes from the browser bar). */
export function isPlainSheetUrl(url: string): boolean {
  return /^https:\/\/docs\.google\.com\/spreadsheets\//i.test(url.trim());
}

/** Apps Script web-app (/exec) URL — a tenant's own deployed script. */
export function isAppsScriptExecUrl(url: string): boolean {
  return /^https:\/\/script\.google(usercontent)?\.com\/macros\//i.test(url.trim());
}

/** What the settings form accepts: a sheet link OR an Apps Script web-app URL. */
export function isSheetTargetUrl(url: string): boolean {
  return isPlainSheetUrl(url) || isAppsScriptExecUrl(url);
}

/** Where a completed order POST goes, and with what body. */
export function routeSheetSync(
  sheetUrl: string,
  payload: SheetOrderPayload,
  bridge: { url: string; secret: string }
): { mode: "direct"; url: string; body: string } | { mode: "bridge"; url: string; body: string } | { mode: "unconfigured" } {
  const url = sheetUrl.trim();
  if (isPlainSheetUrl(url)) {
    if (!bridge.url) return { mode: "unconfigured" };
    return { mode: "bridge", url: bridge.url, body: JSON.stringify({ secret: bridge.secret, sheetUrl: url, ...payload }) };
  }
  // Apps Script /exec (and any other legacy webhook URL): direct POST, unchanged.
  return { mode: "direct", url, body: JSON.stringify(payload) };
}

/** Injectable fetch for tests; defaults to global fetch with an 8s timeout. */
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

const defaultFetch: FetchLike = async (url, init) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
};

export async function syncOrderToSheet(
  input: {
    businessId: string;
    sheetUrl: string;
    payload: SheetOrderPayload;
  },
  fetchImpl: FetchLike = defaultFetch
): Promise<{ synced: boolean; error: string }> {
  const url = input.sheetUrl.trim();
  if (!url) return { synced: false, error: "" };
  const e = env();
  const route = routeSheetSync(url, input.payload, { url: e.SHEETS_BRIDGE_URL.trim(), secret: e.SHEETS_BRIDGE_SECRET });
  if (route.mode === "unconfigured") {
    const msg = "bridge_not_configured";
    await db().update(orders).set({ sheetSyncError: msg, updatedAt: new Date() }).where(eq(orders.id, input.payload.order_id));
    await logEvent(
      input.businessId,
      "warn",
      "sheets_sync",
      `Sheet sync skipped for order ${input.payload.order_id}: the tenant uses a plain sheet link but SHEETS_BRIDGE_URL is not configured`
    );
    return { synced: false, error: msg };
  }
  try {
    const res = await fetchImpl(route.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: route.body
    });
    if (!res.ok) throw new Error(`sheet_http_${res.status}`);
    await db().update(orders).set({ googleSheetSynced: true, sheetSyncError: "", updatedAt: new Date() }).where(eq(orders.id, input.payload.order_id));
    await logEvent(input.businessId, "info", "sheets_sync", `Order ${input.payload.order_id} synced to Google Sheet (${route.mode} mode)`);
    return { synced: true, error: "" };
  } catch (err) {
    const msg = (err as Error).message.slice(0, 200);
    await db().update(orders).set({ sheetSyncError: msg, updatedAt: new Date() }).where(eq(orders.id, input.payload.order_id));
    await logEvent(input.businessId, "warn", "sheets_sync", `Sheet sync failed for order ${input.payload.order_id}: ${msg}`);
    return { synced: false, error: msg };
  }
}
