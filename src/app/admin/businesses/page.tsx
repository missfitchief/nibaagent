import Link from "next/link";
import { and, desc, eq, ilike } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema";
import { Badge, Card, Input } from "@/components/ui";
import { AdminCreateBusinessForm } from "./create-form";
import { getRealCostWindows } from "@/lib/openai-costs";

export default async function BusinessesPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const showArchived = sp.archived === "1";

  // Archived (status='inactive') businesses are hidden by default.
  const filters = [
    q ? ilike(businesses.name, `%${q}%`) : undefined,
    showArchived ? undefined : eq(businesses.status, "active")
  ].filter(Boolean);
  const rows = await db()
    .select()
    .from(businesses)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(businesses.createdAt))
    .limit(100);

  // Real spend (not our token-based estimate) for every row that has an
  // OpenAI API key id set — cached per business (5 min TTL) so paging
  // through this list repeatedly doesn't hammer OpenAI's rate limit.
  const realCosts = await Promise.all(rows.map((b) => getRealCostWindows(b)));

  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Businesses</h1>
        <form className="flex flex-wrap items-center gap-2">
          <Input name="q" defaultValue={q} placeholder="Search by name…" className="w-64" />
          {showArchived && <input type="hidden" name="archived" value="1" />}
          <button className="btn-primary rounded-xl px-4 py-2 text-sm font-medium">Search</button>
          <Link
            href={showArchived ? `/admin/businesses${q ? `?q=${encodeURIComponent(q)}` : ""}` : `/admin/businesses?archived=1${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className="rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm hover:bg-slate-50"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Link>
        </form>
      </header>

      <AdminCreateBusinessForm />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--ink-soft)]">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Slug</th>
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2 pr-4">AI mode</th>
                <th className="py-2 pr-4">Model</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b, i) => {
                const real = realCosts[i]?.allTime;
                return (
                  <tr key={b.id} className="border-t border-[var(--card-border)]">
                    <td className="py-2 pr-4 font-medium">{b.name}</td>
                    <td className="py-2 pr-4 text-[var(--ink-soft)]">{b.slug}</td>
                    <td className="py-2 pr-4">{b.plan}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={b.aiMode === "live" ? "ok" : b.aiMode === "draft" ? "info" : "warn"}>{b.aiMode}</Badge>
                    </td>
                    <td className="py-2 pr-4">{b.selectedModel}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={b.status === "active" ? "ok" : "neutral"}>{b.status}</Badge>
                    </td>
                    <td className="py-2 pr-4">{b.createdAt.toISOString().slice(0, 10)}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/businesses/${b.id}`} className="text-sky-600 hover:underline">
                          Open →
                        </Link>
                        {real?.ok && typeof real.usd === "number" && (
                          <span
                            title="Stvaran trošak sa OpenAI-ja, od početka (real-time, keširano 5 min)"
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                          >
                            ${real.usd.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-[var(--ink-soft)]">
                    No businesses{q ? ` matching “${q}”` : " yet"}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
