import { and, eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { knowledgeSources } from "@/lib/db/schema";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { deleteKnowledgeAction } from "@/lib/actions/knowledge";
import { planDef } from "@/lib/plans";
import { Badge, Card, EmptyState } from "@/components/ui";
import { KnowledgeForm } from "./form";
import { IngestPanel } from "./ingest";
import { WebsiteKnowledgeForm } from "./website";

export default async function KnowledgePage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  // "Bot nije znao" → "Dodaj u znanje" lands here with the question prefilled.
  const prefill = typeof sp.prefill === "string" ? sp.prefill.slice(0, 200) : "";
  const uq = typeof sp.uq === "string" ? sp.uq : "";
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");

  const sources = await db()
    .select()
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.businessId, business.id), eq(knowledgeSources.status, "active")))
    .orderBy(desc(knowledgeSources.createdAt));
  const limit = planDef(business.plan).knowledgeSources;

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge & training</h1>
          <p className="text-sm text-[var(--ink-soft)]">
            Teach your agent your products, prices, delivery rules and FAQs. {sources.length}/{limit} entries used.
          </p>
        </div>
      </header>

      {prefill && (
        <Card className="border-amber-200 bg-amber-50/50">
          <p className="text-sm">
            Bot nije znao odgovor na: <span className="font-medium">„{prefill}"</span> — dodajte odgovor ispod i pitanje će biti označeno kao rešeno.
          </p>
        </Card>
      )}

      <KnowledgeForm businessId={business.id} prefillTitle={prefill} unansweredId={uq} />
      <WebsiteKnowledgeForm businessId={business.id} />
      <IngestPanel businessId={business.id} />

      {sources.length === 0 ? (
        <EmptyState
          title="No knowledge yet"
          body="Add your first FAQ or product info above — the more your agent knows, the fewer questions need a human."
        />
      ) : (
        <div className="space-y-3">
          {sources.map((s) => (
            <Card key={s.id} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone="info">{s.type}</Badge>
                  <span className="font-medium">{s.title}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-[var(--ink-soft)]">{s.content || s.sourceUrl}</p>
              </div>
              <form action={deleteKnowledgeAction}>
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="id" value={s.id} />
                <button className="rounded-lg px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50">Remove</button>
              </form>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
