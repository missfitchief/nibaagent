import { redirect } from "next/navigation";
import { accessForUser, ownBusiness, requireUser } from "@/lib/auth/guards";
import { listBusinessLogs } from "@/lib/logs";
import { BusinessLogs } from "@/components/business-logs";

export default async function LogsPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");
  const access = await accessForUser(user, business.id); // own business → not cross-tenant
  const canResolve = access?.role === "owner" || access?.role === "admin";
  const sp = await searchParams;
  const logSource = typeof sp.logSource === "string" ? sp.logSource : "all";
  const logs = await listBusinessLogs(business.id, logSource);

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Logovi</h1>
        <p className="text-sm text-[var(--ink-soft)]">Događaji i greške vašeg biznisa (AI, Meta, webhook, uvoz, obaveštenja).</p>
      </header>
      <BusinessLogs businessId={business.id} logs={logs} basePath="/app/logs" activeSource={logSource} canResolve={canResolve} />
    </main>
  );
}
