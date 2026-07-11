"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import {
  adminAuditLogs,
  analyticsDaily,
  botSettings,
  businessMembers,
  businesses,
  businessSecrets,
  catalogSnapshots,
  conversations,
  eventLogs,
  handoffs,
  invites,
  knowledgeChunks,
  knowledgeSources,
  learningMemories,
  messages,
  metaConnections,
  orders,
  productImages,
  productVariants,
  products,
  subscriptions,
  tenantConfigs,
  tenants
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

const DeleteBusiness = z.object({ businessId: z.string().uuid(), confirm: z.string(), confirmDisconnect: z.coerce.boolean().default(false) });

/**
 * Hard delete. Platform-admin/owner only, requires typing the exact slug, and is
 * blocked while an ACTIVE Meta connection exists unless the operator confirms the
 * disconnect. Removes EVERY tenant-scoped table (FK-dependency order) so no row
 * is orphaned and no FK aborts the delete — including bot_settings, analytics,
 * subscriptions, event_logs and the n8n tables (tenant_configs / catalog_snapshots
 * / learning_memories). Strictly scoped by business_id.
 */
export async function deleteBusinessAction(_prev: { error?: string; ok?: boolean }, formData: FormData) {
  const p = DeleteBusiness.safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: "Neispravan zahtev." };
  const { user, business, role } = await requireBusiness(p.data.businessId, "admin");
  if (!canEdit(role)) return { error: "Nemate dozvolu." };
  if (p.data.confirm.trim() !== business.slug) return { error: `Upišite tačan slug „${business.slug}" za potvrdu.` };

  const bid = business.id;

  // Guard: don't silently delete a business with a live Meta connection.
  const activeConn = (
    await db().select({ id: metaConnections.id }).from(metaConnections).where(and(eq(metaConnections.businessId, bid), inArray(metaConnections.status, ["active", "connected", "partial"]))).limit(1)
  )[0];
  if (activeConn && !p.data.confirmDisconnect) {
    return { error: "Ovaj biznis ima aktivnu Meta konekciju. Potvrdite prekid veze (Disconnect) pre brisanja." };
  }

  // Audit BEFORE the business row goes (targetId references it as text, not FK).
  await audit(user.userId, "business.delete", bid, { name: business.name, slug: business.slug, hadActiveConnection: Boolean(activeConn) });
  await purgeBusinessData(bid);
  return { ok: true };
}

/**
 * Delete EVERY tenant-scoped row for a business, in FK-dependency order, then the
 * business itself. Tenant-scoped (only `businessId` rows). Exported so the cascade
 * is unit-testable independent of the auth guard. `bidText` covers the n8n tables
 * whose business_id is TEXT (no FK).
 */
export async function purgeBusinessData(bid: string): Promise<void> {
  const bidText = bid;
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
  await db().delete(analyticsDaily).where(eq(analyticsDaily.businessId, bid));
  await db().delete(subscriptions).where(eq(subscriptions.businessId, bid));
  await db().delete(botSettings).where(eq(botSettings.businessId, bid));
  await db().delete(eventLogs).where(eq(eventLogs.businessId, bid));
  await db().delete(invites).where(eq(invites.businessId, bid));
  await db().delete(businessMembers).where(eq(businessMembers.businessId, bid));
  // n8n compat tables use a TEXT business_id (no FK) — clear them too so n8n sees nothing.
  await db().delete(tenantConfigs).where(eq(tenantConfigs.businessId, bidText));
  await db().delete(catalogSnapshots).where(eq(catalogSnapshots.businessId, bidText));
  await db().delete(learningMemories).where(eq(learningMemories.businessId, bidText));
  await db().delete(tenants).where(eq(tenants.businessId, bid));
  await db().delete(businesses).where(eq(businesses.id, bid));
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
