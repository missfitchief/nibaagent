import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { conversations, handoffs } from "@/lib/db/schema";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { EmptyState } from "@/components/ui";
import { HandoffPanel } from "./handoff-panel";

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
        <HandoffPanel businessId={business.id} rows={rows} detailBasePath="/app/conversations" />
      )}
    </main>
  );
}
