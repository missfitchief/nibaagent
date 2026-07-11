"use client";

import { useActionState, useState } from "react";
import { adminManualConnectionAction, adminMoveConnectionAction, adminUpdateBusinessAction } from "@/lib/actions/admin";
import { syncN8nRuntimeAction, telegramTestAction, testImageRecognitionAction, type ImageTestState } from "@/lib/actions/tools";
import { deleteBusinessAction } from "@/lib/actions/danger";
import type { ActionState } from "@/lib/actions/business";
import { Button, Card, ErrorNote, Input, Label } from "@/components/ui";
import { ModelPicker } from "@/components/model-picker";

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
    aiProvider: string;
    selectedModel: string;
    dailyMessageLimit: number;
    monthlyMessageLimit: number;
    tone: string;
    clientId: string;
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
          <div className="sm:col-span-2">
            <ModelPicker defaultProvider={defaults.aiProvider} defaultModel={defaults.selectedModel} />
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
          <div className="sm:col-span-2">
            <Label htmlFor="clientId">n8n Client ID (tenant id)</Label>
            <Input name="clientId" defaultValue={defaults.clientId} placeholder="e.g. starlight" autoComplete="off" />
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              Stable tenant id written to meta_connections.client_id + n8n tables. n8n loads this tenant by this value. Lowercase/dashes only.
            </p>
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

export function DeleteBusinessForm({ businessId, slug }: { businessId: string; slug: string }) {
  const [state, formAction, pending] = useActionState<{ error?: string; ok?: boolean }, FormData>(deleteBusinessAction, {});
  if (state.ok) return <p className="text-sm text-emerald-700">Business deleted.</p>;
  return (
    <div>
      <p className="text-sm font-medium text-rose-700">Delete business permanently</p>
      <p className="mb-2 text-xs text-[var(--ink-soft)]">
        Removes all conversations, products, knowledge, secrets and connections. Type the slug <code className="rounded bg-slate-100 px-1">{slug}</code> to confirm.
      </p>
      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="businessId" value={businessId} />
        <Input name="confirm" placeholder={slug} autoComplete="off" />
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </form>
      <ErrorNote>{state.error}</ErrorNote>
    </div>
  );
}

export function TelegramTestButton({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState<{ ok?: boolean; error?: string }, FormData>(telegramTestAction, {});
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="businessId" value={businessId} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Sending…" : "Send Telegram test"}
      </Button>
      {state.ok && <span className="text-sm text-emerald-600">Sent ✓</span>}
      {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
    </form>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "ok" | "warn" | "error" }) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "error" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "";
  return (
    <div className="flex justify-between gap-3 border-t border-[var(--card-border)] py-1.5 text-sm first:border-t-0">
      <span className="text-[var(--ink-soft)]">{k}</span>
      <span className={"text-right font-medium " + color}>{v}</span>
    </div>
  );
}

