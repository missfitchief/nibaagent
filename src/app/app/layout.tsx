import { requireUser } from "@/lib/auth/guards";
import { CLIENT_NAV, Shell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <Shell nav={CLIENT_NAV} userLabel={user.email}>
      {children}
    </Shell>
  );
}
