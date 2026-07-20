import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { botSettings } from "@/lib/db/schema";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { setAiModeAction } from "@/lib/actions/settings";
import { Badge, Card } from "@/components/ui";
import { BotSettingsForm } from "./form";
import type { BusinessHours } from "@/lib/hours";

export default async function BotSettingsPage() {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");
  const [settings] = await db().select().from(botSettings).where(eq(botSettings.businessId, business.id)).limit(1);

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Bot settings</h1>
        <p className="text-sm text-[var(--ink-soft)]">How your AI agent talks and behaves.</p>
      </header>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Launch mode</h2>
            <p className="text-sm text-[var(--ink-soft)]">
              Draft = the AI prepares answers but never sends. Live = answers customers automatically. Paused = off.
            </p>
          </div>
          <Badge tone={business.aiMode === "live" ? "ok" : business.aiMode === "draft" ? "info" : "warn"}>{business.aiMode}</Badge>
        </div>
        <div className="mt-3 flex gap-2">
          {(["draft", "live", "paused"] as const).map((mode) => (
            <form key={mode} action={setAiModeAction}>
              <input type="hidden" name="businessId" value={business.id} />
              <input type="hidden" name="aiMode" value={mode} />
              <button
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  business.aiMode === mode ? "btn-primary" : "border border-[var(--card-border)] bg-white/60 hover:bg-white"
                }`}
              >
                {mode === "draft" ? "🧪 Draft" : mode === "live" ? "🟢 Live" : "⏸ Paused"}
              </button>
            </form>
          ))}
        </div>
      </Card>

      <BotSettingsForm
        key={settings?.updatedAt.toISOString() ?? "new"}
        businessId={business.id}
        defaults={{
          tone: settings?.tone ?? "friendly",
          customInstructions: settings?.customInstructions ?? "",
          orderCollectionEnabled: settings?.orderCollectionEnabled ?? true,
          orderPrompt: settings?.orderPrompt ?? "",
          handoffWords: ((settings?.handoffWords as string[]) ?? []).join(", "),
          aiProvider: settings?.aiProvider ?? "openai",
          selectedModel: business.selectedModel,
          aiStrategy: settings?.aiStrategy ?? "rules_first",
          persiranje: settings?.persiranje ?? true,
          imageRecognitionEnabled: settings?.imageRecognitionEnabled ?? true,
          replyDelaySeconds: settings?.replyDelaySeconds ?? 0,
          unknownBehavior: settings?.unknownBehavior ?? "offer_handoff",
          handoffThreshold: settings?.handoffThreshold ?? 40,
          businessHours: (settings?.businessHours as BusinessHours) ?? { enabled: false }
        }}
      />
    </main>
  );
}
