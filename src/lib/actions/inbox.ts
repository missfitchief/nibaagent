"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { conversations, handoffs, orders } from "../db/schema";
import { requireBusiness } from "../auth/guards";

const HandoffResolve = z.object({ businessId: z.string().uuid(), id: z.string().uuid() });

export async function resolveHandoffAction(formData: FormData): Promise<void> {
  const parsed = HandoffResolve.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { business } = await requireBusiness(parsed.data.businessId, "admin");
  const [h] = await db()
    .update(handoffs)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(and(eq(handoffs.id, parsed.data.id), eq(handoffs.businessId, business.id)))
    .returning();
  if (h?.conversationId) {
    await db()
      .update(conversations)
      .set({ status: "ai", humanTakeoverUntil: null, updatedAt: new Date() })
      .where(and(eq(conversations.id, h.conversationId), eq(conversations.businessId, business.id)));
  }
  revalidatePath("/app/handoff");
}

const OrderStatus = z.object({
  businessId: z.string().uuid(),
  id: z.string().uuid(),
  status: z.enum(["new", "confirmed", "shipped", "done", "cancelled"])
});

export async function setOrderStatusAction(formData: FormData): Promise<void> {
  const parsed = OrderStatus.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { business } = await requireBusiness(parsed.data.businessId, "admin");
  await db()
    .update(orders)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(orders.id, parsed.data.id), eq(orders.businessId, business.id)));
  revalidatePath("/app/orders");
}

const OrderDelete = z.object({ businessId: z.string().uuid(), id: z.string().uuid() });

export async function deleteOrderAction(formData: FormData): Promise<void> {
  const parsed = OrderDelete.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  // Deleting is permanent — same bar as changing an order's status, not the
  // "viewer" default (a viewer could otherwise erase orders they can't edit).
  const { business } = await requireBusiness(parsed.data.businessId, "admin");
  await db().delete(orders).where(and(eq(orders.id, parsed.data.id), eq(orders.businessId, business.id)));
  revalidatePath("/app/orders");
}

export interface BulkDeleteState {
  ok?: boolean;
  error?: string;
  deleted?: number;
}

const OrderBulkDelete = z.object({ businessId: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(500) });

/** Select-all / multi-select delete — same permanent, hard DELETE as the single-row action, just batched. */
export async function bulkDeleteOrdersAction(_prev: BulkDeleteState, formData: FormData): Promise<BulkDeleteState> {
  const businessId = String(formData.get("businessId") ?? "");
  let ids: unknown;
  try {
    ids = JSON.parse(String(formData.get("ids") ?? "[]"));
  } catch {
    return { error: "Could not read the selected orders." };
  }
  const parsed = OrderBulkDelete.safeParse({ businessId, ids });
  if (!parsed.success) return { error: "Select at least one order to delete." };
  const { business } = await requireBusiness(parsed.data.businessId, "admin");
  const deleted = await db()
    .delete(orders)
    .where(and(eq(orders.businessId, business.id), inArray(orders.id, parsed.data.ids)))
    .returning({ id: orders.id });
  revalidatePath("/app/orders");
  return { ok: true, deleted: deleted.length };
}
