import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { businesses, eventLogs, handoffs, messages, metaConnections, orders, users } from "@/lib/db/schema";
import { estimateSavings } from "@/lib/plans";
import { maskToken } from "@/lib/crypto";
import { Badge, Card, Stat } from "@/components/ui";
import { AdminBusinessForm, ManualConnectionForm } from "./forms";

export default async function AdminBusinessDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const d = db();
  const [biz] = await d.select().from(businesses).where(eq(businesses.id, id)).limit(1);
  if (!biz) notFound();

  const [owner] = await d.select({ email: users.email }).from(users).where(eq(users.id, biz.ownerUserId)).limit(1);
  const [msg] = await d
    .select({
      n: sql<number>`count(*)::int`,
      ai: sql<number>`count(*) filter (where ${messages.aiGenerated})::int`,
      cost: sql<string>`coalesce(sum(${messages.costEstimate}), 0)`,
      tokens: sql<number>`coalesce(sum(${messages.tokenUsageEstimate}), 0)::int`
    })
    .from(messages)
    .where(eq(messages.businessId, id));
  const [orderCount] = await d.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.businessId, id));
  const [handoffOpen] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(handoffs)
    .where(and(eq(handoffs.businessId, id), eq(handoffs.status, "open")));
  const connections = await d.select().from(metaConnections).where(eq(metaConnections.businessId, id));
  const logs = await d.select().from(eventLogs).where(eq(eventLogs.businessId, id)).orderBy(desc(eventLogs.createdAt)).limit(10);
  const savings = estimateSavings(msg?.ai ?? 0);
  const handoffRate = (msg?.n ?? 0) > 0 ? Math.round(((handoffOpen?.n ?? 0) / (msg?.n ?? 1)) * 100) : 0;

  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{biz.name}</h1>
          <p className="text-sm text-[var(--ink-soft)]">
            Owner: {owner?.email ?? "—"} · slug {biz.slug}
          </p>
        </div>
        <Link href="/admin/businesses" className="text-sm text-sky-600 hover:underline">
          ← All businesses
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Messages" value={msg?.n ?? 0} />
        <Stat label="AI replies" value={msg?.ai ?? 0} />
        <Stat label="Orders" value={orderCount?.n ?? 0} />
        <Stat label="Open handoffs" value={handoffOpen?.n ?? 0} tone={handoffOpen?.n ? "warn" : "default"} hint={`${handoffRate}% of msgs`} />
        <Stat label="Est. AI cost" value={`€${Number(msg?.cost ?? 0).toFixed(2)}`} hint={`${(msg?.tokens ?? 0).toLocaleString()} tokens`} />
        <Stat label="Est. saved" value={`€${savings.savedEur}`} tone="ok" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <AdminBusinessForm
          businessId={biz.id}
          defaults={{
            plan: biz.plan,
            status: biz.status,
            aiMode: biz.aiMode,
            handoffEnabled: biz.handoffEnabled,
            selectedModel: biz.selectedModel,
            dailyMessageLimit: biz.dailyMessageLimit,
            monthlyMessageLimit: biz.monthlyMessageLimit,
            tone: biz.tone
          }}
        />
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold">Connections</h2>
            {connections.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--ink-soft)]">None. Use manual connection below or ask the client to run OAuth.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {connections.map((c) => (
                  <li key={c.id} className="rounded-lg border border-[var(--card-border)] bg-white/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.pageName || c.pageId}</span>
                      <Badge tone={c.status === "connected" ? "ok" : c.status === "error" ? "error" : "warn"}>{c.status}</Badge>
                    </div>
                    <div className="mt-1 grid gap-1 text-xs text-[var(--ink-soft)]">
                      <span>page {c.pageId} · IG {c.instagramBusinessAccountId || "—"} · {c.connectionType}</span>
                      <span>token: {c.encryptedPageAccessToken ? maskToken(c.encryptedPageAccessToken) : "none"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <ManualConnectionForm businessId={biz.id} />
        </div>
      </section>

      <Card>
        <h2 className="font-semibold">Recent logs</h2>
        {logs.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">No events logged for this business yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex items-start gap-2">
                <Badge tone={l.level === "error" ? "error" : l.level === "warn" ? "warn" : "neutral"}>{l.area}</Badge>
                <span className="min-w-0 flex-1">{l.message}</span>
                <span className="whitespace-nowrap text-xs text-[var(--ink-soft)]">
                  {l.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
