import { redirect } from "next/navigation";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { TestBotForm } from "./form";

export default async function TestBotPage() {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");

  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Test your bot</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Send test messages without touching real Instagram/Facebook. You see exactly what the bot would do: detected intent,
          knowledge used and model.
        </p>
      </header>
      <TestBotForm businessId={business.id} />
    </main>
  );
}
