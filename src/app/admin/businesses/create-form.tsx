"use client";

import { useActionState } from "react";
import { adminCreateBusinessAction } from "@/lib/actions/admin";
import type { ActionState } from "@/lib/actions/business";
import { Button, Card, ErrorNote, Input, Label } from "@/components/ui";

export function AdminCreateBusinessForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(adminCreateBusinessAction, {});
  return (
    <Card className="glass-strong">
      <h2 className="font-semibold">Create a business</h2>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <Label htmlFor="name">Business name</Label>
          <Input id="name" name="name" required placeholder="e.g. StarLight Nakit" />
        </div>
        <div className="min-w-[200px] flex-1">
          <Label htmlFor="ownerEmail">Owner email</Label>
          <Input id="ownerEmail" name="ownerEmail" type="email" required placeholder="owner@business.com" />
        </div>
        <div>
          <Label htmlFor="defaultLanguage">Language</Label>
          <select
            id="defaultLanguage"
            name="defaultLanguage"
            defaultValue="sr"
            className="rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          >
            <option value="sr">Serbian</option>
            <option value="bs">Bosnian</option>
            <option value="hr">Croatian</option>
            <option value="en">English</option>
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create business"}
        </Button>
      </form>
      <ErrorNote>{state.error}</ErrorNote>
      <p className="mt-2 text-xs text-[var(--ink-soft)]">
        Creates the owner account if it doesn&apos;t exist. You&apos;ll be taken to the business detail page to configure everything.
      </p>
    </Card>
  );
}
