"use client";

import { useActionState } from "react";
import { resendVerificationAction, logoutAction, type ResendState } from "@/lib/actions/auth";
import { Button, Card } from "@/components/ui";

export function VerifyEmailGate({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<ResendState, FormData>(resendVerificationAction, {});
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-6">
      <Card className="text-center">
        <div className="text-4xl">📧</div>
        <h1 className="mt-3 text-2xl font-semibold">Potvrdite email adresu</h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          Poslali smo verifikacioni link na <strong>{email}</strong>. Otvorite ga da aktivirate nalog i pristupite kontrolnoj
          tabli. Proverite i Spam/Promocije folder.
        </p>
        <form action={formAction} className="mt-5">
          <Button type="submit" disabled={pending}>
            {pending ? "Šaljem…" : "Pošalji link ponovo"}
          </Button>
        </form>
        {state.ok && state.note && <p className="mt-3 text-sm text-emerald-700">{state.note}</p>}
        {state.error && <p className="mt-3 text-sm text-rose-600">{state.error}</p>}
        <form action={logoutAction} className="mt-4">
          <button className="text-xs text-[var(--ink-soft)] underline">Odjavi se</button>
        </form>
      </Card>
    </main>
  );
}
