"use client";

import { useActionState, useState } from "react";
import { updateBotSettingsAction } from "@/lib/actions/settings";
import type { ActionState } from "@/lib/actions/business";
import type { BusinessHours } from "@/lib/hours";
import { Button, Card, ErrorNote, Input, Label, Textarea } from "@/components/ui";
import { ModelPicker } from "@/components/model-picker";

const selectCls =
  "w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100";

export interface BotFormDefaults {
  tone: string;
  customInstructions: string;
  orderCollectionEnabled: boolean;
  orderPrompt: string;
  handoffWords: string;
  aiProvider: string;
  selectedModel: string;
  aiStrategy: string;
  persiranje: boolean;
  imageRecognitionEnabled: boolean;
  replyDelaySeconds: number;
  unknownBehavior: string;
  handoffThreshold: number;
  businessHours: BusinessHours;
}

export function BotSettingsForm({
  businessId,
  defaults,
  showModelPicker = true
}: {
  businessId: string;
  defaults: BotFormDefaults;
  showModelPicker?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateBotSettingsAction, {});
  const [hoursEnabled, setHoursEnabled] = useState(defaults.businessHours?.enabled ?? false);

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="businessId" value={businessId} />

        {showModelPicker && (
          <div className="rounded-xl border border-[var(--card-border)] bg-slate-50/60 p-3">
            <p className="mb-2 text-sm font-medium">AI model</p>
            <ModelPicker defaultProvider={defaults.aiProvider} defaultModel={defaults.selectedModel} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="tone">Tone</Label>
            <select id="tone" name="tone" defaultValue={defaults.tone} className={selectCls}>
              {["professional", "friendly", "luxury", "casual", "short", "detailed"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="aiStrategy">Answer strategy</Label>
            <select id="aiStrategy" name="aiStrategy" defaultValue={defaults.aiStrategy} className={selectCls}>
              <option value="rules_first">Rules first (cheapest — templates before AI)</option>
              <option value="balanced">Balanced</option>
              <option value="ai_heavy">AI heavy (let the model write more)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="unknownBehavior">When the bot doesn&apos;t know</Label>
            <select id="unknownBehavior" name="unknownBehavior" defaultValue={defaults.unknownBehavior} className={selectCls}>
              <option value="offer_handoff">Offer to connect a human</option>
              <option value="ask_rephrase">Ask the customer to rephrase</option>
              <option value="generic_help">Give a generic helpful reply</option>
            </select>
          </div>
          <div>
            <Label htmlFor="replyDelaySeconds">Reply delay (seconds)</Label>
            <Input id="replyDelaySeconds" name="replyDelaySeconds" type="number" min={0} max={600} defaultValue={defaults.replyDelaySeconds} />
          </div>
          <div>
            <Label htmlFor="handoffThreshold">Match confidence threshold (0–100)</Label>
            <Input id="handoffThreshold" name="handoffThreshold" type="number" min={0} max={100} defaultValue={defaults.handoffThreshold} />
            <p className="mt-1 text-xs text-[var(--ink-soft)]">Below this, a product question is treated as “not sure” and follows the rule above.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input name="persiranje" type="checkbox" value="true" defaultChecked={defaults.persiranje} className="h-4 w-4 rounded border-slate-300" />
            Persiranje (formal “Vi” address in Serbian)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              name="imageRecognitionEnabled"
              type="checkbox"
              value="true"
              defaultChecked={defaults.imageRecognitionEnabled}
              className="h-4 w-4 rounded border-slate-300"
            />
            Recognize product photos customers send
          </label>
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
          <Textarea id="orderPrompt" name="orderPrompt" rows={2} defaultValue={defaults.orderPrompt} placeholder="e.g. Also ask for preferred delivery time." />
        </div>
        <div>
          <Label htmlFor="handoffWords">Handoff trigger words (comma separated)</Label>
          <Textarea id="handoffWords" name="handoffWords" rows={2} defaultValue={defaults.handoffWords} />
          <p className="mt-1 text-xs text-[var(--ink-soft)]">
            When a customer message contains one of these, the bot goes silent and the conversation appears in your Handoff list.
          </p>
        </div>

        {/* Business hours */}
        <div className="rounded-xl border border-[var(--card-border)] p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              name="businessHoursEnabled"
              type="checkbox"
              value="true"
              checked={hoursEnabled}
              onChange={(e) => setHoursEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Only auto-reply during business hours
          </label>
          {hoursEnabled && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="openHour">Open hour (0–23)</Label>
                <Input id="openHour" name="openHour" type="number" min={0} max={23} defaultValue={defaults.businessHours?.openHour ?? 9} />
              </div>
              <div>
                <Label htmlFor="closeHour">Close hour (0–24)</Label>
                <Input id="closeHour" name="closeHour" type="number" min={0} max={24} defaultValue={defaults.businessHours?.closeHour ?? 21} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="offHoursMessage">Off-hours message (optional)</Label>
                <Textarea
                  id="offHoursMessage"
                  name="offHoursMessage"
                  rows={2}
                  defaultValue={defaults.businessHours?.offHoursMessage ?? ""}
                  placeholder="e.g. Hvala na poruci! Javljamo se u toku radnog vremena (09–21h)."
                />
              </div>
            </div>
          )}
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
