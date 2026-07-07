/**
 * Lightweight i18n architecture: dictionaries per locale, cookie-selected.
 * Key pages/menus are translated; remaining strings fall back to English.
 * Add keys here and use t(locale, "key") in server components.
 */

export const LOCALES = ["en", "sr", "bs", "hr"] as const;
export type Locale = (typeof LOCALES)[number];

const DICT: Record<Locale, Record<string, string>> = {
  en: {
    "nav.features": "Features",
    "nav.how": "How it works",
    "nav.pricing": "Pricing",
    "nav.blog": "Blog",
    "nav.login": "Login",
    "cta.start": "Start free",
    "cta.demo": "Book live demo",
    "hero.title": "Reply instantly. Capture orders. Save time.",
    "app.dashboard": "Dashboard",
    "app.connect": "Connect FB/IG",
    "app.orders": "Orders",
    "app.handoff": "Handoff",
    "app.settings": "Settings"
  },
  sr: {
    "nav.features": "Funkcije",
    "nav.how": "Kako radi",
    "nav.pricing": "Cene",
    "nav.blog": "Blog",
    "nav.login": "Prijava",
    "cta.start": "Počnite besplatno",
    "cta.demo": "Zakažite demo",
    "hero.title": "Odgovarajte odmah. Prikupljajte porudžbine. Uštedite vreme.",
    "app.dashboard": "Kontrolna tabla",
    "app.connect": "Poveži FB/IG",
    "app.orders": "Porudžbine",
    "app.handoff": "Preuzimanja",
    "app.settings": "Podešavanja"
  },
  bs: {
    "nav.features": "Funkcije",
    "nav.how": "Kako radi",
    "nav.pricing": "Cijene",
    "nav.blog": "Blog",
    "nav.login": "Prijava",
    "cta.start": "Počnite besplatno",
    "cta.demo": "Zakažite demo",
    "hero.title": "Odgovarajte odmah. Prikupljajte narudžbe. Uštedite vrijeme.",
    "app.dashboard": "Kontrolna ploča",
    "app.connect": "Poveži FB/IG",
    "app.orders": "Narudžbe",
    "app.handoff": "Preuzimanja",
    "app.settings": "Postavke"
  },
  hr: {
    "nav.features": "Značajke",
    "nav.how": "Kako radi",
    "nav.pricing": "Cijene",
    "nav.blog": "Blog",
    "nav.login": "Prijava",
    "cta.start": "Počnite besplatno",
    "cta.demo": "Rezervirajte demo",
    "hero.title": "Odgovarajte odmah. Prikupljajte narudžbe. Uštedite vrijeme.",
    "app.dashboard": "Nadzorna ploča",
    "app.connect": "Poveži FB/IG",
    "app.orders": "Narudžbe",
    "app.handoff": "Preuzimanja",
    "app.settings": "Postavke"
  }
};

export function t(locale: Locale, key: string): string {
  return DICT[locale]?.[key] ?? DICT.en[key] ?? key;
}

export function normalizeLocale(value: string | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? "") ? (value as Locale) : "en";
}
