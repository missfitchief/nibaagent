"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { businessMembers, businesses, eventLogs, users } from "../db/schema";
import { canEdit, requireBusiness } from "../auth/guards";

/** Members join via token invites (see invites.ts) — no direct add here. */

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
