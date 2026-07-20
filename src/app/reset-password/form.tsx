"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction, type PasswordResetState } from "@/lib/actions/auth";
import { Button, ErrorNote, Input, Label } from "@/components/ui";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<PasswordResetState, FormData>(resetPasswordAction, {});
  if (state.ok) {
    return (
      <div className="mt-6">
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Lozinka je uspešno promenjena. Sada se možete prijaviti.
        </p>
        <Link href="/login" className="btn-primary mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-medium">
          Idi na prijavu
        </Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="mt-6 space-y-3">
      <input type="hidden" name="token" value={token} />
      <div>
        <Label htmlFor="password">Nova lozinka</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <div>
        <Label htmlFor="confirm">Ponovite lozinku</Label>
        <Input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <ErrorNote>{state.error}</ErrorNote>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Čuvanje…" : "Sačuvaj novu lozinku"}
      </Button>
    </form>
  );
}
