import { redirect } from "next/navigation";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { SettingsForm } from "./form";

export default async function SettingsPage() {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-[var(--ink-soft)]">Business profile, order sheet and notifications.</p>
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
    </main>
  );
}
