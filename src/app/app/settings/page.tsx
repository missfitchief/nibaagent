import { redirect } from "next/navigation";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { listMaskedSecrets } from "@/lib/secrets";
import { VERSION } from "@/lib/version";
import { SettingsForm } from "./form";
import { SecretsPanel } from "./secrets";

export default async function SettingsPage() {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");
  const secrets = await listMaskedSecrets(business.id);

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-[var(--ink-soft)]">Business profile, integrations, order sheet and notifications.</p>
      </header>
      <SettingsForm
        businessId={business.id}
        defaults={{
          name: business.name,
          defaultLanguage: business.defaultLanguage,
          googleSheetUrl: business.googleSheetUrl,
          telegramChannelId: business.telegramChannelId,
          whatsappNotificationTarget: business.whatsappNotificationTarget
        }}
      />
      <SecretsPanel businessId={business.id} secrets={secrets} />
      <p className="text-center text-xs text-[var(--ink-soft)]">
        NibaChat Agent · build {VERSION.commit} · {VERSION.buildTime.slice(0, 16).replace("T", " ")} · {VERSION.env}
      </p>
    </main>
  );
}
