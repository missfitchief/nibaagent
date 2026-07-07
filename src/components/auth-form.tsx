"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, ErrorNote, Input, Label } from "./ui";
import type { AuthState } from "@/lib/actions/auth";

export function AuthForm({
  action,
  title,
  subtitle,
  submitLabel,
  withName = false,
  footer
}: {
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  title: string;
  subtitle: string;
  submitLabel: string;
  withName?: boolean;
  footer?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="glass glass-strong mx-auto w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">{subtitle}</p>
      <form action={formAction} className="mt-6 space-y-4">
        {withName && (
          <div>
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" autoComplete="name" placeholder="Jane Doe" />
          </div>
        )}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@business.com" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="current-password" placeholder="••••••••" />
        </div>
        <ErrorNote>{state.error}</ErrorNote>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Please wait…" : submitLabel}
        </Button>
      </form>
      {footer && <div className="mt-4 text-center text-sm text-[var(--ink-soft)]">{footer}</div>}
      <p className="mt-6 text-center">
        <Link href="/" className="text-sm text-sky-600 hover:underline">
          ← Back to NibaChat Agent
        </Link>
      </p>
    </div>
  );
}
