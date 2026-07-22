"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { adminAuditLogs, botSettings, businesses, eventLogs, metaConnections, PLANS, subscriptions, users } from "../db/schema";
import { requireAdmin } from "../auth/guards";
import { hashPassword } from "../auth/password";
import { encryptToken, decryptToken, uuid } from "../crypto";
import { sanitizeModel, APP_DEFAULT_MODEL } from "../models";
import { clientIdFor } from "../tenant";
import { subscribePageToApp } from "../meta";
import type { ActionState } from "./business";

async function audit(adminUserId: string, action: string, targetId: string, metadata: Record<string, unknown> = {}) {
  await db().insert(adminAuditLogs).values({ adminUserId, action, targetType: "business", targetId, metadata });
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "business"
  );
}

const AdminCreateBusiness = z.object({
  name: z.string().min(2).max(120),
  ownerEmail: z.string().email().max(200),
  defaultLanguage: z.enum(["en", "sr", "bs", "hr"]).default("sr")
});

/** Admin creates a business and its owner (creating the owner user if needed). */
export async function adminCreateBusinessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = AdminCreateBusiness.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a business name and a valid owner email." };
  const email = parsed.data.ownerEmail.toLowerCase().trim();

  let owner = (await db().select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!owner) {
    owner = (await db().insert(users).values({ email, name: email.split("@")[0], passwordHash: await hashPassword(uuid() + uuid()), role: "client" }).returning())[0];
  }

  let slug = slugify(parsed.data.name);
  if ((await db().select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug)).limit(1))[0]) {
    slug = `${slug}-${uuid().slice(0, 4)}`;
  }
  const [biz] = await db()
    .insert(businesses)
    .values({ ownerUserId: owner.id, name: parsed.data.name.trim(), slug, clientId: slugify(parsed.data.name), defaultLanguage: parsed.data.defaultLanguage })
    .returning();
  await db().insert(botSettings).values({ businessId: biz.id, tone: "friendly" });
  await db().insert(subscriptions).values({ businessId: biz.id, plan: "free", status: "trial" });
  await audit(admin.userId, "business.create", biz.id, { name: biz.name, ownerEmail: email });
  redirect(`/admin/businesses/${biz.id}`);
}

const AdminProfile = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(2).max(120),
  defaultLanguage: z.enum(["en", "sr", "bs", "hr"]),
  website: z.string().max(300).default(""),
  industry: z.string().max(80).default("")
});

/** Edit business profile (name/language + website/industry stored in bot custom notes). */
export async function adminUpdateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = AdminProfile.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid profile." };
  await db().update(businesses).set({ name: parsed.data.name.trim(), defaultLanguage: parsed.data.defaultLanguage, updatedAt: new Date() }).where(eq(businesses.id, parsed.data.businessId));
  await audit(admin.userId, "business.profile", parsed.data.businessId, { website: parsed.data.website, industry: parsed.data.industry });
  revalidatePath(`/admin/businesses/${parsed.data.businessId}`);
  return { ok: true };
}

const AdminBusinessUpdate = z.object({
  businessId: z.string().uuid(),
  plan: z.enum(PLANS),
  status: z.enum(["active", "inactive"]),
  aiMode: z.enum(["draft", "live", "paused"]),
  handoffEnabled: z.coerce.boolean().default(false),
  // Free-text model name — NO hard allow-list; unknown/future models are accepted.
  aiProvider: z.enum(["openai", "anthropic"]).default("openai"),
  selectedModel: z.string().max(120).default("gpt-4o-mini"),
  dailyMessageLimit: z.coerce.number().int().min(0).max(1_000_000),
  monthlyMessageLimit: z.coerce.number().int().min(0).max(10_000_000),
  tone: z.string().max(40),
  /** n8n tenant id (e.g. "starlight"). Blank = leave as-is. */
  clientId: z.string().max(60).default("")
});

