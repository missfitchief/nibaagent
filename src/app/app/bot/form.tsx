"use client";

import { useActionState } from "react";
import { updateBotSettingsAction } from "@/lib/actions/settings";
import type { ActionState } from "@/lib/actions/business";
import { Button, Card, ErrorNote, Label, Textarea } from "@/components/ui";

export function BotSettingsForm({
  businessId,
  defaults
}: {
  businessId: string;
  defaults: {
    tone: string;
    customInstructions: string;
    orderCollectionEnabled: boolean;
    orderPrompt: string;
    handoffWords: string;
  };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateBotSettingsAction, {});
  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="businessId" value={businessId} />
        <div>
          <Label htmlFor="tone">Tone</Label>
          <select
            id="tone"
            name="tone"
            defaultValue={defaults.tone}
            className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          >
            {["professional", "friendly", "luxury", "casual", "short", "detailed"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="customInstructions">Custom instructions</Label>
          <Textarea
            id="customInstructions"
            name="customInstructions"
            rows={4}
            defaultValue={defaults.customInstructions}
            placeholder="e.g. Always mention free delivery over 50 KM. Never promise same-day delivery."
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="orderCollectionEnabled"
            name="orderCollectionEnabled"
            type="checkbox"
            value="true"
            defaultChecked={defaults.orderCollectionEnabled}
            className="h-4 w-4 rounded border-slate-300"
          />
          <Label htmlFor="orderCollectionEnabled">Collect orders in chat (name, address, phone, city…)</Label>
        </div>
        <div>
          <Label htmlFor="orderPrompt">Order collection notes (optional)</Label>
          <Textarea
            id="orderPrompt"
            name="orderPrompt"
            rows={2}
            defaultValue={defaults.orderPrompt}
            placeholder="e.g. Also ask for preferred delivery time."
          />
        </div>
        <div>
          <Label htmlFor="handoffWords">Handoff trigger words (comma separated)</Label>
          <Textarea id="handoffWords" name="handoffWords" rows={2} defaultValue={defaults.handoffWords} />
          <p className="mt-1 text-xs text-[var(--ink-soft)]">
            When a customer message contains one of these, the bot goes silent and the conversation appears in your Handoff list.
          </p>
        </div>
        <ErrorNote>{state.error}</ErrorNote>
        {state.ok && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved ✓</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save bot settings"}
        </Button>
      </form>
    </Card>
  );
}
