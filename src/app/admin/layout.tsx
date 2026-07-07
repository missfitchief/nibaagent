import { requireAdmin } from "@/lib/auth/guards";
import { ADMIN_NAV, Shell } from "@/components/shell";
import { Badge } from "@/components/ui";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <Shell nav={ADMIN_NAV} userLabel={`${admin.email} (admin)`} accent={<Badge tone="info">Admin console</Badge>}>
      {children}
    </Shell>
  );
}
