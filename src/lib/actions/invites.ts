"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { adminAuditLogs, businessMembers, businesses, eventLogs, invites, users } from "../db/schema";
import { canEdit, requireBusiness } from "../auth/guards";
import { hashPassword } from "../auth/password";
import { uuid } from "../crypto";
import { env } from "../env";
import type { ActionState } from "./business";

const INVITE_TTL_DAYS = 7;

export interface InviteState extends ActionState {
  inviteUrl?: string;
}

const CreateInvite = z.object({
  businessId: z.string().uuid(),
  email: z.string().email().max(200),
  role: z.enum(["admin", "agent", "viewer"])
});

/** Owner/admin creates a token invite. Returns a copyable link (no email dep). */
export async function createInviteAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const parsed = CreateInvite.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email and role." };
  const { user, business, role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return { error: "Only owner/admin can invite." };

  const email = parsed.data.email.toLowerCase().trim();
  const token = uuid().replace(/-/g, "") + uuid().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000);
  await db().insert(invites).values({
    businessId: business.id,
    email,
    role: parsed.data.role,
    token,
    invitedByUserId: user.userId,
    expiresAt
  });
  await db().insert(eventLogs).values({ businessId: business.id, level: "info", area: "admin", message: `invite created: ${email} (${parsed.data.role})`, metadata: { by: user.email } });

  const base = env().APP_URL.replace(/\/$/, "");
  revalidatePath("/app/team");
  revalidatePath(`/admin/businesses/${business.id}`);
  // Email delivery is not configured; hand back a copyable link.
  return { ok: true, inviteUrl: `${base}/invite/${token}` };
}

const RevokeInvite = z.object({ businessId: z.string().uuid(), inviteId: z.string().uuid() });

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const parsed = RevokeInvite.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { role, business } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return;
  await db()
    .update(invites)
    .set({ status: "revoked" })
    .where(and(eq(invites.id, parsed.data.inviteId), eq(invites.businessId, business.id), eq(invites.status, "pending")));
  revalidatePath("/app/team");
  revalidatePath(`/admin/businesses/${business.id}`);
}

export interface InviteInfo {
  valid: boolean;
  reason?: string;
  email?: string;
  businessName?: string;
  businessId?: string;
  role?: string;
}

/** Public: validate a token for the accept page (no auth). */
export async function inspectInvite(token: string): Promise<InviteInfo> {
  const inv = (await db().select().from(invites).where(eq(invites.token, token)).limit(1))[0];
  if (!inv) return { valid: false, reason: "This invite link is not valid." };
  if (inv.status === "revoked") return { valid: false, reason: "This invite was revoked." };
  if (inv.status === "accepted") return { valid: false, reason: "This invite was already used." };
  if (inv.expiresAt.getTime() < Date.now()) return { valid: false, reason: "This invite has expired." };
  const biz = (await db().select({ name: businesses.name }).from(businesses).where(eq(businesses.id, inv.businessId)).limit(1))[0];
  return { valid: true, email: inv.email, businessName: biz?.name, businessId: inv.businessId, role: inv.role };
}

const AcceptInvite = z.object({ token: z.string().min(10).max(200), password: z.string().min(8).max(200) });

/** Public: invitee sets a password and joins the business with the invited role. */
export async function acceptInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = AcceptInvite.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a password of at least 8 characters." };
  const info = await inspectInvite(parsed.data.token);
  if (!info.valid || !info.email || !info.businessId) return { error: info.reason ?? "Invalid invite." };

  const inv = (await db().select().from(invites).where(eq(invites.token, parsed.data.token)).limit(1))[0]!;
  let member = (await db().select().from(users).where(eq(users.email, info.email)).limit(1))[0];
  if (!member) {
    // Only a NEW account gets the submitted password. An existing user keeps
    // their own password — accepting an invite must never overwrite credentials.
    const hash = await hashPassword(parsed.data.password);
    member = (await db().insert(users).values({ email: info.email, name: info.email.split("@")[0], passwordHash: hash, role: "client" }).returning())[0];
  }
  await db()
    .insert(businessMembers)
    .values({ businessId: inv.businessId, userId: member.id, role: inv.role })
    .onConflictDoUpdate({ target: [businessMembers.businessId, businessMembers.userId], set: { role: inv.role } });
  await db().update(invites).set({ status: "accepted", acceptedAt: new Date() }).where(eq(invites.id, inv.id));
  await db().insert(eventLogs).values({ businessId: inv.businessId, level: "info", area: "admin", message: `invite accepted: ${info.email}` });
  await db().insert(adminAuditLogs).values({ adminUserId: member.id, action: "invite.accept", targetType: "business", targetId: inv.businessId, metadata: { role: inv.role } });
  return { ok: true };
}

/** For the team page — pending invites of a business. */
export async function listPendingInvites(businessId: string) {
  const rows = await db().select().from(invites).where(and(eq(invites.businessId, businessId), eq(invites.status, "pending")));
  return rows.filter((r) => r.expiresAt.getTime() >= Date.now());
}
