import "server-only";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "../db/client";
import { businesses } from "../db/schema";
import { getSession, type SessionUser } from "./session";

/**
 * THE tenant-isolation chokepoint. Every server action / route handler that
 * touches business data goes through requireBusiness(), which verifies the
 * session user OWNS the business (or is admin). Nothing else may load a
 * business row by id from user input.
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

/** Loads the business ONLY if the caller owns it (clients) or is admin. */
export async function requireBusiness(businessId: string): Promise<{ user: SessionUser; business: BusinessRow }> {
  const user = await requireUser();
  const rows =
    user.role === "admin"
      ? await db().select().from(businesses).where(eq(businesses.id, businessId)).limit(1)
      : await db()
          .select()
          .from(businesses)
          .where(and(eq(businesses.id, businessId), eq(businesses.ownerUserId, user.userId)))
          .limit(1);
  const business = rows[0];
  if (!business) redirect("/app"); // never reveal whether the id exists
  return { user, business };
}

/** The client's own (single) business, or null if none created yet. */
export async function ownBusiness(user: SessionUser): Promise<BusinessRow | null> {
  const rows = await db().select().from(businesses).where(eq(businesses.ownerUserId, user.userId)).limit(1);
  return rows[0] ?? null;
}
