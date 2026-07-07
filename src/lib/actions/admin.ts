"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { adminAuditLogs, businesses, eventLogs, metaConnections, PLANS } from "../db/schema";
import { requireAdmin } from "../auth/guards";
import { encryptToken } from "../crypto";
import type { ActionState } from "./business";

async function audit(adminUserId: string, action: string, targetId: string, metadata: Record<string, unknown> = {}) {
  await db().insert(adminAuditLogs).values({ adminUserId, action, targetType: "business", targetId, metadata });
}

const AdminBusinessUpdate = z.object({
  businessId: z.string().uuid(),
  plan: z.enum(PLANS),
  status: z.enum(["active", "inactive"]),
  aiMode: z.enum(["draft", "live", "paused"]),
  handoffEnabled: z.coerce.boolean().default(false),
  selectedModel: z.enum(["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"]),
  dailyMessageLimit: z.coerce.number().int().min(0).max(1_000_000),
  monthlyMessageLimit: z.coerce.number().int().min(0).max(10_000_000),
  tone: z.string().max(40)
});

export async function adminUpdateBusinessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = AdminBusinessUpdate.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid values." };
  const { businessId, ...fields } = parsed.data;
  await db()
    .update(businesses)
    .set({ ...fields, aiEnabled: fields.aiMode !== "paused", updatedAt: new Date() })
    .where(eq(businesses.id, businessId));
  await audit(admin.userId, "business.update", businessId, fields);
  revalidatePath(`/admin/businesses/${businessId}`);
  return { ok: true };
}

const ManualConnection = z.object({
  businessId: z.string().uuid(),
  pageId: z.string().min(3).max(80),
  pageName: z.string().max(200).default(""),
  pageAccessToken: z.string().max(1000).default(""),
  instagramBusinessAccountId: z.string().max(80).default(""),
  instagramAccessToken: z.string().max(1000).default("")
});

/** Admin fallback when OAuth is not possible: paste IDs/tokens directly. */
export async function adminManualConnectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = ManualConnection.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Page ID is required (and tokens must be under 1000 chars)." };
  const data = parsed.data;

  const status = data.pageAccessToken ? (data.instagramBusinessAccountId ? "connected" : "partial") : "partial";
  const existing = await db().select().from(metaConnections).where(eq(metaConnections.pageId, data.pageId)).limit(1);
  const values = {
    businessId: data.businessId,
    clientId: data.businessId,
    pageId: data.pageId,
    pageName: data.pageName,
    instagramBusinessAccountId: data.instagramBusinessAccountId,
    status: status as "connected" | "partial",
    connectionType: "manual" as const,
    updatedAt: new Date(),
    ...(data.pageAccessToken ? { encryptedPageAccessToken: encryptToken(data.pageAccessToken) } : {}),
    ...(data.instagramAccessToken ? { encryptedInstagramAccessToken: encryptToken(data.instagramAccessToken) } : {})
  };
  if (existing[0]) {
    if (existing[0].businessId !== data.businessId) return { error: "This Page ID is already connected to another business." };
    await db().update(metaConnections).set(values).where(eq(metaConnections.id, existing[0].id));
  } else {
    await db().insert(metaConnections).values(values);
  }
  await audit(admin.userId, "connection.manual", data.businessId, { pageId: data.pageId, hasToken: Boolean(data.pageAccessToken) });
  await db().insert(eventLogs).values({
    businessId: data.businessId,
    level: "info",
    area: "meta_oauth",
    message: `Manual connection saved for page ${data.pageId} (${status})`,
    metadata: { by: admin.email }
  });
  revalidatePath(`/admin/businesses/${data.businessId}`);
  return { ok: true };
}
