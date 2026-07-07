import { requireAdmin } from "@/lib/auth/guards";
import { env, metaRedirectUri } from "@/lib/env";
import { Badge, Card } from "@/components/ui";

function Row({ label, ok, value }: { label: string; ok: boolean; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--card-border)] py-2 text-sm first:border-t-0">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        {value && <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{value}</code>}
        <Badge tone={ok ? "ok" : "warn"}>{ok ? "configured" : "missing"}</Badge>
      </span>
    </div>
  );
}

export default async function AdminSettingsPage() {
  await requireAdmin();
  const e = env();
  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">App settings</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Environment status — values are set in the hosting provider, never here. Secrets are shown as configured/missing only.
        </p>
      </header>
      <Card>
        <h2 className="mb-2 font-semibold">Meta</h2>
        <Row label="META_APP_ID" ok={Boolean(e.META_APP_ID)} value={e.META_APP_ID || undefined} />
        <Row label="META_APP_SECRET" ok={Boolean(e.META_APP_SECRET)} />
        <Row label="META_VERIFY_TOKEN" ok={Boolean(e.META_VERIFY_TOKEN)} />
        <Row label="OAuth redirect URI" ok={true} value={metaRedirectUri()} />
        <p className="mt-2 text-xs text-[var(--ink-soft)]">
          Whitelist the redirect URI in the Meta app: Facebook Login → Settings → Valid OAuth Redirect URIs.
        </p>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Engine & AI</h2>
        <Row label="N8N_WEBHOOK_URL" ok={Boolean(e.N8N_WEBHOOK_URL)} value={e.N8N_WEBHOOK_URL || undefined} />
        <Row label="OPENAI_API_KEY" ok={Boolean(e.OPENAI_API_KEY)} />
        <Row label="DATABASE_URL" ok={Boolean(e.DATABASE_URL)} value={e.DATABASE_URL ? "postgres (hidden)" : "embedded dev DB"} />
        <Row label="ENCRYPTION_KEY" ok={Boolean(e.ENCRYPTION_KEY)} />
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Notifications</h2>
        <Row label="TELEGRAM_BOT_TOKEN" ok={Boolean(e.TELEGRAM_BOT_TOKEN)} />
        <Row label="WHATSAPP_PROVIDER_API_KEY" ok={Boolean(e.WHATSAPP_PROVIDER_API_KEY)} />
      </Card>
    </main>
  );
}
