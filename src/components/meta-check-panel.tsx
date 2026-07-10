"use client";

import { useState } from "react";
import Link from "next/link";
import type { MetaConfigCheck } from "@/lib/meta-check";
import { Card } from "@/components/ui";

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
            /* clipboard blocked */
          }
        }}
        className="shrink-0 rounded-md border border-[var(--card-border)] bg-white px-2 py-1 hover:bg-slate-100"
      >
        {copied ? "Kopirano ✓" : "Kopiraj"}
      </button>
    </div>
  );
}

function StatusPill({ set, source }: { set: boolean; source: string }) {
  if (!set) return <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">nije podešeno</span>;
  const label = source === "db" ? "podešeno (baza)" : source === "env" ? "podešeno (env)" : "podešeno";
  return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{label}</span>;
}

/**
 * "Meta konfiguracija" debug panel. Shows resolved (DB→env) status for every
 * Meta setting, the OAuth callback + webhook URLs with copy buttons, whether
 * the current businessId is carried in the OAuth state, the Meta mode, and the
 * StarLight migration warning.
 */
export function MetaCheckPanel({ check, businessId }: { check: MetaConfigCheck; businessId?: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Meta konfiguracija</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            check.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
          }`}
        >
          {check.ready ? "Spremno za povezivanje" : "Nedostaje konfiguracija"}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">
        Vrednosti se čitaju iz baze (Podešavanja aplikacije), pa iz env promenljivih.
      </p>

      <div className="mt-3 space-y-1.5">
        {check.items.map((it) => (
          <div key={it.key} className="flex items-center justify-between gap-3 border-t border-[var(--card-border)] py-2 text-sm first:border-t-0">
            <span>
              {it.label}
              {it.value && <code className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{it.value}</code>}
            </span>
            <StatusPill set={it.set} source={it.source} />
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-[var(--card-border)] py-2 text-sm">
          <span>Meta mod</span>
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{check.mode}</code>
        </div>
        <div className="flex items-center justify-between py-1 text-sm">
          <span>Provera potpisa webhooka</span>
          <span className="text-xs text-[var(--ink-soft)]">{check.requireSignature ? "uključena" : "isključena"}</span>
        </div>
        {businessId && (
          <div className="flex items-center justify-between py-1 text-sm">
            <span>businessId u OAuth state-u</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">da</span>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <h3 className="text-sm font-semibold">URL-ovi za Meta aplikaciju</h3>
        <CopyRow label="OAuth callback URL" value={check.callbackUrl} />
        <CopyRow label="Webhook URL" value={check.webhookUrl} />
        <CopyRow label="Data deletion callback URL" value={check.dataDeletionUrl} />
      </div>

      <div className="mt-4 space-y-2">
        <h3 className="text-sm font-semibold">Pravni URL-ovi (za Meta App Dashboard)</h3>
        <CopyRow label="Privacy Policy URL" value={`${check.appUrl}/privacy-policy`} />
        <CopyRow label="Terms of Service URL" value={`${check.appUrl}/terms-of-service`} />
        <CopyRow label="User Data Deletion URL" value={`${check.appUrl}/user-data-deletion`} />
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--card-border)] bg-slate-50 px-3 py-2">
          OAuth start ruta: <code>/api/meta/start</code> · OK
        </div>
        <div className="rounded-lg border border-[var(--card-border)] bg-slate-50 px-3 py-2">
          Callback ruta: <code>/api/meta/callback</code> · OK
        </div>
      </div>

      {!check.ready && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Nedostaje Meta App ID ili App Secret. Unesi ih u{" "}
          <Link href="/admin/settings" className="font-semibold underline">
            Podešavanja aplikacije
          </Link>{" "}
          da bi „Poveži Facebook / Instagram“ dugme radilo.
        </div>
      )}

      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ⚠ Menjanje Meta podešavanja utiče na buduća Meta povezivanja. Nemoj usmeravati aplikaciju/webhook žive StarLight aplikacije
        ovde osim ako namerno ne migriraš — prekinuo bi živi bot.
      </div>
    </Card>
  );
}