export async function adminUpdateBusinessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = AdminBusinessUpdate.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid values." };
  const { businessId, aiProvider, selectedModel, clientId, ...rest } = parsed.data;
  const model = sanitizeModel(selectedModel) || APP_DEFAULT_MODEL[aiProvider];
  // Normalize the n8n client id; blank leaves the existing value untouched.
  const normalizedClientId = slugify(clientId);
  await db()
    .update(businesses)
    .set({ ...rest, selectedModel: model, aiEnabled: rest.aiMode !== "paused", ...(normalizedClientId ? { clientId: normalizedClientId } : {}), updatedAt: new Date() })
    .where(eq(businesses.id, businessId));
  // Keep the subscription row on the same plan — businesses.plan and
  // subscriptions.plan must never drift apart.
  await db()
    .insert(subscriptions)
    .values({ businessId, plan: rest.plan, status: "active" })
    .onConflictDoUpdate({ target: subscriptions.businessId, set: { plan: rest.plan, updatedAt: new Date() } });
  // Provider lives on bot_settings — keep it in sync (row exists for every business).
  await db().update(botSettings).set({ aiProvider, updatedAt: new Date() }).where(eq(botSettings.businessId, businessId));
  // If the tenant id changed, propagate it to meta_connections (client_id is the
  // tenant key the webhook/reply path resolves by).
  if (normalizedClientId) {
    await db().update(metaConnections).set({ clientId: normalizedClientId, updatedAt: new Date() }).where(eq(metaConnections.businessId, businessId));
  }
  await audit(admin.userId, "business.update", businessId, { ...rest, aiProvider, selectedModel: model, clientId: normalizedClientId || undefined });
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

  // n8n treats status='active' as connected; it reads the PLAINTEXT token columns.
  const status = data.pageAccessToken ? "active" : "partial";
  const [biz] = await db().select().from(businesses).where(eq(businesses.id, data.businessId)).limit(1);
  if (!biz) return { error: "Business not found." };
  const clientId = clientIdFor(biz); // stable n8n tenant id, e.g. "starlight"
  const existing = await db().select().from(metaConnections).where(eq(metaConnections.pageId, data.pageId)).limit(1);
  const values = {
    businessId: data.businessId,
    clientId, // n8n tenant id (not the UUID)
    pageId: data.pageId,
    pageName: data.pageName,
    instagramBusinessAccountId: data.instagramBusinessAccountId,
    businessName: biz.name,
    plan: biz.plan,
    status: status as "active" | "partial",
    connectionType: "manual" as const,
    updatedAt: new Date(),
    // Tokens are stored ONLY encrypted at rest (no plaintext columns).
    ...(data.pageAccessToken ? { encryptedPageAccessToken: encryptToken(data.pageAccessToken) } : {}),
    ...(data.instagramAccessToken ? { encryptedInstagramAccessToken: encryptToken(data.instagramAccessToken) } : {})
  };
  // Fail loud: surface the real DB error instead of a false success.
  try {
    if (existing[0]) {
      if (existing[0].businessId !== data.businessId) return { error: "This Page ID is already connected to another business." };
      await db().update(metaConnections).set(values).where(eq(metaConnections.id, existing[0].id));
    } else {
      await db().insert(metaConnections).values(values);
    }
  } catch (err) {
    await db().insert(eventLogs).values({ businessId: data.businessId, level: "error", area: "meta_oauth", message: `Manual connection DB write FAILED for page ${data.pageId}: ${(err as Error).message}`, metadata: { by: admin.email } });
    return { error: `Database write failed: ${(err as Error).message}` };
  }
  await audit(admin.userId, "connection.manual", data.businessId, { pageId: data.pageId, clientId, hasToken: Boolean(data.pageAccessToken) });
  await db().insert(eventLogs).values({
    businessId: data.businessId,
    level: "info",
    area: "meta_oauth",
    message: `Manual connection saved for page ${data.pageId} (client_id=${clientId}, ${status})`,
    metadata: { by: admin.email, clientId }
  });
  revalidatePath(`/admin/businesses/${data.businessId}`);
  return { ok: true };
}

