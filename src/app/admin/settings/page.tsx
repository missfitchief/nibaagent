import { requireAdmin } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { platformOverview, resolvePlatform } from "@/lib/platform";
import { PlatformSettingsForm, type PlatformField } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [overview, appUrl] = await Promise.all([platformOverview(), resolvePlatform("APP_URL")]);
  const fields: PlatformField[] = overview.map((o) => ({ key: o.key, secret: o.secret, source: o.source, display: o.display }));
  const e = env();
  const envStatus = [
    { label: "DATABASE_URL", ok: Boolean(e.DATABASE_URL) },
    { label: "ENCRYPTION_KEY", ok: Boolean(e.ENCRYPTION_KEY) },
    { label: "AUTH_SECRET", ok: Boolean(e.AUTH_SECRET) }
  ];

  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Platform app settings</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Configure the platform from here. Values saved here override environment variables. Secrets are encrypted and shown masked — leave a
          secret field blank to keep the current value.
        </p>
      </header>
      <PlatformSettingsForm fields={fields} initialAppUrl={appUrl.value} envStatus={envStatus} />
    </main>
  );
}
