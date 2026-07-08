import { requireAdmin } from "@/lib/auth/guards";
import { ADMIN_NAV, Shell } from "@/components/shell";
import { Badge } from "@/components/ui";
import { VERSION } from "@/lib/version";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const accent = (
    <div className="space-y-2">
      <Badge tone="info">Admin console</Badge>
      <div className="rounded-lg border border-[var(--card-border)] bg-white/50 px-2 py-1.5 text-[10px] leading-tight text-[var(--ink-soft)]">
        <div>build {VERSION.commit}</div>
        <div>{VERSION.buildTime.slice(0, 16).replace("T", " ")}</div>
        <div>env: {VERSION.env}</div>
      </div>
    </div>
  );
  return (
    <Shell nav={ADMIN_NAV} userLabel={`${admin.email} (admin)`} accent={accent}>
      {children}
    </Shell>
  );
}
