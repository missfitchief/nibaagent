"use client";

import { useActionState } from "react";
import { setSecretAction, deleteSecretAction } from "@/lib/actions/secrets";
import type { ActionState } from "@/lib/actions/business";
import type { MaskedSecret } from "@/lib/secrets";
import { Badge, Button, Card, ErrorNote, Input, Label } from "@/components/ui";

const LABELS: Record<string, { title: string; hint: string; placeholder: string }> = {
  openai_api_key: {
    title: "OpenAI API key (optional)",
    hint: "Bring your own key to be billed directly. Leave empty to use the NibaChat platform key.",
    placeholder: "sk-…"
  },
  telegram_bot_token: {
    title: "Telegram bot token",
    hint: "From @BotFather. Used only for this business's notifications.",
    placeholder: "123456:ABC…"
  },
  telegram_chat_id: {
    title: "Telegram chat / channel id",
    hint: "Where handoff & order alerts are sent.",
    placeholder: "-1001234567890"
  }
};

export function SecretsPanel({ businessId, secrets }: { businessId: string; secrets: MaskedSecret[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setSecretAction, {});
  return (
    <Card>
      <h2 className="font-semibold">Integrations & keys</h2>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">
        Stored encrypted. After saving, only a masked preview is ever shown — the full value is never displayed or sent to
        your browser again.
      </p>
      <div className="mt-4 space-y-5">
        {secrets.map((s) => {
          const meta = LABELS[s.kind];
          return (
            <div key={s.kind} className="rounded-xl border border-[var(--card-border)] bg-white/60 p-4">
              <div className="flex items-center justify-between">
                <Label>{meta.title}</Label>
                {s.hasValue ? <Badge tone="ok">saved {s.preview}</Badge> : <Badge>not set</Badge>}
              </div>
              <p className="mb-2 text-xs text-[var(--ink-soft)]">{meta.hint}</p>
              <form action={formAction} className="flex gap-2">
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="kind" value={s.kind} />
                <Input name="value" type="password" autoComplete="off" placeholder={s.hasValue ? "Enter a new value to replace" : meta.placeholder} />
                <Button type="submit" variant="ghost" disabled={pending}>
                  {pending ? "…" : "Save"}
                </Button>
                {s.hasValue && (
                  <button
                    formAction={deleteSecretAction}
                    className="rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                    title="Remove"
                  >
                    Remove
                  </button>
                )}
              </form>
            </div>
          );
        })}
      </div>
      <ErrorNote>{state.error}</ErrorNote>
      {state.ok && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved ✓</p>}
    </Card>
  );
}
