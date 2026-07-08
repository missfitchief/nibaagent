import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { conversations } from "@/lib/db/schema";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { Badge, Card, EmptyState } from "@/components/ui";

export default async function ConversationsPage() {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");

  const rows = await db()
    .select()
    .from(conversations)
    .where(eq(conversations.businessId, business.id))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);

  return (
    <main className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Conversations</h1>
        <p className="text-sm text-[var(--ink-soft)]">Recent customer conversations for {business.name}.</p>
      </header>
      {rows.length === 0 ? (
        <EmptyState title="No conversations yet" body="When customers message your connected Instagram/Facebook, their conversations appear here." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--ink-soft)]">
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Channel</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-[var(--card-border)]">
                    <td className="py-2 pr-4">{c.customerName || c.senderId}</td>
                    <td className="py-2 pr-4">{c.channel}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={c.status === "handoff" ? "warn" : c.status === "closed" ? "neutral" : "ok"}>{c.status}</Badge>
                    </td>
                    <td className="py-2 pr-4">{c.lastMessageAt.toISOString().replace("T", " ").slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}
