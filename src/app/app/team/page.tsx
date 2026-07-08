import { redirect } from "next/navigation";
import { ownBusiness, requireBusiness, requireUser } from "@/lib/auth/guards";
import { listMembers, removeMemberAction } from "@/lib/actions/members";
import { Badge, Card } from "@/components/ui";
import { AddMemberForm } from "./form";

export default async function TeamPage() {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");
  // Resolve caller role for this business (owner/admin can manage).
  const { role } = await requireBusiness(business.id);
  const canManage = role === "owner" || role === "admin";
  const members = await listMembers(business.id);

  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Roles: <strong>owner/admin</strong> full access incl. keys · <strong>agent</strong> conversations & handoffs, no
          keys · <strong>viewer</strong> read-only.
        </p>
      </header>

      {canManage && <AddMemberForm businessId={business.id} />}

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
    </main>
  );
}
