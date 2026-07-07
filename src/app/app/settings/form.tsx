"use client";

import { useActionState } from "react";
import { updateBusinessSettingsAction } from "@/lib/actions/settings";
import type { ActionState } from "@/lib/actions/business";
import { Button, Card, ErrorNote, Input, Label } from "@/components/ui";

export function SettingsForm({
  businessId,
  defaults
}: {
  businessId: string;
  defaults: {
    name: string;
    defaultLanguage: string;
    googleSheetUrl: string;
    telegramChannelId: string;
    whatsappNotificationTarget: string;
  };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateBusinessSettingsAction, {});
  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="businessId" value={businessId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">Business name</Label>
            <Input id="name" name="name" required defaultValue={defaults.name} />
          </div>
          <div>
            <Label htmlFor="defaultLanguage">Customer language</Label>
            <select
              id="defaultLanguage"
              name="defaultLanguage"
              defaultValue={defaults.defaultLanguage}
              className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
            >
              <option value="sr">Serbian</option>
              <option value="bs">Bosnian</option>
              <option value="hr">Croatian</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="googleSheetUrl">Google Sheet URL for orders (optional)</Label>
          <Input
            id="googleSheetUrl"
            name="googleSheetUrl"
            defaultValue={defaults.googleSheetUrl}
            placeholder="https://docs.google.com/spreadsheets/d/…"
          />
          <p className="mt-1 text-xs text-[var(--ink-soft)]">
            Collected orders are appended to this sheet. They are always saved in NibaChat too, so nothing is lost if the sheet fails.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="telegramChannelId">Telegram chat/channel ID (optional)</Label>
            <Input id="telegramChannelId" name="telegramChannelId" defaultValue={defaults.telegramChannelId} placeholder="-1001234567890" />
          </div>
          <div>
            <Label htmlFor="whatsappNotificationTarget">WhatsApp number (optional)</Label>
            <Input
              id="whatsappNotificationTarget"
              name="whatsappNotificationTarget"
              defaultValue={defaults.whatsappNotificationTarget}
              placeholder="+38761123456"
            />
          </div>
        </div>
        <ErrorNote>{state.error}</ErrorNote>
        {state.ok && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved ✓</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </Card>
  );
}
