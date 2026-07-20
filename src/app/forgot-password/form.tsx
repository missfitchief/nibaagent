"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type PasswordResetRequestState } from "@/lib/actions/auth";
import { Button, ErrorNote, Input, Label } from "@/components/ui";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<PasswordResetRequestState, FormData>(requestPasswordResetAction, {});
  if (state.ok) {
    return (
      <div className="mt-6">
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.note}</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-medium">
          Nazad na prijavu
        </Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="mt-6 space-y-3">
      <div>
        <Label htmlFor="email">Email adresa</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="vi@firma.com" />
      </div>
      <ErrorNote>{state.error}</ErrorNote>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Slanje…" : "Pošalji link za resetovanje"}
      </Button>
    </form>
  );
}
