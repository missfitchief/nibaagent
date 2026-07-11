import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { metaConnections } from "@/lib/db/schema";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { Badge, Card } from "@/components/ui";

export default async function ConnectPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : "";
  const connected = typeof sp.connected === "string";
  const warning = typeof sp.warning === "string" ? sp.warning : "";

  const connections = await db()
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.businessId, business.id))
    .orderBy(desc(metaConnections.updatedAt));

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Connect Facebook and Instagram</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          One login for your Facebook Page and Instagram. NibaChat Agent securely stores your Page token and uses it for
          Messenger and Instagram Direct. No technical setup needed.
        </p>
      </header>

      {connected && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          🎉 Connected! Your AI agent can now see and answer messages (start in Draft mode to review its answers first).
        </p>
      )}
      {warning === "webhook_subscription_failed" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          ⚠️ Your Page and token were saved, but subscribing the Page to message webhooks did not complete. Messages may not
          arrive until this is retried — reconnect, or ask support to finish the webhook subscription.
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Connection problem: {decodeURIComponent(error)} — try again, or ask support to connect you manually.
        </p>
      )}

      <Card className="glass-strong">
        {connections.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="text-4xl">🔌</div>
            <p className="max-w-md text-sm text-[var(--ink-soft)]">
              Click below and approve access for your Facebook Page and its Instagram account. It takes about a minute.
            </p>
            <a
              href={`/api/meta/start?businessId=${business.id}`}
              className="btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold"
            >
              <span aria-hidden>ⓕ</span> Connect via Facebook login
            </a>
            <p className="text-xs text-[var(--ink-soft)]">
              Requirements: your Instagram must be a Business/Creator account linked to your Facebook Page, and you must be an
              admin of the Page.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((c) => (
              <div key={c.id} className="rounded-xl border border-[var(--card-border)] bg-white/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{c.pageName || c.pageId}</div>
                  <Badge tone={c.status === "active" || c.status === "connected" ? "ok" : c.status === "partial" ? "warn" : c.status === "error" ? "error" : "neutral"}>
                    {c.status === "active" || c.status === "connected"
                      ? c.instagramBusinessAccountId
                        ? "Connected"
                        : "Connected (Facebook only)"
                      : c.status === "partial"
                        ? "Facebook only"
                        : c.status}
                  </Badge>
                </div>
                <div className="mt-2 grid gap-1.5 text-sm text-[var(--ink-soft)] sm:grid-cols-2">
                  <div>✅ Facebook Page: {c.pageId}</div>
                  <div>
                    {c.instagramBusinessAccountId ? `✅ Instagram: ${c.instagramBusinessAccountId}` : "⚠️ Instagram not connected"}
                  </div>
                  <div>{c.encryptedPageAccessToken ? "🔒 Token stored encrypted" : "❌ No token stored"}</div>
                  <div>Last updated: {c.updatedAt.toISOString().replace("T", " ").slice(0, 16)}</div>
                </div>
                {c.status === "error" && (
                  <a
                    href={`/api/meta/start?businessId=${business.id}`}
                    className="btn-primary mt-3 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium"
                  >
                    Reconnect
                  </a>
                )}
              </div>
            ))}
            <a href={`/api/meta/start?businessId=${business.id}`} className="inline-block text-sm text-sky-600 hover:underline">
              Connect another page →
            </a>
          </div>
        )}
      </Card>
    </main>
  );
}
