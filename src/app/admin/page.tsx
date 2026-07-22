import Link from "next/link";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { businesses, eventLogs, messages, metaConnections } from "@/lib/db/schema";
import { resolveAllErrorLogsAction } from "@/lib/actions/logs";
import { Badge, Card, Stat } from "@/components/ui";

export default async function AdminOverview() {
  await requireAdmin();
  const d = db();

  const [bizCount] = await d.select({ n: count() }).from(businesses);

  // Connection health — the thing that actually breaks a client's bot (broken
  // webhook/token) without anyone noticing until a customer complains. See at
  // a glance instead of manually running Test connection on every business.
  const [connStats] = await d
    .select({
      total: count(),
      errored: sql<number>`count(*) filter (where ${metaConnections.status} = 'error')::int`
    })
    .from(metaConnections);
  const brokenConnections = await d
    .select({ businessId: metaConnections.businessId, businessName: metaConnections.businessName, pageId: metaConnections.pageId })
    .from(metaConnections)
    .where(eq(metaConnections.status, "error"));

  const [unresolvedErrors] = await d
    .select({ n: count() })
    .from(eventLogs)
    .where(and(eq(eventLogs.level, "error"), isNull(eventLogs.resolvedAt)));

  const [cost30d] = await d
    .select({ c: sql<string>`coalesce(sum(${messages.costEstimate}) filter (where ${messages.createdAt} >= now() - interval '30 days'), 0)` })
    .from(messages);

  const latest = await d.select().from(businesses).orderBy(desc(businesses.createdAt)).limit(8);
  const needsAttention = brokenConnections.length > 0 || (unresolvedErrors?.n ?? 0) > 0;

  return (
    <main className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Control center</h1>
          <p className="text-sm text-[var(--ink-soft)]">Platform health across every business.</p>
        </div>
        <Link href="/admin/businesses" className="btn-primary rounded-xl px-4 py-2 text-sm font-medium">
          Manage businesses
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Businesses" value={bizCount?.n ?? 0} />
        <Stat
          label="Broken connections"
          value={connStats?.errored ?? 0}
          tone={connStats?.errored ? "warn" : "ok"}
          hint={`of ${connStats?.total ?? 0} connected`}
        />
        <Stat label="Unresolved errors" value={unresolvedErrors?.n ?? 0} tone={unresolvedErrors?.n ? "warn" : "ok"} />
        <Stat label="AI cost — 30 days" value={`$${Number(cost30d?.c ?? 0).toFixed(2)}`} />
      </section>

      {needsAttention ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <h2 className="font-semibold text-amber-800">Needs attention</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {brokenConnections.map((c) => (
              <li key={c.businessId}>
                <Badge tone="error">connection</Badge>{" "}
                <Link href={`/admin/businesses/${c.businessId}?tab=channels`} className="text-sky-600 hover:underline">
                  {c.businessName || c.pageId}
                </Link>{" "}
                — page/token needs reconnecting
              </li>
            ))}
            {(unresolvedErrors?.n ?? 0) > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Badge tone="error">errors</Badge>{" "}
                  <Link href="/admin/logs?level=error" className="text-sky-600 hover:underline">
                    {unresolvedErrors!.n} unresolved error{unresolvedErrors!.n === 1 ? "" : "s"} across the platform
                  </Link>
                </span>
                <form action={resolveAllErrorLogsAction}>
                  <button className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-100">
                    Mark all resolved
                  </button>
                </form>
              </li>
            )}
          </ul>
        </Card>
      ) : (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <p className="text-sm text-emerald-800">✓ All connections healthy, no unresolved errors.</p>
        </Card>
      )}

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
