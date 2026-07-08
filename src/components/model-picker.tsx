"use client";

import { useState } from "react";
import { PROVIDERS, RECOMMENDED_MODELS, type Provider, isProvider } from "@/lib/models";
import { Input, Label } from "@/components/ui";

const CUSTOM = "__custom__";

const selectCls =
  "w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100";

/**
 * Provider + model chooser. Submits two fields: `aiProvider` and
 * `selectedModel`. The recommended dropdown is a convenience only — choosing
 * "Custom…" lets the business type ANY model name (including future ones), and
 * that free-text value is what gets submitted. No allow-list is enforced.
 */
export function ModelPicker({ defaultProvider, defaultModel }: { defaultProvider: string; defaultModel: string }) {
  const initialProvider: Provider = isProvider(defaultProvider) ? defaultProvider : "openai";
  const [provider, setProvider] = useState<Provider>(initialProvider);
  const known = (p: Provider, m: string) => RECOMMENDED_MODELS[p].some((x) => x.value === m);
  const [choice, setChoice] = useState<string>(known(initialProvider, defaultModel) ? defaultModel : CUSTOM);
  const [custom, setCustom] = useState<string>(known(initialProvider, defaultModel) ? "" : defaultModel);

  const effectiveModel = choice === CUSTOM ? custom : choice;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="aiProvider">AI provider</Label>
        <select
          id="aiProvider"
          name="aiProvider"
          value={provider}
          onChange={(e) => {
            const p = isProvider(e.target.value) ? e.target.value : "openai";
            setProvider(p);
            // if current recommended choice doesn't belong to the new provider, jump to its first model
            if (choice !== CUSTOM && !known(p, choice)) setChoice(RECOMMENDED_MODELS[p][0].value);
          }}
          className={selectCls}
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="modelChoice">Model</Label>
        <select id="modelChoice" value={choice} onChange={(e) => setChoice(e.target.value)} className={selectCls}>
          {RECOMMENDED_MODELS[provider].map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
          <option value={CUSTOM}>Custom… (type any model name)</option>
        </select>
      </div>
      {choice === CUSTOM && (
        <div className="sm:col-span-2">
          <Label htmlFor="customModel">Custom model name</Label>
          <Input id="customModel" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. gpt-5, claude-opus-4-8, or any future model" autoComplete="off" />
          <p className="mt-1 text-xs text-[var(--ink-soft)]">Future / unlisted models are accepted — we don&apos;t block unknown names.</p>
        </div>
      )}
      {/* the actual submitted value */}
      <input type="hidden" name="selectedModel" value={effectiveModel} />
    </div>
  );
}
