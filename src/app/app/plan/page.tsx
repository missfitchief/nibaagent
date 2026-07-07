import { redirect } from "next/navigation";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { PLAN_DEFS, planDef } from "@/lib/plans";
import { Badge, Card } from "@/components/ui";

export default async function PlanPage() {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");
  const current = planDef(business.plan);

  return (
    <main className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Your plan</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          You are on <strong>{current.name}</strong>. Billing is handled manually for now — to change plans, contact us and we
          activate it the same day.
        </p>
      </header>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PLAN_DEFS.map((p) => (
          <Card key={p.id} className={`rise ${p.id === business.plan ? "ring-2 ring-sky-300" : ""}`}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{p.name}</h2>
              {p.highlight && <Badge tone="info">Popular</Badge>}
              {p.id === business.plan && <Badge tone="ok">Current</Badge>}
            </div>
            <div className="mt-2 text-3xl font-semibold">
              {p.priceEur === null ? "Contact us" : p.priceEur === 0 ? "€0" : `€${p.priceEur}`}
              {p.priceEur !== null && p.priceEur > 0 && <span className="text-sm font-normal text-[var(--ink-soft)]">/month</span>}
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-[var(--ink-soft)]">
              <li>💬 {p.messagesPerMonth === Infinity ? "Unlimited" : p.messagesPerMonth.toLocaleString()} messages/mo</li>
              <li>🤖 {p.aiRepliesPerMonth === Infinity ? "Unlimited" : p.aiRepliesPerMonth.toLocaleString()} AI replies/mo</li>
              <li>🔌 {p.channels === Infinity ? "Unlimited" : p.channels} channel{p.channels === 1 ? "" : "s"}</li>
              <li>📚 {p.knowledgeSources === Infinity ? "Unlimited" : p.knowledgeSources} knowledge entries</li>
              <li>{p.handoff ? "✅" : "—"} Human handoff</li>
              <li>{p.sheetOrders ? "✅" : "—"} Google Sheets orders</li>
              <li>{p.notifications ? "✅" : "—"} Telegram/WhatsApp alerts</li>
              <li>📈 {p.analytics === "advanced" ? "Advanced" : "Basic"} analytics</li>
              <li>🛟 {p.support}</li>
            </ul>
            {p.id !== business.plan && (
              <a
                href={`mailto:sales@nibachat.agency?subject=Upgrade to ${p.name} — ${encodeURIComponent(business.name)}`}
                className="btn-primary mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-medium"
              >
                {p.priceEur === null ? "Contact us" : `Switch to ${p.name}`}
              </a>
            )}
          </Card>
        ))}
      </section>
    </main>
  );
}
