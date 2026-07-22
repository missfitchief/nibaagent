"use client";

import { useActionState, useState } from "react";
import { setPlatformAction, deletePlatformAction } from "@/lib/actions/platform";
import type { ActionState } from "@/lib/actions/business";
import { Button, Card, ErrorNote, Input, Label } from "@/components/ui";

/**
 * A submit button that overrides the enclosing form's action to clear one key.
 * Uses `formAction` (React 19) instead of a nested <form> (invalid HTML). Only
 * this button's name/value ("key") reaches deletePlatformAction.
 */
function ClearButton({ fieldKey }: { fieldKey: string }) {
  return (
    <button type="submit" formAction={deletePlatformAction} name="key" value={fieldKey} className="text-xs text-rose-600 underline hover:text-rose-700">
      clear
    </button>
  );
}

export interface PlatformField {
  key: string;
  secret: boolean;
  source: "db" | "env" | "missing";
  display: string; // plaintext for non-secrets; masked "…ab12" for secrets; "" if missing
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--card-border)] bg-slate-50 px-3 py-2 text-xs">
      <div className="min-w-0">
        <div className="font-medium text-[var(--ink-soft)]">{label}</div>
        <code className="block truncate">{value}</code>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch {
            /* clipboard blocked — user can select manually */
          }
        }}
        className="shrink-0 rounded-md border border-[var(--card-border)] bg-white px-2 py-1 hover:bg-slate-100"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

function sourceTag(source: PlatformField["source"]) {
  if (source === "db") return <span className="text-xs text-emerald-600">saved here</span>;
  if (source === "env") return <span className="text-xs text-sky-600">from env</span>;
  return <span className="text-xs text-amber-600">not set</span>;
}

function TextField({ f, placeholder }: { f: PlatformField; placeholder?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label htmlFor={f.key}>{f.key}</Label>
        <span className="flex items-center gap-2">
          {sourceTag(f.source)}
          {f.source === "db" && <ClearButton fieldKey={f.key} />}
        </span>
      </div>
      <Input id={f.key} name={f.key} defaultValue={f.secret ? "" : f.display} placeholder={placeholder} autoComplete="off" />
    </div>
  );
}

function SecretField({ f }: { f: PlatformField }) {
  const ph = f.source === "db" ? `saved (${f.display}) — leave blank to keep` : f.source === "env" ? "set via env — enter to override" : "not set";
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label htmlFor={f.key}>{f.key}</Label>
        <span className="flex items-center gap-2">
          {sourceTag(f.source)}
          {f.source === "db" && <ClearButton fieldKey={f.key} />}
        </span>
      </div>
      <Input id={f.key} name={f.key} type="password" defaultValue="" placeholder={ph} autoComplete="new-password" />
    </div>
  );
}