export function ImageRecognitionTest({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState<ImageTestState, FormData>(testImageRecognitionAction, {});
  const r = state.result;
  return (
    <Card>
      <h2 className="font-semibold">Test prepoznavanja slike</h2>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">
        Zalepite URL fotografije (kao što n8n prosleđuje) i opciono poruku. Prikazuje ceo tok: tenant, da li je prepoznavanje
        uključeno, provajder/model, uspeh vizije, pronađen proizvod, generisan odgovor i grešku ako je bilo.
      </p>
      <form action={formAction} className="mt-3 space-y-2">
        <input type="hidden" name="businessId" value={businessId} />
        <Input name="imageUrl" placeholder="https://…/slika.jpg" autoComplete="off" required />
        <Input name="message" placeholder="Opciona poruka kupca (npr. „koliko košta ova haljina?“)" autoComplete="off" />
        <Button type="submit" disabled={pending}>
          {pending ? "Analiziram…" : "Testiraj prepoznavanje slike"}
        </Button>
      </form>
      {state.error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      {r && (
        <div className="mt-4 rounded-xl border border-[var(--card-border)] bg-white/60 p-4">
          <Row k="Tenant razrešen" v="da" tone="ok" />
          <Row k="Prepoznavanje uključeno" v={r.recognitionEnabled ? "da" : "ne"} tone={r.recognitionEnabled ? "ok" : "warn"} />
          <Row k="Provajder / model" v={`${r.provider} / ${r.visionModel}`} />
          <Row k="API ključ spreman" v={r.keyReady ? `da (${r.keySource})` : "ne"} tone={r.keyReady ? "ok" : "error"} />
          <Row k="Vizija uspešna" v={r.visionOk ? "da" : "ne"} tone={r.visionOk ? "ok" : "error"} />
          {r.description && <Row k="Opis slike" v={r.description} />}
          <Row k="Pronađen proizvod" v={r.matchedProduct ?? "—"} tone={r.matchedProduct ? "ok" : "warn"} />
          <Row k="Intent" v={r.intent || "—"} />
          {r.error && <Row k="Greška" v={r.error} tone="error" />}
          {r.answer && (
            <div className="mt-3 rounded-lg border border-[var(--card-border)] bg-slate-50 p-3 text-sm">
              <div className="mb-1 text-xs font-medium text-[var(--ink-soft)]">Generisan odgovor</div>
              {r.answer}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

interface TestConnResult {
  connected?: boolean;
  client_id?: string;
  page_id?: string;
  page_name?: string;
  instagram_business_account_id?: string | null;
  status?: string;
  facebookMessenger?: string;
  facebookDetail?: string;
  instagramDirect?: string;
  instagramDetail?: string;
  error?: string;
}

export function TestConnectionButton({ businessId }: { businessId: string }) {
  const [state, setState] = useState<{ loading: boolean; res?: TestConnResult; err?: string }>({ loading: false });
  const run = async () => {
    setState({ loading: true });
    try {
      const r = await fetch(`/api/admin/test-connection?businessId=${businessId}`);
      const res = (await r.json()) as TestConnResult;
      setState({ loading: false, res });
    } catch (e) {
      setState({ loading: false, err: (e as Error).message });
    }
  };
  const r = state.res;
  return (
    <div>
      <Button type="button" variant="ghost" disabled={state.loading} onClick={run}>
        {state.loading ? "Testiram…" : "Test connection"}
      </Button>
      {state.err && <p className="mt-2 text-sm text-rose-600">{state.err}</p>}
      {r && (
        <div className="mt-2 rounded-lg border border-[var(--card-border)] bg-white/60 p-3 text-sm">
          {r.error && r.connected === false && <p className="text-amber-700">{r.error}</p>}
          {r.connected !== false && (
            <div className="grid gap-1">
              <Row k="Facebook Messenger" v={r.facebookMessenger ?? "—"} tone={r.facebookMessenger === "OK" ? "ok" : "error"} />
              <Row k="Instagram Direct" v={r.instagramDirect ?? "—"} tone={r.instagramDirect === "OK" ? "ok" : r.instagramDirect === "N/A" ? "warn" : "error"} />
              <Row k="client_id" v={r.client_id ?? "—"} />
              <Row k="page_id" v={r.page_id ?? "—"} />
              <Row k="page_name" v={r.page_name ?? "—"} />
              <Row k="instagram_business_account_id" v={r.instagram_business_account_id ?? "—"} />
              {r.facebookMessenger !== "OK" && r.facebookDetail && <Row k="FB detail" v={r.facebookDetail} tone="error" />}
              {r.instagramDirect === "Error" && r.instagramDetail && <Row k="IG detail" v={r.instagramDetail} tone="error" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MoveConnectionButton({ businessId, pageId, fromClient }: { businessId: string; pageId: string; fromClient: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(adminMoveConnectionAction, {});
  if (state.ok) return <p className="text-sm text-emerald-700">Veza premeštena na ovu firmu ✓</p>;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <p>Stranica <code>{pageId}</code> je već povezana sa drugom firmom ({fromClient || "nepoznato"}).</p>
      <form action={formAction} className="mt-2">
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="pageId" value={pageId} />
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Premeštam…" : "Premesti vezu na ovu firmu"}
        </Button>
      </form>
      {state.error && <p className="mt-2 text-rose-600">{state.error}</p>}
    </div>
  );
}

export function SyncN8nButton({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState<{ ok?: boolean; error?: string }, FormData>(syncN8nRuntimeAction, {});
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="businessId" value={businessId} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Syncing…" : "Sync n8n runtime data"}
      </Button>
      {state.ok && <span className="text-sm text-emerald-600">Synced ✓</span>}
      {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
    </form>
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
