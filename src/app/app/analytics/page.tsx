import { and, eq, gte, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { handoffs, messages, orders } from "@/lib/db/schema";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { estimateSavings } from "@/lib/plans";
import { Card, Stat } from "@/components/ui";

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
    .select({ n: sql<number>`count(*)::int`, cost: sql<string>`coalesce(sum(${messages.costEstimate}), 0)` })
    .from(messages)
    .where(and(eq(messages.businessId, business.id), eq(messages.aiGenerated, true)));
  const [orderCount] = await d.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.businessId, business.id));
  const [handoffCount] = await d.select({ n: sql<number>`count(*)::int` }).from(handoffs).where(eq(handoffs.businessId, business.id));
  const savings = estimateSavings(aiTotal?.n ?? 0);
  const max = Math.max(1, ...daily.map((r) => r.total));

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

      <Card>
        <h2 className="font-semibold">Messages per day</h2>
        {daily.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--ink-soft)]">No messages in the last 30 days yet.</p>
        ) : (
          <div className="mt-4 flex h-40 items-end gap-1">
            {daily.map((r) => (
              <div key={r.day} className="group relative flex-1">
                <div className="w-full rounded-t bg-sky-200" style={{ height: `${(r.total / max) * 100}%`, minHeight: 2 }} />
                <div
                  className="absolute bottom-0 w-full rounded-t bg-gradient-to-t from-sky-500 to-cyan-400"
                  style={{ height: `${(r.ai / max) * 100}%`, minHeight: r.ai ? 2 : 0 }}
                />
                <div className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                  {r.day}: {r.total} msgs, {r.ai} AI
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-[var(--ink-soft)]">
          <span className="mr-3 inline-block h-2 w-2 rounded-full bg-gradient-to-t from-sky-500 to-cyan-400" /> AI replies
          <span className="mx-2 inline-block h-2 w-2 rounded-full bg-sky-200" /> All messages
        </p>
      </Card>

      <p className="text-xs text-[var(--ink-soft)]">
        Estimated AI cost so far: €{Number(aiTotal?.cost ?? 0).toFixed(2)}. Savings estimate assumes a €700/month support
        salary and ~2 minutes saved per AI-handled reply.
      </p>
    </main>
  );
}
