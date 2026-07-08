"use client";

import { useActionState, useState } from "react";
import { createInviteAction, type InviteState } from "@/lib/actions/invites";
import { Button, Card, ErrorNote, Input, Label } from "@/components/ui";

export function InviteForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(createInviteAction, {});
  const [copied, setCopied] = useState(false);
  return (
    <Card className="glass-strong">
      <h2 className="font-semibold">Invite a team member</h2>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">
        Creates a secure invite link (valid 7 days). Email delivery isn&apos;t configured yet — copy the link and send it yourself.
      </p>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="businessId" value={businessId} />
        <div className="min-w-[200px] flex-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="colleague@business.com" />
        </div>
        <div>
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            name="role"
            defaultValue="agent"
            className="rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          >
            <option value="admin">admin</option>
            <option value="agent">agent</option>
            <option value="viewer">viewer</option>
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "…" : "Create invite"}
        </Button>
      </form>
      <ErrorNote>{state.error}</ErrorNote>
      {state.inviteUrl && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm text-emerald-800">Invite link (send to the person):</p>
          <div className="mt-1 flex gap-2">
            <input readOnly value={state.inviteUrl} className="w-full rounded-lg border border-emerald-200 bg-white px-2 py-1 text-xs" />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(state.inviteUrl!);
                setCopied(true);
              }}
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1 text-xs font-medium hover:bg-emerald-100"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
