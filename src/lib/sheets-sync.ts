import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { orders } from "./db/schema";
import { logEvent } from "./meta";
import type { OrderData } from "./conversation-memory";

/**
 * Google Sheets sync for completed orders. Each business pastes its own Apps
 * Script webhook URL (businesses.google_sheet_url); on a completed order we
 * POST one JSON row to it — same shape the old n8n "Append Google Sheet" node
 * sent. Failures NEVER break the order flow: they are recorded on the order
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
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.payload)
    });
    if (!res.ok) throw new Error(`sheet_http_${res.status}`);
    await db().update(orders).set({ googleSheetSynced: true, sheetSyncError: "", updatedAt: new Date() }).where(eq(orders.id, input.payload.order_id));
    await logEvent(input.businessId, "info", "sheets_sync", `Order ${input.payload.order_id} synced to Google Sheet`);
    return { synced: true, error: "" };
  } catch (err) {
    const msg = (err as Error).message.slice(0, 200);
    await db().update(orders).set({ sheetSyncError: msg, updatedAt: new Date() }).where(eq(orders.id, input.payload.order_id));
    await logEvent(input.businessId, "warn", "sheets_sync", `Sheet sync failed for order ${input.payload.order_id}: ${msg}`);
    return { synced: false, error: msg };
  }
}
