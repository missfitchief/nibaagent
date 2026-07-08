import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { botSettings, businesses, eventLogs, handoffs, messages, metaConnections, orders, users } from "@/lib/db/schema";
import { estimateSavings } from "@/lib/plans";
import { maskToken } from "@/lib/crypto";
import { listProducts } from "@/lib/products";
import { listMaskedSecrets } from "@/lib/secrets";
import { listMembers, removeMemberAction } from "@/lib/actions/members";
import { deleteProductAction, toggleProductAction } from "@/lib/actions/products";
import { analyzeOldChatsAction } from "@/lib/actions/tools";
import { Badge, Card, Stat } from "@/components/ui";
import { ProductForm } from "@/app/app/products/form";
import { AddMemberForm } from "@/app/app/team/form";
import { SecretsPanel } from "@/app/app/settings/secrets";
import { AdminBusinessForm, ManualConnectionForm, TelegramTestButton } from "./forms";

const TABS = ["overview", "products", "users", "integrations", "logs"] as const;
type Tab = (typeof TABS)[number];

export default async function AdminBusinessDetail({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const d = db();
  const [biz] = await d.select().from(businesses).where(eq(businesses.id, id)).limit(1);
  if (!biz) notFound();

  const [owner] = await d.select({ email: users.email }).from(users).where(eq(users.id, biz.ownerUserId)).limit(1);
  const [msg] = await d
    .select({
      n: sql<number>`count(*)::int`,
      ai: sql<number>`count(*) filter (where ${messages.aiGenerated})::int`,
      cost: sql<string>`coalesce(sum(${messages.costEstimate}), 0)`,
      tokens: sql<number>`coalesce(sum(${messages.tokenUsageEstimate}), 0)::int`
    })
    .from(messages)
    .where(eq(messages.businessId, id));
  const [orderCount] = await d.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.businessId, id));
  const [handoffOpen] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(handoffs)
    .where(and(eq(handoffs.businessId, id), eq(handoffs.status, "open")));
  const connections = await d.select().from(metaConnections).where(eq(metaConnections.businessId, id));
  const [settings] = await d.select().from(botSettings).where(eq(botSettings.businessId, id)).limit(1);
  const logs = await d.select().from(eventLogs).where(eq(eventLogs.businessId, id)).orderBy(desc(eventLogs.createdAt)).limit(20);
  const savings = estimateSavings(msg?.ai ?? 0);
  const handoffRate = (msg?.n ?? 0) > 0 ? Math.round(((handoffOpen?.n ?? 0) / (msg?.n ?? 1)) * 100) : 0;
  const productRows = tab === "products" ? await listProducts(id) : [];
  const members = tab === "users" ? await listMembers(id) : [];
  const secrets = tab === "integrations" ? await listMaskedSecrets(id) : [];

  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{biz.name}</h1>
          <p className="text-sm text-[var(--ink-soft)]">
            Owner: {owner?.email ?? "—"} · slug {biz.slug}
          </p>
        </div>
        <Link href="/admin/businesses" className="text-sm text-sky-600 hover:underline">
          ← All businesses
        </Link>
      </header>

      <nav className="glass flex flex-wrap gap-1 p-1.5 text-sm">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/admin/businesses/${biz.id}?tab=${t}`}
            className={`rounded-lg px-3 py-1.5 capitalize ${t === tab ? "btn-primary" : "hover:bg-sky-50 text-[var(--ink-soft)]"}`}
          >
            {t === "integrations" ? "Integrations & Keys" : t}
          </Link>
        ))}
      </nav>

      {tab === "products" && (
        <>
          <ProductForm businessId={biz.id} />
          {productRows.length === 0 ? (
            <Card><p className="text-sm text-[var(--ink-soft)]">No products for this business yet.</p></Card>
          ) : (
            <div className="space-y-2">
              {productRows.map((p) => (
                <Card key={p.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.title}</span>
                      <Badge tone={p.stockStatus === "available" ? "ok" : p.stockStatus === "unavailable" ? "error" : "warn"}>{p.stockStatus}</Badge>
                      {!p.enabled && <Badge>disabled</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--ink-soft)]">{p.price != null ? `${p.price} ${p.currency}` : "no price"}{p.sku ? ` · ${p.sku}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <form action={toggleProductAction}>
                      <input type="hidden" name="businessId" value={biz.id} />
                      <input type="hidden" name="productId" value={p.id} />
                      <input type="hidden" name="enabled" value={p.enabled ? "false" : "true"} />
                      <button className="rounded-lg border border-[var(--card-border)] bg-white/60 px-2.5 py-1 text-xs hover:bg-white">{p.enabled ? "Disable" : "Enable"}</button>
                    </form>
                    <form action={deleteProductAction}>
                      <input type="hidden" name="businessId" value={biz.id} />
                      <input type="hidden" name="productId" value={p.id} />
                      <button className="rounded-lg px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50">Delete</button>
                    </form>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "users" && (
        <>
          <AddMemberForm businessId={biz.id} />
          <Card>
            <h2 className="font-semibold">Members</h2>
            <ul className="mt-3 space-y-2">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-white/60 px-3 py-2">
                  <span className="truncate text-sm">{m.email}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={m.isOwner ? "ok" : "info"}>{m.role}</Badge>
                    {!m.isOwner && (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="businessId" value={biz.id} />
                        <input type="hidden" name="userId" value={m.userId} />
                        <button className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Remove</button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {tab === "integrations" && (
        <>
          <SecretsPanel businessId={biz.id} secrets={secrets} />
          <ManualConnectionForm businessId={biz.id} />
          <Card>
            <h2 className="font-semibold">Notifications</h2>
            <TelegramTestButton businessId={biz.id} />
          </Card>
        </>
      )}

      {tab === "logs" && (
        <Card>
          <h2 className="font-semibold">Event log (20 most recent)</h2>
          {logs.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ink-soft)]">No events yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {logs.map((l) => (
                <li key={l.id} className="flex items-start gap-2">
                  <Badge tone={l.level === "error" ? "error" : l.level === "warn" ? "warn" : "neutral"}>{l.area}</Badge>
                  <span className="min-w-0 flex-1">{l.message}</span>
                  <span className="whitespace-nowrap text-xs text-[var(--ink-soft)]">{l.createdAt.toISOString().replace("T", " ").slice(0, 16)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "overview" && (
      <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Messages" value={msg?.n ?? 0} />
        <Stat label="AI replies" value={msg?.ai ?? 0} />
        <Stat label="Orders" value={orderCount?.n ?? 0} />
        <Stat label="Open handoffs" value={handoffOpen?.n ?? 0} tone={handoffOpen?.n ? "warn" : "default"} hint={`${handoffRate}% of msgs`} />
        <Stat label="Est. AI cost" value={`€${Number(msg?.cost ?? 0).toFixed(2)}`} hint={`${(msg?.tokens ?? 0).toLocaleString()} tokens`} />
        <Stat label="Est. saved" value={`€${savings.savedEur}`} tone="ok" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <AdminBusinessForm
          businessId={biz.id}
          defaults={{
            plan: biz.plan,
            status: biz.status,
            aiMode: biz.aiMode,
            handoffEnabled: biz.handoffEnabled,
            selectedModel: biz.selectedModel,
            dailyMessageLimit: biz.dailyMessageLimit,
            monthlyMessageLimit: biz.monthlyMessageLimit,
            tone: biz.tone
          }}
        />
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold">Connections</h2>
            {connections.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--ink-soft)]">None. Use manual connection below or ask the client to run OAuth.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {connections.map((c) => (
                  <li key={c.id} className="rounded-lg border border-[var(--card-border)] bg-white/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.pageName || c.pageId}</span>
                      <Badge tone={c.status === "connected" ? "ok" : c.status === "error" ? "error" : "warn"}>{c.status}</Badge>
                    </div>
                    <div className="mt-1 grid gap-1 text-xs text-[var(--ink-soft)]">
                      <span>page {c.pageId} · IG {c.instagramBusinessAccountId || "—"} · {c.connectionType}</span>
                      <span>token: {c.encryptedPageAccessToken ? maskToken(c.encryptedPageAccessToken) : "none"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <ManualConnectionForm businessId={biz.id} />
        </div>
      </section>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Old-chats analysis & tools</h2>
            <p className="text-sm text-[var(--ink-soft)]">
              {settings?.oldChatsAnalyzedAt
                ? `Last generated ${settings.oldChatsAnalyzedAt.toISOString().replace("T", " ").slice(0, 16)}`
                : "Never generated — runs one cheap batched AI call and caches the result."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form action={analyzeOldChatsAction}>
              <input type="hidden" name="businessId" value={biz.id} />
              <button className="btn-primary rounded-xl px-4 py-2 text-sm font-medium">Analyze old chats</button>
            </form>
            <TelegramTestButton businessId={biz.id} />
          </div>
        </div>
        {settings?.oldChatsSummary && (
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-[var(--card-border)] bg-white/60 p-3 text-sm text-[var(--ink-soft)]">
            {settings.oldChatsSummary}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Recent logs</h2>
        {logs.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">No events logged for this business yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {logs.map((l) => (
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
      </>
      )}
    </main>
  );
}
