"use client";

import { useActionState } from "react";
import Link from "next/link";
import { acceptInviteAction } from "@/lib/actions/invites";
import type { ActionState } from "@/lib/actions/business";
import { Button, ErrorNote, Input, Label } from "@/components/ui";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(acceptInviteAction, {});
  if (state.ok) {
    return (
      <div className="mt-6">
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          You&apos;ve joined the team. You can now log in.
        </p>
        <Link href="/login" className="btn-primary mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-medium">
          Go to login
        </Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="mt-6 space-y-3">
      <input type="hidden" name="token" value={token} />
      <div>
        <Label htmlFor="password">Choose a password</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <ErrorNote>{state.error}</ErrorNote>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Joining…" : "Accept & join"}
      </Button>
    </form>
  );
}
