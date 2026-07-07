import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { conversations, handoffs } from "@/lib/db/schema";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { resolveHandoffAction } from "@/lib/actions/inbox";
import { Badge, Card, EmptyState } from "@/components/ui";

export default async function HandoffPage() {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");

  const rows = await db()
    .select({
      h: handoffs,
      channel: conversations.channel,
      customer: conversations.customerName,
      sender: conversations.senderId
    })
    .from(handoffs)
    .leftJoin(conversations, eq(handoffs.conversationId, conversations.id))
    .where(eq(handoffs.businessId, business.id))
    .orderBy(desc(handoffs.createdAt))
    .limit(100);

  return (
    <main className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Handoff — needs a human</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          These customers asked for a person or hit a trigger word. Reply in your Facebook/Instagram inbox, then mark resolved —
          the bot stays silent for that conversation until you do.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState title="Nothing needs you right now" body="When a customer needs a human, the conversation shows up here with the reason." />
      ) : (
        <div className="space-y-3">
          {rows.map(({ h, channel, customer, sender }) => (
            <Card key={h.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={h.status === "open" ? "warn" : "ok"}>{h.status}</Badge>
                  <Badge tone="info">{channel ?? "—"}</Badge>
                  <span className="font-medium">{customer || sender || "Customer"}</span>
                </div>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  {h.reason || (h.triggerWord ? `Trigger word: “${h.triggerWord}”` : "Handoff requested")} ·{" "}
                  {h.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                </p>
              </div>
              {h.status === "open" && (
                <form action={resolveHandoffAction}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="id" value={h.id} />
                  <button className="btn-primary rounded-xl px-4 py-2 text-sm font-medium">Mark resolved — bot resumes</button>
                </form>
              )}
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
