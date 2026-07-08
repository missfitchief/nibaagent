"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { adminAuditLogs, botSettings, businesses, eventLogs, metaConnections, PLANS, subscriptions, users } from "../db/schema";
import { requireAdmin } from "../auth/guards";
import { hashPassword } from "../auth/password";
import { encryptToken, uuid } from "../crypto";
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
    .values({ ownerUserId: owner.id, name: parsed.data.name.trim(), slug, defaultLanguage: parsed.data.defaultLanguage })
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
