"use client";

import { useActionState } from "react";
import { addMemberAction } from "@/lib/actions/members";
import type { ActionState } from "@/lib/actions/business";
import { Button, Card, ErrorNote, Input, Label } from "@/components/ui";

export function AddMemberForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addMemberAction, {});
  return (
    <Card className="glass-strong">
      <h2 className="font-semibold">Invite a team member</h2>
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
          {pending ? "…" : "Add"}
        </Button>
      </form>
      <ErrorNote>{state.error}</ErrorNote>
      {state.ok && <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Member added ✓</p>}
    </Card>
  );
}
