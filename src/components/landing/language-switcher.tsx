"use client";

import { useRouter, usePathname } from "next/navigation";
import { LOCALES, LANG_COOKIE, type Locale } from "@/lib/i18n";

const SHORT: Record<Locale, string> = { sr: "SR", bs: "BS", en: "EN" };

/** Persist the chosen locale for a year (module scope — not a component mutation). */
function persistLocale(loc: Locale): void {
  document.cookie = `${LANG_COOKIE}=${loc}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Segmented locale switcher. Persists the choice in the `niba_lang` cookie and
 * navigates to `?lang=<code>` so the server re-renders in that language and the
 * URL is crawlable/shareable per locale.
 */
export function LanguageSwitcher({ current, tone = "light" }: { current: Locale; tone?: "light" | "dark" }) {
  const router = useRouter();
  const pathname = usePathname();

  const pick = (loc: Locale) => {
    if (loc === current) return;
    persistLocale(loc);
    router.push(`${pathname}?lang=${loc}`);
    router.refresh();
  };

  const border = tone === "dark" ? "border-white/20" : "border-[color:var(--line)]";
  const idle = tone === "dark" ? "text-white/60 hover:text-white" : "text-[color:var(--muted-2)] hover:text-[color:var(--ink-warm)]";
  const active = tone === "dark" ? "bg-white/15 text-white" : "bg-[color:var(--ink-warm)] text-white";

  return (
    <div className={`inline-flex overflow-hidden rounded-full border ${border} text-xs font-semibold`} role="group" aria-label="Jezik / Language">
      {LOCALES.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => pick(loc)}
          aria-pressed={loc === current}
          className={`px-2.5 py-1 transition ${loc === current ? active : idle}`}
        >
          {SHORT[loc]}
        </button>
      ))}
    </div>
  );
}
