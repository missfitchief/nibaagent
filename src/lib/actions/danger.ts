"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import {
  adminAuditLogs,
  businessMembers,
  businesses,
  businessSecrets,
  conversations,
  eventLogs,
  handoffs,
  invites,
  knowledgeChunks,
  knowledgeSources,
  messages,
  metaConnections,
  orders,
  productImages,
  productVariants,
  products
} from "../db/schema";
import { canEdit, requireBusiness } from "../auth/guards";

/**
 * Danger-zone operations. All require owner/admin, all are audit-logged, and
 * the destructive ones require a typed confirmation (the business slug) passed
 * from a confirm dialog. Delete removes child rows in FK-dependency order.
 */

async function audit(userId: string, action: string, businessId: string, metadata: Record<string, unknown> = {}) {
  await db().insert(adminAuditLogs).values({ adminUserId: userId, action, targetType: "business", targetId: businessId, metadata });
}

const Base = z.object({ businessId: z.string().uuid() });

export async function pauseBusinessAction(formData: FormData): Promise<void> {
  const p = Base.safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const { user, business, role } = await requireBusiness(p.data.businessId, "admin");
  if (!canEdit(role)) return;
  const next = business.aiMode === "paused" ? "draft" : "paused";
  await db().update(businesses).set({ aiMode: next, aiEnabled: next !== "paused", updatedAt: new Date() }).where(eq(businesses.id, business.id));
  await audit(user.userId, "business.pause_toggle", business.id, { aiMode: next });
  revalidatePath(`/admin/businesses/${business.id}`);
}

export async function archiveBusinessAction(formData: FormData): Promise<void> {
  const p = Base.safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const { user, business, role } = await requireBusiness(p.data.businessId, "admin");
  if (!canEdit(role)) return;
  await db().update(businesses).set({ status: "inactive", aiMode: "paused", aiEnabled: false, updatedAt: new Date() }).where(eq(businesses.id, business.id));
  await audit(user.userId, "business.archive", business.id);
  revalidatePath(`/admin/businesses/${business.id}`);
}

export async function disconnectChannelsAction(formData: FormData): Promise<void> {
  const p = Base.safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const { user, business, role } = await requireBusiness(p.data.businessId, "admin");
  if (!canEdit(role)) return;
  await db().update(metaConnections).set({ status: "disconnected", encryptedPageAccessToken: "", updatedAt: new Date() }).where(eq(metaConnections.businessId, business.id));
  await audit(user.userId, "channels.disconnect", business.id);
  await db().insert(eventLogs).values({ businessId: business.id, level: "warn", area: "meta_oauth", message: "channels disconnected (danger zone)", metadata: { by: user.email } });
  revalidatePath(`/admin/businesses/${business.id}`);
}

export async function resetBotStateAction(formData: FormData): Promise<void> {
  const p = Base.safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const { user, business, role } = await requireBusiness(p.data.businessId, "admin");
  if (!canEdit(role)) return;
  // Clear active-product memory / handoff holds on all conversations.
  await db().update(conversations).set({ status: "ai", humanTakeoverUntil: null, updatedAt: new Date() }).where(eq(conversations.businessId, business.id));
  await audit(user.userId, "bot.reset_state", business.id);
  revalidatePath(`/admin/businesses/${business.id}`);
}

/** Deletes conversations/messages/handoffs/orders whose customer id marks a test. */
export async function clearTestConversationsAction(formData: FormData): Promise<void> {
  const p = Base.safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const { user, business, role } = await requireBusiness(p.data.businessId, "admin");
  if (!canEdit(role)) return;
  // Heuristic: only conversations whose senderId is flagged as a test.
  const testIds = (await db().select().from(conversations).where(eq(conversations.businessId, business.id)))
    .filter((c) => /^(test|smoke|debug|live_)/i.test(c.senderId))
    .map((c) => c.id);
  if (testIds.length) {
    await db().delete(messages).where(and(eq(messages.businessId, business.id), inArray(messages.conversationId, testIds)));
    await db().delete(handoffs).where(and(eq(handoffs.businessId, business.id), inArray(handoffs.conversationId, testIds)));
    await db().delete(orders).where(and(eq(orders.businessId, business.id), inArray(orders.conversationId, testIds)));
    await db().delete(conversations).where(and(eq(conversations.businessId, business.id), inArray(conversations.id, testIds)));
  }
  await audit(user.userId, "conversations.clear_test", business.id, { removed: testIds.length });
  revalidatePath(`/admin/businesses/${business.id}`);
}

const DeleteBusiness = z.object({ businessId: z.string().uuid(), confirm: z.string() });

/** Hard delete. Requires typing the exact slug. Admin/owner only. */
export async function deleteBusinessAction(_prev: { error?: string; ok?: boolean }, formData: FormData) {
  const p = DeleteBusiness.safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: "Invalid request." };
  const { user, business, role } = await requireBusiness(p.data.businessId, "admin");
  if (!canEdit(role)) return { error: "No permission." };
  if (p.data.confirm.trim() !== business.slug) return { error: `Type the exact slug "${business.slug}" to confirm.` };

  const bid = business.id;
  // Child rows first (FK order), all business-scoped.
  await db().delete(messages).where(eq(messages.businessId, bid));
  await db().delete(handoffs).where(eq(handoffs.businessId, bid));
  await db().delete(orders).where(eq(orders.businessId, bid));
  await db().delete(conversations).where(eq(conversations.businessId, bid));
  await db().delete(knowledgeChunks).where(eq(knowledgeChunks.businessId, bid));
  await db().delete(knowledgeSources).where(eq(knowledgeSources.businessId, bid));
  await db().delete(productImages).where(eq(productImages.businessId, bid));
  await db().delete(productVariants).where(eq(productVariants.businessId, bid));
  await db().delete(products).where(eq(products.businessId, bid));
  await db().delete(businessSecrets).where(eq(businessSecrets.businessId, bid));
  await db().delete(metaConnections).where(eq(metaConnections.businessId, bid));
  await db().delete(invites).where(eq(invites.businessId, bid));
  await db().delete(businessMembers).where(eq(businessMembers.businessId, bid));
  // Audit BEFORE the business row goes (targetId references it as text, not FK).
  await audit(user.userId, "business.delete", bid, { name: business.name, slug: business.slug });
  await db().delete(businesses).where(eq(businesses.id, bid));
  return { ok: true };
}

const OrderNote = z.object({ businessId: z.string().uuid(), orderId: z.string().uuid(), note: z.string().max(1000) });

export async function setOrderNoteAction(formData: FormData): Promise<void> {
  const p = OrderNote.safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const { business, role } = await requireBusiness(p.data.businessId, "agent");
  if (role === "viewer") return;
  await db().update(orders).set({ internalNote: p.data.note, updatedAt: new Date() }).where(and(eq(orders.id, p.data.orderId), eq(orders.businessId, business.id)));
  revalidatePath(`/admin/businesses/${business.id}`);
  revalidatePath("/app/orders");
}
