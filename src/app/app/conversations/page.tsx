import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { conversations } from "@/lib/db/schema";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { Card, EmptyState } from "@/components/ui";
import { ConversationsTable } from "./conversations-table";

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
          <ConversationsTable businessId={business.id} rows={rows} detailBasePath="/app/conversations" />
        </Card>
      )}
    </main>
  );
}
