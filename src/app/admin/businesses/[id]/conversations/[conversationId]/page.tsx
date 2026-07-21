import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { businesses, conversations, messages } from "@/lib/db/schema";
import { missingOrderFields, orderFieldLabel, parseConversationState } from "@/lib/conversation-memory";
import { Badge, Card } from "@/components/ui";

export default async function ConversationDetail({
  params
}: {
  params: Promise<{ id: string; conversationId: string }>;
}) {
  await requireAdmin();
  const { id, conversationId } = await params;
  const d = db();

  const [biz] = await d.select().from(businesses).where(eq(businesses.id, id)).limit(1);
  if (!biz) notFound();

  const [convo] = await d
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.businessId, id)))
    .limit(1);
  if (!convo) notFound();

  const thread = await d
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.businessId, id)))
    .orderBy(asc(messages.createdAt));

  const state = parseConversationState(convo.conversationState);
  const order = state.order;
  const missing = order?.active && !order.completed ? missingOrderFields(order) : [];

  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{convo.customerName || convo.senderId}</h1>
          <p className="text-sm text-[var(--ink-soft)]">
            {biz.name} · {convo.channel} · <Badge tone={convo.status === "handoff" ? "warn" : convo.status === "closed" ? "neutral" : "ok"}>{convo.status}</Badge>
          </p>
        </div>
        <Link href={`/admin/businesses/${id}?tab=conversations`} className="text-sm text-sky-600 hover:underline">
          ← Sve konverzacije
        </Link>
      </header>

      {order && (order.active || order.completed) && (
        <Card>
          <h2 className="font-semibold">Bot memory — order state</h2>
          <p className="mt-1 text-xs text-[var(--ink-soft)]">Ovo je TAČNO ono što bot trenutno misli da zna o ovoj porudžbini (ne pretpostavka — pravo stanje iz baze).</p>
          <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <span>Ime: <strong>{order.customerName || "—"}</strong></span>
            <span>Telefon: <strong>{order.phone || "—"}</strong></span>
            <span>Ulica i broj: <strong>{order.streetAndNumber || "—"}</strong></span>
            <span>Grad: <strong>{order.city || "—"}</strong></span>
            <span>Poštanski broj: <strong>{order.postalCode || "—"}</strong></span>
            <span>Šta naručuje: <strong>{order.productText || "—"}</strong></span>
          </div>
          <div className="mt-3">
            {order.completed ? (
              <Badge tone="ok">Porudžbina sačuvana</Badge>
            ) : order.active ? (
              <Badge tone="warn">U toku — još nedostaje: {missing.length ? missing.map((f) => orderFieldLabel(f, "sr")).join(", ") : "ništa"}</Badge>
            ) : (
              <Badge>Neaktivna</Badge>
            )}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">Poruke ({thread.length})</h2>
        {thread.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">Nema poruka.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {thread.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-lg rounded-2xl px-4 py-2.5 text-sm ${
                    m.direction === "outbound"
                      ? "rounded-br-sm border border-sky-200 bg-sky-50"
                      : "rounded-bl-sm border border-[var(--card-border)] bg-white/80"
                  }`}
                >
                  {m.imageUrl && (
                    <a href={m.imageUrl} target="_blank" rel="noreferrer" className="mb-1 block text-xs text-sky-600 hover:underline">
                      📷 slika priložena
                    </a>
                  )}
                  <p className="whitespace-pre-wrap">{m.text || <span className="italic text-[var(--ink-soft)]">(prazna poruka)</span>}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--ink-soft)]">
                    <span>{m.createdAt.toISOString().replace("T", " ").slice(0, 19)}</span>
                    {m.intent && <Badge tone="neutral">{m.intent}</Badge>}
                    {m.aiGenerated && m.modelUsed && <Badge tone="info">{m.modelUsed}</Badge>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
