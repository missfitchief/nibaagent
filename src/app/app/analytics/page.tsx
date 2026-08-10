import { and, eq, gte, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { handoffs, messages, orders } from "@/lib/db/schema";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { estimateSavings } from "@/lib/plans";
import { Card, Stat } from "@/components/ui";
import { MessagesChart } from "./messages-chart";
import { fillDailySeries } from "./daily-series";

export default async function AnalyticsPage() {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");
  const d = db();

  // Daily message/AI-reply counts for the last 30 days — computed LIVE from the
  // messages table (no rollup job). The date window is computed in SQL so the
  // render stays pure.
  const daily = await d
    .select({
      day: sql<string>`to_char(${messages.createdAt}, 'YYYY-MM-DD')`,
      total: sql<number>`count(*)::int`,
      ai: sql<number>`count(*) filter (where ${messages.aiGenerated})::int`
    })
    .from(messages)
    .where(and(eq(messages.businessId, business.id), gte(messages.createdAt, sql`now() - interval '30 days'`)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const [aiTotal] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.businessId, business.id), eq(messages.aiGenerated, true)));
  const [orderCount] = await d.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.businessId, business.id));
  const [handoffCount] = await d.select({ n: sql<number>`count(*)::int` }).from(handoffs).where(eq(handoffs.businessId, business.id));
  const savings = estimateSavings(aiTotal?.n ?? 0);

  const series = fillDailySeries(daily);
  const today = series[series.length - 1];
  const yesterday = series[series.length - 2];
  const dayBefore = series[series.length - 3];
  const thisWeek = series.slice(-7).reduce((sum, r) => sum + r.total, 0);

  return (
    <main className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-[var(--ink-soft)]">Last 30 days.</p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="AI replies (all time)" value={aiTotal?.n ?? 0} />
        <Stat label="Orders" value={orderCount?.n ?? 0} />
        <Stat label="Handoffs" value={handoffCount?.n ?? 0} />
        <Stat label="Est. saved" value={`€${savings.savedEur}`} hint={`≈ ${Math.round(savings.savedMinutes / 60)}h (estimate)`} tone="ok" />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today" value={today.total} hint={`${today.ai} by AI`} />
        <Stat label="Yesterday" value={yesterday.total} hint={`${yesterday.ai} by AI`} />
        <Stat label="Day before yesterday" value={dayBefore.total} hint={`${dayBefore.ai} by AI`} />
        <Stat label="This week (7 days)" value={thisWeek} />
      </section>

      <Card>
        <h2 className="font-semibold">Messages per day</h2>
        <p className="mt-1 text-xs text-[var(--ink-soft)]">Last 30 days — hover the line for exact numbers on any day.</p>
        <div className="mt-4">
          <MessagesChart daily={series} />
        </div>
      </Card>

      <p className="text-xs text-[var(--ink-soft)]">
        Savings estimate assumes a €700/month support salary and ~2 minutes saved per AI-handled reply.
      </p>
    </main>
  );
}
