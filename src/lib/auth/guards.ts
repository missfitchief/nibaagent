import "server-only";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "../db/client";
import { businesses, businessMembers, type MemberRole } from "../db/schema";
import { getSession, type SessionUser } from "./session";

/**
 * THE tenant-isolation chokepoint. Every server action / route handler that
 * touches business data goes through requireBusiness(), which resolves the
 * caller's EFFECTIVE ROLE for that business:
 *   - platform admin        -> "admin" (any business)
 *   - businesses.owner_user_id match -> "owner"
 *   - business_members row   -> its role (admin | agent | viewer)
 *   - otherwise              -> no access (redirect)
 * Nothing else may load a business row by id from user input.
 */

export async function requireUser(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireAdmin(): Promise<SessionUser> {
  const s = await getSession();
  if (!s || s.role !== "admin") redirect("/login");
  return s;
}

export type BusinessRow = typeof businesses.$inferSelect;
/** "admin" here means platform admin acting on a business (superset of owner). */
export type EffectiveRole = MemberRole | "admin";

const RANK: Record<EffectiveRole, number> = { viewer: 0, agent: 1, admin: 2, owner: 3 };
// Note: platform "admin" and business "owner" both get full access; we rank
// owner highest but treat admin>=agent for gate checks below.
const FULL_ACCESS: EffectiveRole[] = ["owner", "admin"];

export interface BusinessAccess {
  user: SessionUser;
  business: BusinessRow;
  role: EffectiveRole;
}

async function resolveAccess(businessId: string): Promise<BusinessAccess | null> {
  const user = await requireUser();
  if (user.role === "admin") {
    const rows = await db().select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
    return rows[0] ? { user, business: rows[0], role: "admin" } : null;
  }
  const rows = await db().select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const business = rows[0];
  if (!business) return null;
  if (business.ownerUserId === user.userId) return { user, business, role: "owner" };
  const member = (
    await db()
      .select({ role: businessMembers.role })
      .from(businessMembers)
      .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, user.userId)))
      .limit(1)
  )[0];
  if (member) return { user, business, role: member.role };
  return null; // not owner, not member, not admin
}

/** Loads the business + caller role, or redirects. Optional minimum role. */
export async function requireBusiness(businessId: string, minRole: MemberRole = "viewer"): Promise<BusinessAccess> {
  const access = await resolveAccess(businessId);
  if (!access) redirect("/app"); // never reveal whether the id exists
  const effective = access.role === "admin" ? 3 : RANK[access.role];
  if (effective < RANK[minRole]) redirect("/app"); // authenticated but under-privileged
  return access;
}

/** Secrets/keys: only owner or platform admin may read/manage. Agents/viewers 403. */
export function canManageSecrets(role: EffectiveRole): boolean {
  return FULL_ACCESS.includes(role);
}

/** Editing settings/products/knowledge: owner, platform admin, or business admin. */
export function canEdit(role: EffectiveRole): boolean {
  return role === "owner" || role === "admin";
}

/** Every business the caller can access (owned + member-of), for the app switcher. */
export async function accessibleBusinesses(user: SessionUser): Promise<BusinessRow[]> {
  if (user.role === "admin") return db().select().from(businesses);
  const owned = await db().select().from(businesses).where(eq(businesses.ownerUserId, user.userId));
  const memberRows = await db()
    .select({ business: businesses })
    .from(businessMembers)
    .innerJoin(businesses, eq(businessMembers.businessId, businesses.id))
    .where(eq(businessMembers.userId, user.userId));
  const seen = new Set(owned.map((b) => b.id));
  return [...owned, ...memberRows.map((r) => r.business).filter((b) => !seen.has(b.id))];
}

/** The client's primary business (owned first, else first membership), or null. */
export async function ownBusiness(user: SessionUser): Promise<BusinessRow | null> {
  const owned = await db().select().from(businesses).where(eq(businesses.ownerUserId, user.userId)).limit(1);
  if (owned[0]) return owned[0];
  const list = await accessibleBusinesses(user);
  return list[0] ?? null;
}
