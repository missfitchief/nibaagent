import Link from "next/link";
import { LOCALES, type Locale } from "@/lib/i18n";

const SHORT: Record<Locale, string> = { sr: "SR", bs: "BS", en: "EN" };

/**
 * Segmented locale switcher — real indexable URLs (`/sr`, `/bs`, `/en`,
 * `/sr/blog`, …). `segment` is the path AFTER the locale ("" for landing,
 * "/blog" for the blog index, "/blog/<slug>" for an article). No cookie: the
 * URL is the source of truth, so every locale is crawlable and shareable.
 */
export function LanguageSwitcher({
  current,
  segment = "",
  tone = "light"
}: {
  current: Locale;
  segment?: string;
  tone?: "light" | "dark";
}) {
  const border = tone === "dark" ? "border-white/20" : "border-[color:var(--line)]";
  const idle = tone === "dark" ? "text-white/60 hover:text-white" : "text-[color:var(--muted-2)] hover:text-[color:var(--ink-warm)]";
  const active = tone === "dark" ? "bg-white/15 text-white" : "bg-[color:var(--ink-warm)] text-white";

  return (
    <div className={`inline-flex overflow-hidden rounded-full border ${border} text-xs font-semibold`} role="group" aria-label="Jezik / Language">
      {LOCALES.map((loc) => (
        <Link
          key={loc}
          href={`/${loc}${segment}`}
          hrefLang={loc}
          aria-current={loc === current ? "true" : undefined}
          className={`px-2.5 py-1 transition ${loc === current ? active : idle}`}
        >
          {SHORT[loc]}
        </Link>
      ))}
    </div>
  );
}
