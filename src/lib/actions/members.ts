"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { adminAuditLogs, businessMembers, businesses, eventLogs, users } from "../db/schema";
import { canEdit, requireBusiness } from "../auth/guards";
import { hashPassword } from "../auth/password";
import { uuid } from "../crypto";
import type { ActionState } from "./business";

/** Add a member by email. Creates the user if they don't exist yet (invite). */
const AddMember = z.object({
  businessId: z.string().uuid(),
  email: z.string().email().max(200),
  role: z.enum(["admin", "agent", "viewer"]) // owner is the businesses.owner_user_id, not assignable here
});

export async function addMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = AddMember.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email and role." };
  const { user, business, role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return { error: "Only owner/admin can manage members." };

  const email = parsed.data.email.toLowerCase().trim();
  let member = (await db().select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!member) {
    // Invite stub: create a client user with a random password they must reset.
    const tempHash = await hashPassword(uuid() + uuid());
    member = (await db().insert(users).values({ email, name: email.split("@")[0], passwordHash: tempHash, role: "client" }).returning())[0];
  }
  if (member.id === business.ownerUserId) return { error: "That user is already the owner." };

  await db()
    .insert(businessMembers)
    .values({ businessId: business.id, userId: member.id, role: parsed.data.role })
    .onConflictDoUpdate({ target: [businessMembers.businessId, businessMembers.userId], set: { role: parsed.data.role } });

  await db().insert(eventLogs).values({ businessId: business.id, level: "info", area: "admin", message: `member added: ${email} (${parsed.data.role})`, metadata: { by: user.email } });
  if (user.role === "admin") {
    await db().insert(adminAuditLogs).values({ adminUserId: user.userId, action: "member.add", targetType: "business", targetId: business.id, metadata: { email, role: parsed.data.role } });
  }
  revalidatePath("/app/team");
  revalidatePath(`/admin/businesses/${business.id}`);
  return { ok: true };
}

const RemoveMember = z.object({ businessId: z.string().uuid(), userId: z.string().uuid() });

export async function removeMemberAction(formData: FormData): Promise<void> {
  const parsed = RemoveMember.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { user, business, role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return;
  if (parsed.data.userId === business.ownerUserId) return; // can't remove the owner
  await db().delete(businessMembers).where(and(eq(businessMembers.businessId, business.id), eq(businessMembers.userId, parsed.data.userId)));
  await db().insert(eventLogs).values({ businessId: business.id, level: "info", area: "admin", message: "member removed", metadata: { by: user.email, userId: parsed.data.userId } });
  revalidatePath("/app/team");
  revalidatePath(`/admin/businesses/${business.id}`);
}

export interface MemberView {
  userId: string;
  email: string;
  name: string;
  role: string;
  isOwner: boolean;
}

export async function listMembers(businessId: string): Promise<MemberView[]> {
  const [biz] = await db().select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) return [];
  const owner = (await db().select().from(users).where(eq(users.id, biz.ownerUserId)).limit(1))[0];
  const rows = await db()
    .select({ role: businessMembers.role, u: users })
    .from(businessMembers)
    .innerJoin(users, eq(businessMembers.userId, users.id))
    .where(eq(businessMembers.businessId, businessId));
  const out: MemberView[] = [];
  if (owner) out.push({ userId: owner.id, email: owner.email, name: owner.name, role: "owner", isOwner: true });
  for (const r of rows) out.push({ userId: r.u.id, email: r.u.email, name: r.u.name, role: r.role, isOwner: false });
  return out;
}
