import { redirect } from "next/navigation";
import { ownBusiness, requireBusiness, requireUser } from "@/lib/auth/guards";
import { listMembers, removeMemberAction } from "@/lib/actions/members";
import { listPendingInvites, revokeInviteAction } from "@/lib/actions/invites";
import { Badge, Card } from "@/components/ui";
import { InviteForm } from "./form";

export default async function TeamPage() {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");
  const { role } = await requireBusiness(business.id);
  const canManage = role === "owner" || role === "admin";
  const members = await listMembers(business.id);
  const invitesPending = canManage ? await listPendingInvites(business.id) : [];

  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Roles: <strong>owner/admin</strong> full access incl. keys · <strong>agent</strong> conversations & handoffs, no
          keys · <strong>viewer</strong> read-only.
        </p>
      </header>

      {canManage && <InviteForm businessId={business.id} />}

      <Card>
        <h2 className="font-semibold">Members</h2>
        <ul className="mt-3 space-y-2">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-white/60 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{m.email}</div>
                <div className="text-xs text-[var(--ink-soft)]">{m.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.isOwner ? "ok" : "info"}>{m.role}</Badge>
                {canManage && !m.isOwner && (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <button className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Remove</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {canManage && invitesPending.length > 0 && (
        <Card>
          <h2 className="font-semibold">Pending invites</h2>
          <ul className="mt-3 space-y-2">
            {invitesPending.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-white/60 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {inv.email} · <Badge tone="info">{inv.role}</Badge> · expires {inv.expiresAt.toISOString().slice(0, 10)}
                </span>
                <form action={revokeInviteAction}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="inviteId" value={inv.id} />
                  <button className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Revoke</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
