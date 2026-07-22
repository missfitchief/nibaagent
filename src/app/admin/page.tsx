import Link from "next/link";
import { count, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { businesses, handoffs, messages, orders, users } from "@/lib/db/schema";
import { Badge, Card, Stat } from "@/components/ui";

export default async function AdminOverview() {
  await requireAdmin();
  const d = db();

  const [bizCount] = await d.select({ n: count() }).from(businesses);
  const [userCount] = await d.select({ n: count() }).from(users);
  const [msgCount] = await d.select({ n: count() }).from(messages);
  const [aiCount] = await d.select({ n: count() }).from(messages).where(eq(messages.aiGenerated, true));
  const [orderCount] = await d.select({ n: count() }).from(orders);
  const [handoffCount] = await d.select({ n: count() }).from(handoffs);
  const [costRow] = await d.select({ c: sql<string>`coalesce(sum(${messages.costEstimate}), 0)` }).from(messages);

  const latest = await d.select().from(businesses).orderBy(sql`${businesses.createdAt} desc`).limit(8);

  return (
    <main className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Control center</h1>
          <p className="text-sm text-[var(--ink-soft)]">Platform-wide view across every business.</p>
        </div>
        <Link href="/admin/businesses" className="btn-primary rounded-xl px-4 py-2 text-sm font-medium">
          Manage businesses
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <Stat label="Businesses" value={bizCount?.n ?? 0} />
        <Stat label="Users" value={userCount?.n ?? 0} />
        <Stat label="Messages" value={msgCount?.n ?? 0} />
        <Stat label="AI replies" value={aiCount?.n ?? 0} />
        <Stat label="Orders" value={orderCount?.n ?? 0} />
        <Stat label="Handoffs" value={handoffCount?.n ?? 0} />
        <Stat label="Est. AI cost" value={`$${Number(costRow?.c ?? 0).toFixed(2)}`} />
      </section>

      <Card>
        <h2 className="font-semibold">Newest businesses</h2>
        {latest.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--ink-soft)]">No businesses yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--ink-soft)]">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Plan</th>
                  <th className="py-2 pr-4">AI</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {latest.map((b) => (
                  <tr key={b.id} className="border-t border-[var(--card-border)]">
                    <td className="py-2 pr-4 font-medium">{b.name}</td>
                    <td className="py-2 pr-4">{b.plan}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={b.aiMode === "live" ? "ok" : b.aiMode === "draft" ? "info" : "warn"}>{b.aiMode}</Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={b.status === "active" ? "ok" : "neutral"}>{b.status}</Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <Link href={`/admin/businesses/${b.id}`} className="text-sky-600 hover:underline">
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
