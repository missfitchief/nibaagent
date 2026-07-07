import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { adminAuditLogs, eventLogs, users } from "@/lib/db/schema";
import { Badge, Card } from "@/components/ui";

export default async function LogsPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const level = typeof sp.level === "string" ? sp.level : "";
  const d = db();

  const events = await d
    .select()
    .from(eventLogs)
    .where(level === "error" ? eq(eventLogs.level, "error") : undefined)
    .orderBy(desc(eventLogs.createdAt))
    .limit(100);
  const audits = await d
    .select({ a: adminAuditLogs, email: users.email })
    .from(adminAuditLogs)
    .leftJoin(users, eq(adminAuditLogs.adminUserId, users.id))
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(50);

  return (
    <main className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Logs & errors</h1>
        <div className="flex gap-2 text-sm">
          <a href="/admin/logs" className={`rounded-lg px-3 py-1.5 ${!level ? "btn-primary" : "border border-[var(--card-border)] bg-white/60"}`}>
            All
          </a>
          <a
            href="/admin/logs?level=error"
            className={`rounded-lg px-3 py-1.5 ${level === "error" ? "btn-primary" : "border border-[var(--card-border)] bg-white/60"}`}
          >
            Errors only
          </a>
        </div>
      </header>

      <Card>
        <h2 className="font-semibold">System events</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">Nothing logged yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {events.map((l) => (
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

      <Card>
        <h2 className="font-semibold">Admin audit trail</h2>
        {audits.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">No admin actions recorded yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {audits.map(({ a, email }) => (
              <li key={a.id} className="flex items-start gap-2">
                <Badge tone="info">{a.action}</Badge>
                <span className="min-w-0 flex-1">
                  {email ?? a.adminUserId} → {a.targetType} {a.targetId.slice(0, 8)}…
                </span>
                <span className="whitespace-nowrap text-xs text-[var(--ink-soft)]">
                  {a.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
