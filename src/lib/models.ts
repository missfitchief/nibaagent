/**
 * Model catalog + resolution. Deliberately does NOT hard-block unknown or
 * future model names — a business can type any model string and we pass it
 * through. We only sanitize (trim + length cap) and, for the UI, offer a
 * curated "recommended" list plus a free-text custom option.
 *
 * Resolution order for the effective model:
 *   per-business selectedModel → platform default → app default
 */

export type Provider = "openai" | "anthropic";

export const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic (Claude)" }
];

/** Curated dropdown suggestions per provider. Custom input is always allowed. */
export const RECOMMENDED_MODELS: Record<Provider, { value: string; label: string }[]> = {
  openai: [
    { value: "gpt-4o-mini", label: "gpt-4o-mini — fast & cheap (default)" },
    { value: "gpt-4o", label: "gpt-4o — strongest OpenAI vision+text" },
    { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
    { value: "gpt-4.1", label: "gpt-4.1" }
  ],
  anthropic: [
    { value: "claude-3-5-haiku-latest", label: "claude-3-5-haiku — fast & cheap" },
    { value: "claude-3-5-sonnet-latest", label: "claude-3-5-sonnet — balanced" },
    { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6" }
  ]
};

/** App-level fallback if neither business nor platform sets a model. */
export const APP_DEFAULT_MODEL: Record<Provider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest"
};

export const APP_DEFAULT_VISION_MODEL = "gpt-4o-mini";

/** Trim + cap length. Returns "" for empty/invalid so callers can fall back. */
export function sanitizeModel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s || s.length > 120) return "";
  // allow letters, digits, dot, dash, underscore, colon, slash (covers vendor prefixes)
  return /^[A-Za-z0-9._:\-\/]+$/.test(s) ? s : "";
}

export function isProvider(v: string | null | undefined): v is Provider {
  return v === "openai" || v === "anthropic";
}

/**
 * Pick the effective model without any hard allow-list. Unknown/future names
 * pass through untouched.
 */
export function pickModel(opts: { provider: Provider; businessModel?: string | null; platformDefault?: string | null }): string {
  return sanitizeModel(opts.businessModel) || sanitizeModel(opts.platformDefault) || APP_DEFAULT_MODEL[opts.provider];
}
