"use client";

import { useActionState } from "react";
import { createBusinessAction, type ActionState } from "@/lib/actions/business";
import { Button, Card, ErrorNote, Input, Label } from "@/components/ui";

const steps = ["Business profile", "Connect FB/IG", "Business info", "Order rules", "Tone", "Test", "Go live"];

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createBusinessAction, {});
  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Welcome! Let’s set up your AI agent 🎉</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Step 1 of {steps.length} — create your business profile. You can change everything later.
        </p>
        <ol className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {steps.map((s, i) => (
            <li
              key={s}
              className={`rounded-full px-2.5 py-1 ${i === 0 ? "btn-primary" : "border border-[var(--card-border)] bg-white/60 text-[var(--ink-soft)]"}`}
            >
              {i + 1}. {s}
            </li>
          ))}
        </ol>
      </header>

      <Card className="glass-strong">
        <form action={formAction} className="space-y-4">
          <div>
            <Label htmlFor="name">Business name</Label>
            <Input id="name" name="name" required minLength={2} placeholder="e.g. StarLight Nakit" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="defaultLanguage">Customers mostly write in</Label>
              <select
                id="defaultLanguage"
                name="defaultLanguage"
                defaultValue="sr"
                className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                <option value="sr">Serbian</option>
                <option value="bs">Bosnian</option>
                <option value="hr">Croatian</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <Label htmlFor="tone">Bot tone</Label>
              <select
                id="tone"
                name="tone"
                defaultValue="friendly"
                className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                <option value="friendly">Friendly</option>
                <option value="professional">Professional</option>
                <option value="luxury">Luxury</option>
                <option value="casual">Casual</option>
                <option value="short">Short & direct</option>
                <option value="detailed">Detailed</option>
              </select>
            </div>
          </div>
          <ErrorNote>{state.error}</ErrorNote>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating…" : "Create business & continue"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