export function PlatformSettingsForm({
  fields,
  initialAppUrl,
  envStatus
}: {
  fields: PlatformField[];
  initialAppUrl: string;
  envStatus: { label: string; ok: boolean }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setPlatformAction, {});
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
  const [appUrl, setAppUrl] = useState(initialAppUrl);
  const base = appUrl.replace(/\/$/, "") || "https://your-app.example";
  const F = (k: string): PlatformField => byKey[k] ?? { key: k, secret: false, source: "missing", display: "" };

  return (
    <form action={formAction} className="space-y-5">
      {/* ---- Meta ---- */}
      <Card>
        <h2 className="mb-1 font-semibold">Meta (Facebook / Instagram)</h2>
        <p className="mb-3 text-xs text-[var(--ink-soft)]">Used for the “Connect Facebook/Instagram” OAuth flow and webhook verification.</p>
        <div className="space-y-3">
          <div>
            <Label htmlFor="APP_URL">APP_URL</Label>
            <Input id="APP_URL" name="APP_URL" value={appUrl} onChange={(e) => setAppUrl(e.target.value)} placeholder="https://nibaagent.vercel.app" autoComplete="off" />
            <p className="mt-1 text-xs text-[var(--ink-soft)]">Public base URL of this app. Drives the webhook &amp; OAuth callback URLs below.</p>
          </div>
          <TextField f={F("META_APP_ID")} placeholder="e.g. 2199807407438226" />
          <SecretField f={F("META_APP_SECRET")} />
          <SecretField f={F("META_VERIFY_TOKEN")} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="META_MODE">META_MODE</Label>
              <select
                id="META_MODE"
                name="META_MODE"
                defaultValue={F("META_MODE").display || "live"}
                className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                <option value="live">live</option>
                <option value="test">test</option>
              </select>
            </div>
            <div>
              <Label htmlFor="META_REQUIRE_SIGNATURE">META_REQUIRE_SIGNATURE</Label>
              <select
                id="META_REQUIRE_SIGNATURE"
                name="META_REQUIRE_SIGNATURE"
                defaultValue={F("META_REQUIRE_SIGNATURE").display || "true"}
                className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                <option value="true">true (verify X-Hub signature)</option>
                <option value="false">false</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold">Meta app configuration helpers</h3>
          <CopyRow label="Webhook callback URL" value={`${base}/api/meta/webhook`} />
          <CopyRow label="OAuth redirect / callback URL" value={`${base}/api/meta/callback`} />
          <CopyRow label="Data deletion callback URL" value={`${base}/api/meta/data-deletion`} />
          <ol className="ml-4 list-decimal space-y-1 text-xs text-[var(--ink-soft)]">
            <li>Meta app → Facebook Login → Settings → add the OAuth redirect URL to “Valid OAuth Redirect URIs”.</li>
            <li>Meta app → Messenger / Instagram → Webhooks → paste the webhook URL and the verify token above, subscribe to <code>messages</code>.</li>
            <li>Add the data-deletion URL under App Settings → Basic → User data deletion.</li>
          </ol>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠ Changing platform Meta settings affects future Meta OAuth connections. Do <strong>not</strong> point the live StarLight app or its webhook here unless you are intentionally migrating it — it will cut off the live bot.
          </div>
        </div>
      </Card>

      {/* ---- AI ---- */}
      <Card>
        <h2 className="mb-1 font-semibold">AI providers &amp; default models</h2>
        <p className="mb-3 text-xs text-[var(--ink-soft)]">
          Platform fallback keys &amp; default models. <strong>Platformski API ključ — trošak ide preko platforme.</strong> A business can bring
          its own key (trošak ide direktno preko naloga tog biznisa) depending on the usage mode below.
        </p>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="AI_USAGE_MODE">API key usage mode</Label>
              <select
                id="AI_USAGE_MODE"
                name="AI_USAGE_MODE"
                defaultValue={F("AI_USAGE_MODE").display || "business_key_allowed"}
                className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                <option value="platform_key_only">platform_key_only — svi koriste platformski ključ</option>
                <option value="business_key_allowed">business_key_allowed — biznis ključ ako postoji, inače platformski</option>
                <option value="business_key_required">business_key_required — svaki biznis mora imati svoj ključ</option>
              </select>
            </div>
            <div>
              <Label htmlFor="DEFAULT_AI_PROVIDER">Default provider</Label>
              <select
                id="DEFAULT_AI_PROVIDER"
                name="DEFAULT_AI_PROVIDER"
                defaultValue={F("DEFAULT_AI_PROVIDER").display || "openai"}
                className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                <option value="openai">openai</option>
                <option value="anthropic">anthropic</option>
              </select>
            </div>
          </div>
          <SecretField f={F("OPENAI_API_KEY")} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField f={F("DEFAULT_OPENAI_MODEL")} placeholder="gpt-4o" />
            <TextField f={F("DEFAULT_VISION_MODEL")} placeholder="gpt-4o-mini (vision-capable)" />
          </div>
          <SecretField f={F("OPENAI_ADMIN_API_KEY")} />
          <p className="-mt-2 text-xs text-[var(--ink-soft)]">
            Different from the key above — an Organization-level Admin key (platform.openai.com → Settings → Organization →
            API keys → Admin keys). Used only to pull real spend from OpenAI's Costs API for businesses that have their own
            API key id set, shown next to our own estimate on their Overview tab.
          </p>
          <SecretField f={F("ANTHROPIC_API_KEY")} />
          <TextField f={F("DEFAULT_ANTHROPIC_MODEL")} placeholder="claude-3-5-haiku-latest" />
        </div>
      </Card>

      {/* ---- Email (verification / transactional) ---- */}
      <Card>
        <h2 className="mb-1 font-semibold">Email (verifikacija naloga)</h2>
        <p className="mb-3 text-xs text-[var(--ink-soft)]">
          Šalje verifikacioni email pri registraciji. <strong>dev</strong> = ne šalje pravi email (link se upisuje u logove) —
          jasno je označeno da slanje nije konfigurisano. <strong>resend</strong> koristi Resend API; <strong>smtp</strong> koristi SMTP nalog.
        </p>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="EMAIL_MODE">Email mode</Label>
              <select
                id="EMAIL_MODE"
                name="EMAIL_MODE"
                defaultValue={F("EMAIL_MODE").display || "dev"}
                className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                <option value="dev">dev — ne šalje (link u logovima)</option>
                <option value="resend">resend</option>
                <option value="smtp">smtp</option>
              </select>
            </div>
            <TextField f={F("EMAIL_FROM")} placeholder="NibaChat &lt;noreply@nibachat.app&gt;" />
          </div>
          <SecretField f={F("RESEND_API_KEY")} />
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField f={F("SMTP_HOST")} placeholder="smtp.example.com" />
            <TextField f={F("SMTP_PORT")} placeholder="587" />
            <TextField f={F("SMTP_USER")} placeholder="user@example.com" />
          </div>
          <SecretField f={F("SMTP_PASSWORD")} />
        </div>
      </Card>

      {/* ---- Engine & notifications ---- */}
      <Card>
        <h2 className="mb-1 font-semibold">Engine &amp; notifications</h2>
        <div className="space-y-3">
          <SecretField f={F("TELEGRAM_BOT_TOKEN")} />
          <SecretField f={F("TELEGRAM_CHAT_ID")} />
        </div>
      </Card>

      <ErrorNote>{state.error}</ErrorNote>
      {state.ok && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Settings saved ✓</p>}
      <div className="sticky bottom-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save platform settings"}
        </Button>
      </div>

      {/* ---- read-only infra status ---- */}
      <Card>
        <h2 className="mb-2 font-semibold">Infrastructure (set in hosting env, read-only)</h2>
        {envStatus.map((s) => (
          <div key={s.label} className="flex items-center justify-between border-t border-[var(--card-border)] py-2 text-sm first:border-t-0">
            <span>{s.label}</span>
            <span className={s.ok ? "text-xs text-emerald-600" : "text-xs text-amber-600"}>{s.ok ? "configured" : "missing"}</span>
          </div>
        ))}
      </Card>
    </form>
  );
}
