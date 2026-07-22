import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import {
  botSettings,
  businesses,
  conversations,
  handoffs,
  messages,
  metaConnections,
  orders,
  users
} from "@/lib/db/schema";
import { estimateSavings } from "@/lib/plans";
import { aiCostWindows } from "@/lib/usage";
import { maskToken } from "@/lib/crypto";
import { knowledgeSources } from "@/lib/db/schema";
import { listProducts } from "@/lib/products";
import { listMaskedSecrets } from "@/lib/secrets";
import { resolveProviderRuntimeConfig } from "@/lib/ai-runtime";
import { listBusinessLogs } from "@/lib/logs";
import { BusinessLogs } from "@/components/business-logs";
import { missingSetup, setupChecklist } from "@/lib/checklist";
import { BotSettingsForm } from "@/app/app/bot/form";
import { KnowledgeForm } from "@/app/app/knowledge/form";
import { KnowledgeEditRow } from "@/app/app/knowledge/edit-row";
import { IngestPanel } from "@/app/app/knowledge/ingest";
import { WebsiteKnowledgeForm } from "@/app/app/knowledge/website";
import { listMembers, removeMemberAction } from "@/lib/actions/members";
import { deleteProductAction, toggleProductAction } from "@/lib/actions/products";
import { deleteOrderAction, resolveHandoffAction, setOrderStatusAction } from "@/lib/actions/inbox";
import { analyzeOldChatsAction } from "@/lib/actions/tools";
import {
  archiveBusinessAction,
  clearTestConversationsAction,
  disconnectChannelsAction,
  pauseBusinessAction,
  resetBotStateAction,
  setOrderNoteAction
} from "@/lib/actions/danger";
import { Badge, Card, Stat } from "@/components/ui";
import { ProductForm } from "@/app/app/products/form";
import { ImportPanel } from "@/app/app/products/import-panel";
import { InviteForm } from "@/app/app/team/form";
import { SecretsPanel } from "@/app/app/settings/secrets";
import { AdminBusinessForm, DeleteBusinessForm, ImageRecognitionTest, ManualConnectionForm, MoveConnectionButton, TelegramTestButton, TestConnectionButton } from "./forms";
import type { BusinessHours } from "@/lib/hours";
import { metaConfigCheck } from "@/lib/meta-check";
import { MetaCheckPanel } from "@/components/meta-check-panel";

