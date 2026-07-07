"use client";

import { useActionState } from "react";
import { adminManualConnectionAction, adminUpdateBusinessAction } from "@/lib/actions/admin";
import type { ActionState } from "@/lib/actions/business";
import { Button, Card, ErrorNote, Input, Label } from "@/components/ui";

function Select({ name, defaultValue, options, id }: { name: string; defaultValue: string; options: string[]; id?: string }) {
  return (
    <select
      id={id ?? name}
      name={name}
      defaultValue={defaultValue}
      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function AdminBusinessForm({
  businessId,
  defaults
}: {
  businessId: string;
  defaults: {
    plan: string;
    status: string;
    aiMode: string;
    handoffEnabled: boolean;
    selectedModel: string;
    dailyMessageLimit: number;
    monthlyMessageLimit: number;
    tone: string;
  };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(adminUpdateBusinessAction, {});
  return (
    <Card>
      <h2 className="font-semibold">Business controls</h2>
      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="businessId" value={businessId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="plan">Plan</Label>
            <Select name="plan" defaultValue={defaults.plan} options={["free", "basic", "standard", "pro", "business", "enterprise"]} />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={defaults.status} options={["active", "inactive"]} />
          </div>
          <div>
            <Label htmlFor="aiMode">AI mode</Label>
            <Select name="aiMode" defaultValue={defaults.aiMode} options={["draft", "live", "paused"]} />
          </div>
          <div>
            <Label htmlFor="selectedModel">Model</Label>
            <Select name="selectedModel" defaultValue={defaults.selectedModel} options={["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"]} />
          </div>
          <div>
            <Label htmlFor="dailyMessageLimit">Daily message limit</Label>
            <Input name="dailyMessageLimit" type="number" min={0} defaultValue={defaults.dailyMessageLimit} />
          </div>
          <div>
            <Label htmlFor="monthlyMessageLimit">Monthly message limit</Label>
            <Input name="monthlyMessageLimit" type="number" min={0} defaultValue={defaults.monthlyMessageLimit} />
          </div>
          <div>
            <Label htmlFor="tone">Tone</Label>
            <Select name="tone" defaultValue={defaults.tone} options={["professional", "friendly", "luxury", "casual", "short", "detailed"]} />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <input
              id="handoffEnabled"
              name="handoffEnabled"
              type="checkbox"
              value="true"
              defaultChecked={defaults.handoffEnabled}
              className="h-4 w-4 rounded border-slate-300"
            />
            <Label htmlFor="handoffEnabled">Handoff enabled</Label>
          </div>
        </div>
        <ErrorNote>{state.error}</ErrorNote>
        {state.ok && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved ✓</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save controls"}
        </Button>
      </form>
    </Card>
  );
}

export function ManualConnectionForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(adminManualConnectionAction, {});
  return (
    <Card>
      <h2 className="font-semibold">Manual connection</h2>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">
        Fallback when OAuth is not possible. Tokens are encrypted at rest and never shown again.
      </p>
      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="businessId" value={businessId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="pageId">Page ID *</Label>
            <Input name="pageId" required placeholder="547758538411119" />
          </div>
          <div>
            <Label htmlFor="pageName">Page name</Label>
            <Input name="pageName" placeholder="Star Light Nakit" />
          </div>
        </div>
        <div>
          <Label htmlFor="pageAccessToken">Page access token</Label>
          <Input name="pageAccessToken" type="password" placeholder="EAAG…" autoComplete="off" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="instagramBusinessAccountId">Instagram Business ID</Label>
            <Input name="instagramBusinessAccountId" placeholder="17841…" />
          </div>
          <div>
            <Label htmlFor="instagramAccessToken">Instagram token (if separate)</Label>
            <Input name="instagramAccessToken" type="password" autoComplete="off" />
          </div>
        </div>
        <ErrorNote>{state.error}</ErrorNote>
        {state.ok && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Connection saved ✓</p>}
        <Button type="submit" disabled={pending} variant="ghost">
          {pending ? "Saving…" : "Save manual connection"}
        </Button>
      </form>
    </Card>
  );
}
