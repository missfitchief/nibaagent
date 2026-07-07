"use server";

import { and, count, eq, gte, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db/client";
import {
  botSettings,
  businesses,
  conversations,
  handoffs,
  messages,
  metaConnections,
  orders,
  subscriptions
} from "../db/schema";
import { requireBusiness, requireUser, ownBusiness } from "../auth/guards";

const BusinessCreate = z.object({
  name: z.string().min(2).max(120),
  defaultLanguage: z.enum(["en", "sr", "bs", "hr"]).default("sr"),
  tone: z.string().max(40).default("friendly")
});

export interface ActionState {
  error?: string;
  ok?: boolean;
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

export async function createBusinessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = BusinessCreate.safeParse({
    name: formData.get("name"),
    defaultLanguage: formData.get("defaultLanguage") ?? "sr",
    tone: formData.get("tone") ?? "friendly"
  });
  if (!parsed.success) return { error: "Please enter a business name (at least 2 characters)." };

  const existing = await ownBusiness(user);
  if (existing) redirect("/app");

  let slug = slugify(parsed.data.name);
  const clash = await db().select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug)).limit(1);
  if (clash[0]) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const [biz] = await db()
    .insert(businesses)
    .values({
      ownerUserId: user.userId,
      name: parsed.data.name.trim(),
      slug,
      defaultLanguage: parsed.data.defaultLanguage,
      tone: parsed.data.tone
    })
    .returning();
  await db().insert(botSettings).values({ businessId: biz.id, tone: parsed.data.tone });
  await db().insert(subscriptions).values({ businessId: biz.id, plan: "free", status: "trial" });
  redirect("/app");
}

/** Everything the client dashboard needs, scoped to ONE business. */
export async function dashboardData(businessId: string) {
  const { business } = await requireBusiness(businessId);
  const d = db();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [msgToday] = await d
    .select({ n: count() })
    .from(messages)
    .where(and(eq(messages.businessId, business.id), gte(messages.createdAt, today)));
  const [aiToday] = await d
    .select({ n: count() })
    .from(messages)
    .where(and(eq(messages.businessId, business.id), eq(messages.aiGenerated, true), gte(messages.createdAt, today)));
  const [convs] = await d.select({ n: count() }).from(conversations).where(eq(conversations.businessId, business.id));
  const [ordersTotal] = await d.select({ n: count() }).from(orders).where(eq(orders.businessId, business.id));
  const [handoffOpen] = await d
    .select({ n: count() })
    .from(handoffs)
    .where(and(eq(handoffs.businessId, business.id), eq(handoffs.status, "open")));
  const [aiAllTime] = await d
    .select({ n: count() })
    .from(messages)
    .where(and(eq(messages.businessId, business.id), eq(messages.aiGenerated, true)));
  const connections = await d.select().from(metaConnections).where(eq(metaConnections.businessId, business.id));
  const recentHandoffs = await d
    .select()
    .from(handoffs)
    .where(eq(handoffs.businessId, business.id))
    .orderBy(sql`${handoffs.createdAt} desc`)
    .limit(5);
  const recentOrders = await d
    .select()
    .from(orders)
    .where(eq(orders.businessId, business.id))
    .orderBy(sql`${orders.createdAt} desc`)
    .limit(5);

  return {
    business,
    stats: {
      messagesToday: msgToday?.n ?? 0,
      aiRepliesToday: aiToday?.n ?? 0,
      conversations: convs?.n ?? 0,
      orders: ordersTotal?.n ?? 0,
      handoffsOpen: handoffOpen?.n ?? 0,
      aiRepliesAllTime: aiAllTime?.n ?? 0
    },
    connections,
    recentHandoffs,
    recentOrders
  };
}
