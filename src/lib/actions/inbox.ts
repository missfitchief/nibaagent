"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { conversations, handoffs, messages, orders, unansweredQuestions } from "../db/schema";
import { requireBusiness } from "../auth/guards";

const BulkIds = z.object({ businessId: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(500) });

/** Shared parse for every "select-all → delete" form: {businessId, ids: JSON array}. */
function parseBulkIds(formData: FormData): { businessId: string; ids: string[] } | { error: string } {
  let ids: unknown;
  try {
    ids = JSON.parse(String(formData.get("ids") ?? "[]"));
  } catch {
    return { error: "Could not read the selection." };
  }
  const parsed = BulkIds.safeParse({ businessId: String(formData.get("businessId") ?? ""), ids });
  if (!parsed.success) return { error: "Select at least one row first." };
  return parsed.data;
}

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

/** Select-all / multi-select delete — same permanent, hard DELETE as the single-row action, just batched. */
export async function bulkDeleteOrdersAction(_prev: BulkDeleteState, formData: FormData): Promise<BulkDeleteState> {
  const parsed = parseBulkIds(formData);
  if ("error" in parsed) return parsed;
  const { business } = await requireBusiness(parsed.businessId, "admin");
  const deleted = await db()
    .delete(orders)
    .where(and(eq(orders.businessId, business.id), inArray(orders.id, parsed.ids)))
    .returning({ id: orders.id });
  revalidatePath("/app/orders");
  revalidatePath(`/admin/businesses/${business.id}`);
  return { ok: true, deleted: deleted.length };
}

/** Select-all / multi-select delete for handoff records — resolves nothing, just removes the record. */
export async function bulkDeleteHandoffsAction(_prev: BulkDeleteState, formData: FormData): Promise<BulkDeleteState> {
  const parsed = parseBulkIds(formData);
  if ("error" in parsed) return parsed;
  const { business } = await requireBusiness(parsed.businessId, "admin");
  const deleted = await db()
    .delete(handoffs)
    .where(and(eq(handoffs.businessId, business.id), inArray(handoffs.id, parsed.ids)))
    .returning({ id: handoffs.id });
  revalidatePath("/app/handoff");
  revalidatePath(`/admin/businesses/${business.id}`);
  return { ok: true, deleted: deleted.length };
}

/**
 * Select-all / multi-select delete for whole conversations — a real hard
 * DELETE of the conversation AND its messages (messages.conversationId is
 * NOT NULL, so it must go first or the FK rejects the conversation delete).
 * Orders/handoffs/unanswered-questions that reference the conversation are
 * kept but detached (conversationId → null) rather than deleted with it —
 * an order or a "bot nije znao" record shouldn't vanish just because the
 * chat transcript was cleared out.
 */
export async function bulkDeleteConversationsAction(_prev: BulkDeleteState, formData: FormData): Promise<BulkDeleteState> {
  const parsed = parseBulkIds(formData);
  if ("error" in parsed) return parsed;
  const { business } = await requireBusiness(parsed.businessId, "admin");
  const deleted = await db().transaction(async (tx) => {
    const scope = and(eq(orders.businessId, business.id), inArray(orders.conversationId, parsed.ids));
    await tx.update(orders).set({ conversationId: null }).where(scope);
    await tx
      .update(handoffs)
      .set({ conversationId: null })
      .where(and(eq(handoffs.businessId, business.id), inArray(handoffs.conversationId, parsed.ids)));
    await tx
      .update(unansweredQuestions)
      .set({ conversationId: null })
      .where(and(eq(unansweredQuestions.businessId, business.id), inArray(unansweredQuestions.conversationId, parsed.ids)));
    await tx.delete(messages).where(and(eq(messages.businessId, business.id), inArray(messages.conversationId, parsed.ids)));
    return tx
      .delete(conversations)
      .where(and(eq(conversations.businessId, business.id), inArray(conversations.id, parsed.ids)))
      .returning({ id: conversations.id });
  });
  revalidatePath("/app/conversations");
  revalidatePath("/app/handoff");
  revalidatePath(`/admin/businesses/${business.id}`);
  return { ok: true, deleted: deleted.length };
}
