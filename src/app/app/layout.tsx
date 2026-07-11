import { requireUser } from "@/lib/auth/guards";
import { isEmailVerified } from "@/lib/verification";
import { CLIENT_NAV, Shell } from "@/components/shell";
import { VerifyEmailGate } from "./verify-gate";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Unverified clients cannot use the dashboard until they confirm their email.
  if (!(await isEmailVerified(user.userId))) {
    return <VerifyEmailGate email={user.email} />;
  }
  return (
    <Shell nav={CLIENT_NAV} userLabel={user.email}>
      {children}
    </Shell>
  );
}
