import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n";

/**
 * Root `/` → a real locale URL (`/sr` | `/bs` | `/en`) so every public page is
 * an indexable, canonical, locale-prefixed URL. Prefers the browser's
 * Accept-Language, defaults to Serbian.
 */
export default async function RootRedirect() {
  const al = (await headers()).get("accept-language") ?? "";
  const prefs = al.split(",").map((s) => s.trim().slice(0, 2).toLowerCase());
  const loc = prefs.find((p) => isLocale(p)) ?? DEFAULT_LOCALE;
  redirect(`/${loc}`);
}
