import "server-only";
import { cookies } from "next/headers";
import { isLocale, DEFAULT_LOCALE, LANG_COOKIE, type Locale } from "./i18n";

/**
 * Resolve the active public-site locale: an explicit `?lang=` query wins (so
 * hreflang URLs render the right language for crawlers), else the `niba_lang`
 * cookie, else the Serbian default. Never throws.
 */
export async function getLocale(searchLang?: string): Promise<Locale> {
  if (isLocale(searchLang)) return searchLang;
  try {
    const v = (await cookies()).get(LANG_COOKIE)?.value;
    if (isLocale(v)) return v;
  } catch {
    /* cookies unavailable (static context) → default */
  }
  return DEFAULT_LOCALE;
}
