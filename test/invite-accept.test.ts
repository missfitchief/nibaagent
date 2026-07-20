import { describe, it, expect, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeDb, seedBusiness, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { acceptInviteAction } from "../src/lib/actions/invites";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";

/**
 * Regression: accepting an invite for an email that ALREADY has an account must
 * only add the membership (with the invited role) — never overwrite the user's
 * password. Previously the accept flow silently replaced the existing password
 * hash (account takeover via invite token).
 */

let db: TestDb;
beforeEach(async () => {
  db = await makeDb();
});

async function makeInvite(businessId: string, email: string, role: "admin" | "agent" | "viewer" = "agent") {
  const token = "tok_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  await db.insert(schema.invites).values({
    businessId,
    email,
    role,
    token,
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 86400_000)
  });
  return token;
}

function form(token: string, password: string): FormData {
  const fd = new FormData();
  fd.set("token", token);
  fd.set("password", password);
  return fd;
}

describe("invite accept — existing user keeps their password", () => {
  it("does NOT overwrite an existing user's password; adds membership with the invited role", async () => {
    const A = await seedBusiness(db, "Alpha");
    const originalHash = await hashPassword("original-password-1");
    const [existing] = await db
      .insert(schema.users)
      .values({ email: "teammate@test.local", name: "Teammate", passwordHash: originalHash, role: "client" })
      .returning();

    const token = await makeInvite(A.business.id, "teammate@test.local", "viewer");
    const res = await acceptInviteAction({}, form(token, "attacker-chosen-password"));

    expect(res.ok).toBe(true);
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, existing.id));
    expect(after.passwordHash).toBe(originalHash); // untouched
    expect(await verifyPassword("attacker-chosen-password", after.passwordHash)).toBe(false);
    expect(await verifyPassword("original-password-1", after.passwordHash)).toBe(true);

    const [membership] = await db
      .select()
      .from(schema.businessMembers)
      .where(and(eq(schema.businessMembers.businessId, A.business.id), eq(schema.businessMembers.userId, existing.id)));
    expect(membership.role).toBe("viewer"); // invited role respected
  });

  it("a NEW user gets the submitted password and the invited role", async () => {
    const A = await seedBusiness(db, "Alpha");
    const token = await makeInvite(A.business.id, "newbie@test.local", "admin");
    const res = await acceptInviteAction({}, form(token, "fresh-password-9"));
    expect(res.ok).toBe(true);

    const [created] = await db.select().from(schema.users).where(eq(schema.users.email, "newbie@test.local"));
    expect(await verifyPassword("fresh-password-9", created.passwordHash)).toBe(true);
    const [membership] = await db
      .select()
      .from(schema.businessMembers)
      .where(and(eq(schema.businessMembers.businessId, A.business.id), eq(schema.businessMembers.userId, created.id)));
    expect(membership.role).toBe("admin");
  });

  it("re-accepting with a different invited role updates the membership, still not the password", async () => {
    const A = await seedBusiness(db, "Alpha");
    const originalHash = await hashPassword("mine-password-1");
    const [existing] = await db
      .insert(schema.users)
      .values({ email: "member@test.local", name: "M", passwordHash: originalHash, role: "client" })
      .returning();
    await db.insert(schema.businessMembers).values({ businessId: A.business.id, userId: existing.id, role: "viewer" });

    const token = await makeInvite(A.business.id, "member@test.local", "agent");
    const res = await acceptInviteAction({}, form(token, "whatever-password-1"));
    expect(res.ok).toBe(true);

    const [membership] = await db
      .select()
      .from(schema.businessMembers)
      .where(and(eq(schema.businessMembers.businessId, A.business.id), eq(schema.businessMembers.userId, existing.id)));
    expect(membership.role).toBe("agent");
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, existing.id));
    expect(after.passwordHash).toBe(originalHash);
  });
});