const MoveConnection = z.object({ businessId: z.string().uuid(), pageId: z.string().min(1).max(120) });

/**
 * Reassign a Facebook Page (already connected to another tenant) to THIS business.
 * Platform-admin only — normal clients can never move connections between tenants.
 */
export async function adminMoveConnectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = MoveConnection.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };
  const { businessId, pageId } = parsed.data;
  const [biz] = await db().select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) return { error: "Business not found." };
  const [existing] = await db().select().from(metaConnections).where(eq(metaConnections.pageId, pageId)).limit(1);
  if (!existing) return { error: "No connection found for that page id." };
  const clientId = clientIdFor(biz);
  await db()
    .update(metaConnections)
    .set({ businessId, clientId, businessName: biz.name, plan: biz.plan, status: "active", updatedAt: new Date() })
    .where(eq(metaConnections.pageId, pageId));
  await audit(admin.userId, "connection.move", businessId, { pageId, fromClientId: existing.clientId, toClientId: clientId });
  await db().insert(eventLogs).values({ businessId, level: "warn", area: "meta_oauth", message: `Connection for page ${pageId} moved to client_id=${clientId} (from ${existing.clientId})`, metadata: { by: admin.email } });
  revalidatePath(`/admin/businesses/${businessId}`);
  return { ok: true };
}

const Resubscribe = z.object({ businessId: z.string().uuid() });

/**
 * Re-run the Meta webhook subscription for this business's connected page.
 * Meta can silently drop a page's subscription (token rotation, page re-auth
 * on the customer's side, app review changes) with no error on our end —
 * the first sign is customer messages just never arriving. Re-POSTing
 * subscribed_apps is safe to run any time, subscribed or not.
 */
export async function adminResubscribeWebhookAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = Resubscribe.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };
  const [conn] = await db().select().from(metaConnections).where(eq(metaConnections.businessId, parsed.data.businessId)).limit(1);
  if (!conn) return { error: "No connection found for this business." };
  if (!conn.encryptedPageAccessToken) return { error: "No page access token stored for this connection." };
  try {
    const pageToken = decryptToken(conn.encryptedPageAccessToken);
    await subscribePageToApp(conn.pageId, pageToken);
  } catch (err) {
    await db().insert(eventLogs).values({ businessId: parsed.data.businessId, level: "error", area: "meta_oauth", message: `Manual re-subscribe failed for page ${conn.pageId}: ${(err as Error).message}`, metadata: { by: admin.email } });
    return { error: `Re-subscribe failed: ${(err as Error).message}` };
  }
  await audit(admin.userId, "connection.resubscribe", parsed.data.businessId, { pageId: conn.pageId });
  await db().insert(eventLogs).values({ businessId: parsed.data.businessId, level: "info", area: "meta_oauth", message: `Webhook re-subscribed for page ${conn.pageId} (manual, by ${admin.email})` });
  revalidatePath(`/admin/businesses/${parsed.data.businessId}`);
  return { ok: true };
}

const ResetCostTracking = z.object({ businessId: z.string().uuid() });

/**
 * Sets businesses.costTrackingSince = now(). The AI-cost stats (all-time +
 * daily/7d/30d) on the Overview tab clamp to this point instead of showing
 * pre-reset numbers — for when a business switches to its own API key, or
 * any time the historical estimate is known to be unreliable (e.g. it was
 * computed against a wrong per-model price). Never rewrites past message
 * rows — this only changes what the aggregate queries include.
 */
export async function resetCostTrackingAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = ResetCostTracking.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await db().update(businesses).set({ costTrackingSince: new Date() }).where(eq(businesses.id, parsed.data.businessId));
  await audit(admin.userId, "business.cost_tracking_reset", parsed.data.businessId, {});
  revalidatePath(`/admin/businesses/${parsed.data.businessId}`);
}