const TABS = [
  "overview",
  "setup",
  "users",
  "channels",
  "bot",
  "knowledge",
  "products",
  "conversations",
  "handoffs",
  "orders",
  "analytics",
  "integrations",
  "telegram",
  "logs",
  "danger"
] as const;
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
  // Page-already-connected conflict passed back from the OAuth callback.
  const pageInUse = sp.error === "page_in_use" && typeof sp.pageId === "string" ? sp.pageId : "";
  const otherClient = typeof sp.otherClient === "string" ? sp.otherClient : "";
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
  // AI cost broken out by window (USD — the currency providers actually bill
  // in, no FX estimate layered on top), strictly scoped to this business.
  const costWindows = await aiCostWindows(id);
  const [orderCount] = await d.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.businessId, id));
  const [handoffOpen] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(handoffs)
    .where(and(eq(handoffs.businessId, id), eq(handoffs.status, "open")));
  const connections = await d.select().from(metaConnections).where(eq(metaConnections.businessId, id));
  const [settings] = await d.select().from(botSettings).where(eq(botSettings.businessId, id)).limit(1);
  const logSource = typeof sp.logSource === "string" ? sp.logSource : "all";
  const logs = tab === "logs" ? await listBusinessLogs(id, logSource) : [];
  const savings = estimateSavings(msg?.ai ?? 0);
  const handoffRate = (msg?.n ?? 0) > 0 ? Math.round(((handoffOpen?.n ?? 0) / (msg?.n ?? 1)) * 100) : 0;
  const productRows = tab === "products" ? await listProducts(id) : [];
  const members = tab === "users" ? await listMembers(id) : [];
  const secrets = tab === "integrations" ? await listMaskedSecrets(id) : [];
  const integrationsUsage =
    tab === "integrations"
      ? await (async () => {
          const cfg = await resolveProviderRuntimeConfig(id);
          return { mode: cfg.mode, provider: cfg.provider, source: cfg.keySource, ready: cfg.ready, reason: cfg.reason, isAdmin: true };
        })()
      : undefined;
  const convRows =
    tab === "conversations"
      ? await d.select().from(conversations).where(eq(conversations.businessId, id)).orderBy(desc(conversations.lastMessageAt)).limit(50)
      : [];
  const handoffRows =
    tab === "handoffs"
      ? await d
          .select({ h: handoffs, channel: conversations.channel, customer: conversations.customerName, sender: conversations.senderId })
          .from(handoffs)
          .leftJoin(conversations, eq(handoffs.conversationId, conversations.id))
          .where(eq(handoffs.businessId, id))
          .orderBy(desc(handoffs.createdAt))
          .limit(50)
      : [];
  const orderRows =
    tab === "orders" ? await d.select().from(orders).where(eq(orders.businessId, id)).orderBy(desc(orders.createdAt)).limit(100) : [];
  const daily =
    tab === "analytics"
      ? await d
          .select({
            day: sql<string>`to_char(${messages.createdAt}, 'YYYY-MM-DD')`,
            total: sql<number>`count(*)::int`,
            ai: sql<number>`count(*) filter (where ${messages.aiGenerated})::int`
          })
          .from(messages)
          .where(and(eq(messages.businessId, id), sql`${messages.createdAt} >= now() - interval '30 days'`))
          .groupBy(sql`1`)
          .orderBy(sql`1`)
      : [];
  const missing = tab === "overview" ? await missingSetup(id) : [];
  const checklist = tab === "setup" ? await setupChecklist(id) : [];
  const knowledgeRows =
    tab === "knowledge"
      ? await d.select().from(knowledgeSources).where(and(eq(knowledgeSources.businessId, id), eq(knowledgeSources.status, "active"))).orderBy(desc(knowledgeSources.createdAt))
      : [];
  const telegramSecrets = tab === "telegram" ? await listMaskedSecrets(id) : [];
  // Resolve Meta config from platform settings (DB → env), not env only, so the
  // Connect button enables when Meta is configured in /admin/settings.
  const metaCheck = tab === "channels" ? await metaConfigCheck() : null;
  const metaConfigured = metaCheck?.ready ?? false;
  const dailyMax = Math.max(1, ...daily.map((r) => r.total));

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
          <ImportPanel businessId={biz.id} />
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
          <InviteForm businessId={biz.id} />
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
          <SecretsPanel businessId={biz.id} secrets={secrets} usage={integrationsUsage} />
          <ManualConnectionForm businessId={biz.id} />
          <Card>
            <h2 className="font-semibold">Notifications</h2>
            <TelegramTestButton businessId={biz.id} />
          </Card>
        </>
      )}

      {tab === "setup" && (
        <Card>
          <h2 className="font-semibold">Setup checklist</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {checklist.map((c) => (
              <li key={c.key} className="flex items-start gap-2">
                <span>{c.done ? "✅" : "⬜"}</span>
                <span>
                  <span className={c.done ? "text-[var(--ink-soft)]" : "font-medium"}>{c.label}</span>
                  <span className="block text-xs text-[var(--ink-soft)]">{c.hint}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "channels" && (
        <>
          {sp.connected === "1" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              🎉 Uspešno povezano! Konekcija je sačuvana u bazi za ovu firmu (client_id: <code>{biz.clientId}</code>). Klikni Test connection ispod da proveriš Facebook/Instagram.
            </div>
          )}
          {sp.warning === "webhook_subscription_failed" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              ⚠️ Stranica i token su sačuvani, ali pretplata na webhook nije uspela. Poruke možda neće stizati dok se ne ponovi.
            </div>
          )}
          {sp.error && sp.error !== "page_in_use" && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Greška pri povezivanju: {decodeURIComponent(String(sp.error))}
            </div>
          )}
          <Card>
            <h2 className="font-semibold">Facebook / Instagram</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Jedno prijavljivanje povezuje stranicu i Instagram ove firme; token se čuva šifrovan samo pod ovom firmom.</p>
            {metaConfigured ? (
              <a
                href={`/api/meta/start?businessId=${biz.id}&returnUrl=${encodeURIComponent(`/admin/businesses/${biz.id}?tab=channels`)}`}
                className="btn-primary mt-3 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
              >
                ⓕ Poveži Facebook / Instagram
              </a>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-[var(--card-border)] px-5 py-2.5 text-sm font-semibold opacity-50">
                  ⓕ Poveži Facebook / Instagram
                </span>
                <Link href="/admin/settings" className="text-sm font-medium text-sky-600 hover:underline">
                  Podesi Meta u Podešavanjima aplikacije →
                </Link>
              </div>
            )}
            {metaCheck && (
              <p className="mt-2 text-xs text-[var(--ink-soft)]">
                OAuth callback: <code className="rounded bg-slate-100 px-1">{metaCheck.callbackUrl}</code>
              </p>
            )}
          </Card>

          {metaCheck && <MetaCheckPanel check={metaCheck} businessId={biz.id} />}

          {pageInUse && (
            <MoveConnectionButton businessId={biz.id} pageId={pageInUse} fromClient={otherClient} />
          )}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Povezani kanali</h2>
              <TestConnectionButton businessId={biz.id} />
            </div>
            {/* Tenant identity — exactly what n8n reads. */}
            <div className="mt-2 grid gap-1 rounded-lg border border-[var(--card-border)] bg-slate-50 p-3 text-xs sm:grid-cols-2">
              <span>Firma: <strong>{biz.name}</strong></span>
              <span>client_id (tenant id): <code className="rounded bg-white px-1">{biz.clientId || "—"}</code></span>
              <span>plan: {biz.plan}</span>
              <span>status: {biz.status}</span>
            </div>
            {connections.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--ink-soft)]">Ništa još nije povezano. Koristi dugme iznad ili ručni unos ispod.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {connections.map((c) => (
                  <li key={c.id} className="rounded-lg border border-[var(--card-border)] bg-white/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.pageName || c.pageId}</span>
                      <Badge tone={c.status === "active" || c.status === "connected" ? "ok" : c.status === "error" ? "error" : c.status === "disconnected" ? "neutral" : "warn"}>{c.status}</Badge>
                    </div>
                    <div className="mt-1 grid gap-1 text-xs text-[var(--ink-soft)] sm:grid-cols-2">
                      <span>client_id: {c.clientId}</span>
                      <span>plan: {c.plan}</span>
                      <span>page_id: {c.pageId}</span>
                      <span>page_name: {c.pageName || "—"}</span>
                      <span>IG business account: {c.instagramBusinessAccountId || "—"}</span>
                      <span>updated: {c.updatedAt.toISOString().replace("T", " ").slice(0, 16)}</span>
                      <span>token: {c.encryptedPageAccessToken ? maskToken(c.encryptedPageAccessToken) : "none"} · {c.connectionType}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <ManualConnectionForm businessId={biz.id} />
          <Link href="/admin/businesses" className="inline-block text-sm text-sky-600 hover:underline">
            ← Nazad na master dashboard
          </Link>
        </>
      )}

      {tab === "bot" && (
        <>
          <BotSettingsForm
            key={settings?.updatedAt.toISOString() ?? "new"}
            businessId={biz.id}
            showModelPicker={false}
            defaults={{
              tone: settings?.tone ?? "friendly",
              customInstructions: settings?.customInstructions ?? "",
              orderCollectionEnabled: settings?.orderCollectionEnabled ?? true,
              orderPrompt: settings?.orderPrompt ?? "",
              handoffWords: ((settings?.handoffWords as string[]) ?? []).join(", "),
              aiProvider: settings?.aiProvider ?? "openai",
              selectedModel: biz.selectedModel,
              aiStrategy: settings?.aiStrategy ?? "rules_first",
              persiranje: settings?.persiranje ?? true,
              imageRecognitionEnabled: settings?.imageRecognitionEnabled ?? true,
              replyDelaySeconds: settings?.replyDelaySeconds ?? 0,
              unknownBehavior: settings?.unknownBehavior ?? "offer_handoff",
              handoffThreshold: settings?.handoffThreshold ?? 40,
              businessHours: (settings?.businessHours as BusinessHours) ?? { enabled: false }
            }}
          />
          <ImageRecognitionTest businessId={biz.id} />
        </>
      )}

      {tab === "knowledge" && (
        <>
          <KnowledgeForm businessId={biz.id} />
          <WebsiteKnowledgeForm businessId={biz.id} />
          <IngestPanel businessId={biz.id} />
          {knowledgeRows.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-semibold">Knowledge entries ({knowledgeRows.length})</h2>
              {knowledgeRows.map((s) => (
                <KnowledgeEditRow
                  key={s.id}
                  businessId={biz.id}
                  id={s.id}
                  type={s.type}
                  title={s.title}
                  content={s.content}
                  sourceUrl={s.sourceUrl}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "telegram" && (
        <>
          <SecretsPanel businessId={biz.id} secrets={telegramSecrets} />
          <Card>
            <h2 className="font-semibold">Test notification</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Sends a message using this business&apos;s Telegram token (or the platform fallback).</p>
            <div className="mt-2"><TelegramTestButton businessId={biz.id} /></div>
          </Card>
        </>
      )}

      {tab === "conversations" && (
        <Card>
          <h2 className="font-semibold">Conversations ({convRows.length})</h2>
          {convRows.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ink-soft)]">No conversations yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--ink-soft)]">
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Channel</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Last activity</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {convRows.map((c) => (
                    <tr key={c.id} className="border-t border-[var(--card-border)]">
                      <td className="py-2 pr-4">{c.customerName || c.senderId}</td>
                      <td className="py-2 pr-4">{c.channel}</td>
                      <td className="py-2 pr-4"><Badge tone={c.status === "handoff" ? "warn" : c.status === "closed" ? "neutral" : "ok"}>{c.status}</Badge></td>
                      <td className="py-2 pr-4">{c.lastMessageAt.toISOString().replace("T", " ").slice(0, 16)}</td>
                      <td className="py-2 pr-4">
                        <Link href={`/admin/businesses/${biz.id}/conversations/${c.id}`} className="text-sky-600 hover:underline">
                          Otvori →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "handoffs" && (
        <Card>
          <h2 className="font-semibold">Handoffs</h2>
          {handoffRows.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ink-soft)]">No handoffs.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {handoffRows.map(({ h, channel, customer, sender }) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--card-border)] bg-white/60 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <Badge tone={h.status === "open" ? "warn" : "ok"}>{h.status}</Badge> <Badge tone="info">{channel ?? "—"}</Badge> {customer || sender || "customer"}
                    <span className="text-[var(--ink-soft)]"> — {h.reason || h.triggerWord || "handoff"}</span>
                  </span>
                  {h.status === "open" && (
                    <form action={resolveHandoffAction}>
                      <input type="hidden" name="businessId" value={biz.id} />
                      <input type="hidden" name="id" value={h.id} />
                      <button className="btn-primary rounded-lg px-3 py-1 text-xs font-medium">Resolve & resume bot</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "orders" && (
        <Card>
          <h2 className="font-semibold">Orders</h2>
          {orderRows.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ink-soft)]">No orders.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {orderRows.map((o) => (
                <div key={o.id} className="rounded-lg border border-[var(--card-border)] bg-white/60 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{o.customerName || "—"} · {o.city || "—"}</span>
                    <form action={setOrderStatusAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="businessId" value={biz.id} />
                      <input type="hidden" name="id" value={o.id} />
                      <select name="status" defaultValue={o.status} className="rounded-lg border border-[var(--card-border)] bg-white px-2 py-1 text-xs">
                        {["new", "confirmed", "shipped", "done", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button className="rounded-lg border border-[var(--card-border)] bg-white px-2 py-1 text-xs">Set</button>
                    </form>
                    <form action={deleteOrderAction}>
                      <input type="hidden" name="businessId" value={biz.id} />
                      <input type="hidden" name="id" value={o.id} />
                      <button className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100">Delete</button>
                    </form>
                  </div>
                  <p className="mt-1 text-[var(--ink-soft)]">{o.orderText || "—"}</p>
                  <form action={setOrderNoteAction} className="mt-2 flex gap-1.5">
                    <input type="hidden" name="businessId" value={biz.id} />
                    <input type="hidden" name="orderId" value={o.id} />
                    <input name="note" defaultValue={o.internalNote} placeholder="Internal note" className="w-full rounded-lg border border-[var(--card-border)] bg-white px-2 py-1 text-xs" />
                    <button className="rounded-lg border border-[var(--card-border)] bg-white px-2 py-1 text-xs">Save note</button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "analytics" && (
        <Card>
          <h2 className="font-semibold">Last 30 days</h2>
          {daily.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ink-soft)]">No message activity in the last 30 days.</p>
          ) : (
            <div className="mt-4 flex h-40 items-end gap-1">
              {daily.map((r) => (
                <div key={r.day} className="group relative flex-1" title={`${r.day}: ${r.total} msgs, ${r.ai} AI`}>
                  <div className="w-full rounded-t bg-sky-200" style={{ height: `${(r.total / dailyMax) * 100}%`, minHeight: 2 }} />
                  <div className="absolute bottom-0 w-full rounded-t bg-gradient-to-t from-sky-500 to-cyan-400" style={{ height: `${(r.ai / dailyMax) * 100}%` }} />
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-sm text-[var(--ink-soft)]">Totals: {msg?.n ?? 0} messages · {msg?.ai ?? 0} AI replies · {orderCount?.n ?? 0} orders · est. saved €{savings.savedEur}.</p>
        </Card>
      )}

      {tab === "danger" && (
        <Card className="border-rose-200">
          <h2 className="font-semibold text-rose-700">Danger zone</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">All actions are audit-logged. Status: {biz.status} · {biz.aiMode}.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <form action={pauseBusinessAction}><input type="hidden" name="businessId" value={biz.id} /><button className="w-full rounded-lg border border-[var(--card-border)] bg-white/60 px-3 py-2 text-sm hover:bg-white">{biz.aiMode === "paused" ? "Resume bot" : "Pause bot"}</button></form>
            <form action={resetBotStateAction}><input type="hidden" name="businessId" value={biz.id} /><button className="w-full rounded-lg border border-[var(--card-border)] bg-white/60 px-3 py-2 text-sm hover:bg-white">Reset bot state</button></form>
            <form action={clearTestConversationsAction}><input type="hidden" name="businessId" value={biz.id} /><button className="w-full rounded-lg border border-[var(--card-border)] bg-white/60 px-3 py-2 text-sm hover:bg-white">Clear test conversations</button></form>
            <form action={disconnectChannelsAction}><input type="hidden" name="businessId" value={biz.id} /><button className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100">Disconnect channels</button></form>
            <form action={archiveBusinessAction}><input type="hidden" name="businessId" value={biz.id} /><button className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100">Archive business</button></form>
          </div>
          <div className="mt-4 border-t border-rose-200 pt-4">
            <DeleteBusinessForm businessId={biz.id} slug={biz.slug} />
          </div>
        </Card>
      )}

      {tab === "logs" && (
        <BusinessLogs businessId={biz.id} logs={logs} basePath={`/admin/businesses/${biz.id}?tab=logs`} activeSource={logSource} canResolve={true} />
      )}

      {tab === "overview" && (
      <>
      {missing.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <h2 className="font-semibold text-amber-800">Setup incomplete</h2>
          <p className="mt-1 text-sm text-amber-800">Missing: {missing.join(" · ")}</p>
        </Card>
      )}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Messages" value={msg?.n ?? 0} />
        <Stat label="AI replies" value={msg?.ai ?? 0} />
        <Stat label="Orders" value={orderCount?.n ?? 0} />
        <Stat label="Open handoffs" value={handoffOpen?.n ?? 0} tone={handoffOpen?.n ? "warn" : "default"} hint={`${handoffRate}% of msgs`} />
        <Stat label="AI cost (all-time)" value={`$${Number(msg?.cost ?? 0).toFixed(2)}`} hint={`${(msg?.tokens ?? 0).toLocaleString()} tokens`} />
        <Stat label="Est. saved" value={`€${savings.savedEur}`} tone="ok" />
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="AI cost — today" value={`$${costWindows.daily.toFixed(2)}`} />
        <Stat label="AI cost — 7 days" value={`$${costWindows.weekly.toFixed(2)}`} />
        <Stat label="AI cost — 30 days" value={`$${costWindows.monthly.toFixed(2)}`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <AdminBusinessForm
          key={biz.updatedAt.toISOString()}
          businessId={biz.id}
          defaults={{
            plan: biz.plan,
            status: biz.status,
            aiMode: biz.aiMode,
            handoffEnabled: biz.handoffEnabled,
            aiProvider: settings?.aiProvider ?? "openai",
            selectedModel: biz.selectedModel,
            dailyMessageLimit: biz.dailyMessageLimit,
            monthlyMessageLimit: biz.monthlyMessageLimit,
            tone: biz.tone,
            clientId: biz.clientId
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
                      <Badge tone={c.status === "active" || c.status === "connected" ? "ok" : c.status === "error" ? "error" : "warn"}>{c.status}</Badge>
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

      <Card className="border-rose-200">
        <h2 className="font-semibold text-rose-700">Delete business</h2>
        <div className="mt-3">
          <DeleteBusinessForm businessId={biz.id} slug={biz.slug} />
        </div>
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
