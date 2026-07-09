import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n";

/** Legacy `/blog` → localized `/{locale}/blog`. */
export default async function BlogRedirect() {
  const al = (await headers()).get("accept-language") ?? "";
  const prefs = al.split(",").map((s) => s.trim().slice(0, 2).toLowerCase());
  const loc = prefs.find((p) => isLocale(p)) ?? DEFAULT_LOCALE;
  redirect(`/${loc}/blog`);
}
