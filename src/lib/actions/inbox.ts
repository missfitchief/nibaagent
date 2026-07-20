"use server";

import { and, eq } from "drizzle-orm";
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
