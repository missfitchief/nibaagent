import Link from "next/link";
import { desc, ilike } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema";
import { Badge, Card, Input } from "@/components/ui";

export default async function BusinessesPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const rows = await db()
    .select()
    .from(businesses)
    .where(q ? ilike(businesses.name, `%${q}%`) : undefined)
    .orderBy(desc(businesses.createdAt))
    .limit(100);

  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Businesses</h1>
        <form className="flex gap-2">
          <Input name="q" defaultValue={q} placeholder="Search by name…" className="w-64" />
          <button className="btn-primary rounded-xl px-4 py-2 text-sm font-medium">Search</button>
        </form>
      </header>

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
              {rows.map((b) => (
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
                    <Link href={`/admin/businesses/${b.id}`} className="text-sky-600 hover:underline">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
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
