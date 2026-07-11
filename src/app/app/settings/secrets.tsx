"use client";

import { useActionState } from "react";
import { setSecretAction, deleteSecretAction } from "@/lib/actions/secrets";
import type { ActionState } from "@/lib/actions/business";
import type { MaskedSecret } from "@/lib/secrets";
import { Badge, Button, Card, ErrorNote, Input, Label } from "@/components/ui";

const LABELS: Record<string, { title: string; hint: string; placeholder: string; ai?: boolean }> = {
  openai_api_key: {
    title: "OpenAI API ključ (biznis)",
    hint: "API ključ biznisa — trošak ide direktno preko naloga ovog biznisa. Ostavite prazno da se koristi platformski ključ.",
    placeholder: "sk-…",
    ai: true
  },
  anthropic_api_key: {
    title: "Anthropic (Claude) API ključ (biznis)",
    hint: "API ključ biznisa za Claude modele — trošak ide preko naloga ovog biznisa. Prazno = platformski ključ.",
    placeholder: "sk-ant-…",
    ai: true
  },
  telegram_bot_token: {
    title: "Telegram bot token",
    hint: "Od @BotFather. Koristi se samo za obaveštenja ovog biznisa.",
    placeholder: "123456:ABC…"
  },
  telegram_chat_id: {
    title: "Telegram chat / channel id",
    hint: "Gde stižu obaveštenja o predaji razgovora i porudžbinama.",
    placeholder: "-1001234567890"
  }
};

export interface KeyUsageView {
  mode: "platform_key_only" | "business_key_allowed" | "business_key_required";
  provider: string;
  source: "business_key" | "platform_key" | "none";
  ready: boolean;
  reason: string;
  isAdmin: boolean;
}

function usageLine(u: KeyUsageView): { text: string; tone: "ok" | "warn" | "error" } {
  if (u.source === "business_key") return { text: `Trenutno se koristi: API ključ biznisa (${u.provider}).`, tone: "ok" };
  if (u.source === "platform_key") return { text: `Trenutno se koristi: platformski ključ (${u.provider}) — trošak ide preko platforme.`, tone: "ok" };
  return { text: `Trenutno se koristi: nijedan ključ (nedostaje) — bot ne može da poziva AI.`, tone: u.mode === "business_key_required" ? "error" : "warn" };
}

export function SecretsPanel({ businessId, secrets, usage }: { businessId: string; secrets: MaskedSecret[]; usage?: KeyUsageView }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setSecretAction, {});
  // Clients cannot enter their own AI key when the platform is in platform_key_only mode; admins always can.
  const canEnterAiKey = !usage || usage.mode !== "platform_key_only" || usage.isAdmin;

  return (
    <Card>
      <h2 className="font-semibold">Integracije i ključevi</h2>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">
        Čuva se šifrovano. Nakon čuvanja prikazuje se samo maskirani pregled — pun ključ se nikada ne prikazuje ni šalje nazad u
        pregledač.
      </p>

      {usage && (
        <div
          className={
            "mt-3 rounded-xl border px-3 py-2 text-sm " +
            (usageLine(usage).tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : usageLine(usage).tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-amber-200 bg-amber-50 text-amber-700")
          }
        >
          {usageLine(usage).text}
          {!usage.ready && usage.reason ? <span className="block text-xs opacity-90">{usage.reason}</span> : null}
        </div>
      )}

      <div className="mt-4 space-y-5">
        {secrets.map((s) => {
          const meta = LABELS[s.kind];
          if (!meta) return null;
          if (meta.ai && !canEnterAiKey) {
            return (
              <div key={s.kind} className="rounded-xl border border-[var(--card-border)] bg-slate-50 p-4 text-xs text-[var(--ink-soft)]">
                <div className="font-medium">{meta.title}</div>
                <p className="mt-1">Platforma koristi zajednički ključ (platform_key_only) — unos ključa biznisa je onemogućen. Obratite se podršci ako želite svoj ključ.</p>
              </div>
            );
          }
          return (
            <div key={s.kind} className="rounded-xl border border-[var(--card-border)] bg-white/60 p-4">
              <div className="flex items-center justify-between">
                <Label>{meta.title}</Label>
                {s.hasValue ? <Badge tone="ok">sačuvano {s.preview}</Badge> : <Badge>nije uneto</Badge>}
              </div>
              <p className="mb-2 text-xs text-[var(--ink-soft)]">{meta.hint}</p>
              <form action={formAction} className="flex gap-2">
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="kind" value={s.kind} />
                <Input name="value" type="password" autoComplete="off" placeholder={s.hasValue ? "Unesite novu vrednost da zamenite" : meta.placeholder} />
                <Button type="submit" variant="ghost" disabled={pending}>
                  {pending ? "…" : "Sačuvaj"}
                </Button>
                {s.hasValue && (
                  <button formAction={deleteSecretAction} className="rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50" title="Ukloni">
                    Ukloni
                  </button>
                )}
              </form>
            </div>
          );
        })}
      </div>
      <ErrorNote>{state.error}</ErrorNote>
      {state.ok && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Sačuvano ✓</p>}
    </Card>
  );
}
