import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, ownBusiness } from "@/lib/auth/guards";
import { dashboardData } from "@/lib/actions/business";
import { setupChecklist } from "@/lib/checklist";
import { estimateSavings, planDef } from "@/lib/plans";
import { Badge, Card, EmptyState, Stat } from "@/components/ui";

export default async function ClientDashboard() {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");

  const data = await dashboardData(business.id);
  const checklist = await setupChecklist(business.id);
  const remaining = checklist.filter((c) => !c.done);
  const savings = estimateSavings(data.stats.aiRepliesAllTime);
  const plan = planDef(business.plan);
  // A saved connection has status 'active' (n8n convention); accept legacy values too.
  const CONNECTED = ["active", "connected", "partial"];
  const fb = data.connections.some((c) => CONNECTED.includes(c.status));
  const ig = data.connections.some((c) => c.instagramBusinessAccountId && c.status !== "error" && c.status !== "disconnected");

  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{business.name}</h1>
          <p className="text-sm text-[var(--ink-soft)]">Here is how your AI agent is doing.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={business.aiMode === "live" ? "ok" : business.aiMode === "draft" ? "info" : "warn"}>
            Bot: {business.aiMode === "live" ? "live" : business.aiMode === "draft" ? "draft mode" : "paused"}
          </Badge>
          <Badge tone="info">Plan: {plan.name}</Badge>
        </div>
      </header>

      {remaining.length > 0 && (
        <Card className="border-sky-200">
          <h2 className="font-semibold">Finish setting up ({checklist.length - remaining.length}/{checklist.length})</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {checklist.map((c) => (
              <li key={c.key} className="flex items-center gap-2">
                <span>{c.done ? "✅" : "⬜"}</span>
                <span className={c.done ? "text-[var(--ink-soft)]" : ""}>{c.label}</span>
                {!c.done && <span className="text-xs text-[var(--ink-soft)]">— {c.hint}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Messages today" value={data.stats.messagesToday} />
        <Stat label="AI replies today" value={data.stats.aiRepliesToday} />
        <Stat label="Conversations" value={data.stats.conversations} />
        <Stat label="Orders" value={data.stats.orders} />
        <Stat label="Open handoffs" value={data.stats.handoffsOpen} tone={data.stats.handoffsOpen > 0 ? "warn" : "default"} />
        <Stat
          label="Est. money saved"
          value={`€${savings.savedEur}`}
          hint={`≈ ${Math.round(savings.savedMinutes / 60)}h of support time (estimate)`}
          tone="ok"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Channels</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Facebook Messenger</span>
              <Badge tone={fb ? "ok" : "neutral"}>{fb ? "Connected" : "Not connected"}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Instagram Direct</span>
              <Badge tone={ig ? "ok" : "neutral"}>{ig ? "Connected" : "Not connected"}</Badge>
            </div>
          </div>
          {!fb && (
            <Link
              href="/app/connect"
              className="btn-primary mt-4 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium"
            >
              Connect Facebook & Instagram
            </Link>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold">Needs your attention</h2>
          {data.recentHandoffs.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ink-soft)]">No open handoffs — your AI agent is handling everything. 🎉</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data.recentHandoffs.map((h) => (
                <li key={h.id} className="flex items-center justify-between rounded-lg bg-amber-50/60 px-3 py-2">
                  <span className="truncate">{h.reason || h.triggerWord || "Handoff requested"}</span>
                  <Badge tone={h.status === "open" ? "warn" : "ok"}>{h.status}</Badge>
                </li>
              ))}
            </ul>
          )}
          <Link href="/app/handoff" className="mt-3 inline-block text-sm text-sky-600 hover:underline">
            View all handoffs →
          </Link>
        </Card>
      </section>

      <section>
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent orders</h2>
            <Link href="/app/orders" className="text-sm text-sky-600 hover:underline">
              All orders →
            </Link>
          </div>
          {data.recentOrders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              body="When your AI agent collects an order from a customer conversation, it will show up here and in your Google Sheet."
            />
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--ink-soft)]">
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Order</th>
                    <th className="py-2 pr-4">City</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.map((o) => (
                    <tr key={o.id} className="border-t border-[var(--card-border)]">
                      <td className="py-2 pr-4">{o.customerName || "—"}</td>
                      <td className="max-w-[16rem] truncate py-2 pr-4">{o.orderText || "—"}</td>
                      <td className="py-2 pr-4">{o.city || "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={o.status === "new" ? "info" : "ok"}>{o.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <p className="text-xs text-[var(--ink-soft)]">
        Money/time saved is an estimate based on a €600/month support salary and ~2 minutes saved per AI-handled reply.
      </p>
    </main>
  );
}
