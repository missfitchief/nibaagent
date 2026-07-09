/**
 * Public-site i18n. Real dictionary structure (no scattered if/else). Three
 * locales: Serbian (default), Bosnian, English. Bosnian is authored as a small
 * set of ijekavica overrides on top of Serbian, and any missing key falls back
 * to Serbian — so "fallback if translation missing" is built in.
 *
 * Locale is carried in the `niba_lang` cookie and/or a `?lang=` query param, so
 * routes are unchanged (auth/admin/app untouched) while hreflang still gets
 * distinct URLs per locale.
 */
export const LOCALES = ["sr", "bs", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "sr";
export const LANG_COOKIE = "niba_lang";

export const LOCALE_LABELS: Record<Locale, string> = { sr: "Srpski", bs: "Bosanski", en: "English" };
/** BCP-47 codes for <html lang> / hreflang. */
export const HREFLANG: Record<Locale, string> = { sr: "sr-RS", bs: "bs-BA", en: "en" };

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "sr" || v === "bs" || v === "en";
}

interface Dict {
  htmlLang: string;
  nav: { features: string; how: string; pricing: string; faq: string; blog: string; login: string; start: string };
  hero: { eyebrow: string; h1a: string; h1b: string; sub: string; ctaPrimary: string; ctaSecondary: string; helper: string; caps: string[] };
  demo: { channel: string; agentSub: string; cust: string; bot: string; orderTitle: string; orderTag: string; orderItem: string; orderMetaSize: string; orderMetaDelivery: string; chips: string[] };
  product: { eyebrow: string; h2: string; sub: string; benefits: { tag: string; title: string; body: string }[] };
  how: { eyebrow: string; h2: string; steps: { title: string; body: string }[] };
  live: { eyebrow: string; h2: string; sub: string; ctaPrimary: string; ctaSecondary: string; greeting: string; active: string; qa: { q: string; a: string }[] };
  pricing: {
    eyebrow: string; h2: string; sub: string; popular: string; free: string; contact: string; perMonth: string;
    unitMessages: string; unitReplies: string; channel: string; channels: string; knowledge: string;
    handoffOn: string; handoffOff: string; ordersSheet: string; ordersPanel: string; notifOn: string; notifOff: string;
    analyticsAdv: string; analyticsBasic: string; planNames: Record<string, string>; support: Record<string, string>;
    ctaFree: string; ctaContact: string; ctaChoose: string;
  };
  faq: { eyebrow: string; h2: string; items: { q: string; a: string }[] };
  finalCta: { h2: string; sub: string; ctaPrimary: string; ctaSecondary: string };
  footer: { tagline: string; product: string; legal: string; languages: string; langList: string; rights: string; links: { blog: string; privacy: string; terms: string; cookies: string; dataDeletion: string; gdpr: string } };
  blog: { title: string; subtitle: string; all: string; back: string; readMore: string };
}

const sr: Dict = {
  htmlLang: "sr-RS",
  nav: { features: "Funkcije", how: "Kako radi", pricing: "Cene", faq: "Česta pitanja", blog: "Blog", login: "Prijava", start: "Pokreni besplatno" },
  hero: {
    eyebrow: "AI agent za Instagram i Facebook poruke",
    h1a: "Svaka poruka odgovorena.",
    h1b: "Svaka porudžbina uhvaćena.",
    sub: "NibaChat odgovara na pitanja o cenama, dostavi i stanju proizvoda, prima porudžbine iz Instagram i Facebook poruka i prosleđuje komplikovane slučajeve tvom timu.",
    ctaPrimary: "Pokreni besplatno",
    ctaSecondary: "Pogledaj kako radi",
    helper: "Bez kartice · Povezivanje u jednom koraku",
    caps: ["Odgovara o ceni", "Prima porudžbine", "Proverava dostavu i stanje", "Radi na Instagram i Facebook"]
  },
  demo: {
    channel: "Instagram poruka",
    agentSub: "Automatski odgovor",
    cust: "Zdravo 👋 Imate li ovu haljinu u broju M? Može li dostava danas?",
    bot: "Imamo broj M ✓ Dostava danas je moguća za porudžbine do 15h. Da rezervišem za Vas?",
    orderTitle: "Porudžbina",
    orderTag: "Spremno za potvrdu",
    orderItem: "Lanena haljina — bež",
    orderMetaSize: "Broj: M",
    orderMetaDelivery: "Dostava: danas",
    chips: ["Odgovoreno kupcu", "Porudžbina zabeležena", "Tim obavešten"]
  },
  product: {
    eyebrow: "Šta radi",
    h2: "Haotičan inboks postaje miran — i naplativ.",
    sub: "Pitanja koja se ponavljaju — cena, dostava, „ima li na stanju“ — rešena čim stignu. Ti zadržavaš razgovore koji su bitni; agent tiho rešava sve ostalo.",
    benefits: [
      { tag: "Brzina", title: "Odgovori pre nego što kupac ode", body: "Na cenu, dostavu i „ima li na stanju“ agent odgovara istog trenutka. Ti zadržavaš razgovore koji su zaista bitni." },
      { tag: "Porudžbine", title: "Porudžbine iz poruka, bez prepisivanja", body: "Ime, adresa, telefon i grad — prikupljeno kroz razgovor i sačuvano u tvoj panel i tvoju Google tabelu." },
      { tag: "Predaja", title: "Tim ulazi samo kada zaista treba", body: "Reči poput „reklamacija“ ili „agent“ odmah ućutkaju bota, označe razgovor i obaveste tim na Telegramu." }
    ]
  },
  how: {
    eyebrow: "Kako radi",
    h2: "Spremno za pola dana. Tvoje zauvek.",
    steps: [
      { title: "Poveži naloge", body: "Jednim Facebook prijavljivanjem povezuješ stranicu i Instagram. Tokeni su šifrovani — bez Meta konzole i bez koda." },
      { title: "Dodaj proizvode i pravila", body: "Ubaci cenovnik, dostavu i česta pitanja — ili samo nalepi link svog sajta da pročita katalog. Deset minuta, jednom." },
      { title: "NibaChat odgovara i prima porudžbine", body: "Kreni u draft režimu i proveri svaki odgovor. Uključi „uživo“ kad stekneš poverenje. Preuzimaš razgovor kad god želiš." },
      { title: "Tim preuzima samo teže slučajeve", body: "Agent rešava rutinu; ti i tim ulazite tek kada je potrebna ljudska procena." }
    ]
  },
  live: {
    eyebrow: "Uživo demo",
    h2: "Pričaj sa agentom. Odgovara kao tvoj najbolji prodavac.",
    sub: "Kratki, topli odgovori — na jeziku kupca. Probaj par pitanja desno. Ovaj demo koristi unapred spremljene odgovore; tvoj agent uživo odgovara iz tvog kataloga i tvojih pravila.",
    ctaPrimary: "Pokreni besplatno",
    ctaSecondary: "Zakaži demo",
    greeting: "Zdravo! 👋 Ja sam NibaChat demo agent — dodirni pitanje ispod.",
    active: "Aktivan",
    qa: [
      { q: "Koliko košta dostava?", a: "Dostava je 350 RSD, a besplatna za porudžbine preko 5.000 RSD. 🚚" },
      { q: "Imate li u broju M?", a: "Da, broj M je trenutno dostupan. Želite li da Vam ga rezervišem?" },
      { q: "Kako da poručim?", a: "Recite mi šta želite — uzeću ime, adresu i broj telefona ovde u poruci. 🛒" },
      { q: "Radite li i na Fejsbuku?", a: "Da — isti agent odgovara i na Instagram i na Facebook poruke, sa istim znanjem i tonom." }
    ]
  },
  pricing: {
    eyebrow: "Cene",
    h2: "Počni besplatno. Plaćaš kako inboks raste.",
    sub: "Bez kartice na startu. Naplata je za sada ručna — izaberi plan i mi te povežemo.",
    popular: "Najpopularniji",
    free: "Besplatno",
    contact: "Po dogovoru",
    perMonth: "/mes",
    unitMessages: "poruka / mesec",
    unitReplies: "AI odgovora / mesec",
    channel: "kanal",
    channels: "kanala",
    knowledge: "izvora znanja",
    handoffOn: "Predaja timu",
    handoffOff: "Bez predaje",
    ordersSheet: "Porudžbine u Google tabeli",
    ordersPanel: "Porudžbine u panelu",
    notifOn: "Telegram / WhatsApp obaveštenja",
    notifOff: "Email obaveštenja",
    analyticsAdv: "napredna analitika",
    analyticsBasic: "osnovna analitika",
    planNames: { Free: "Početni", Basic: "Osnovni", Standard: "Standard", Pro: "Pro", Business: "Biznis", Enterprise: "Korporativni" },
    support: { Community: "Zajednica", Email: "Email podrška", "Priority email": "Prioritetni email", Priority: "Prioritetna podrška", Dedicated: "Posvećena podrška", "Dedicated + SLA": "Posvećena podrška + SLA" },
    ctaFree: "Pokreni besplatno",
    ctaContact: "Kontaktiraj nas",
    ctaChoose: "Izaberi plan"
  },
  faq: {
    eyebrow: "Česta pitanja",
    h2: "Sve što te zanima, pre nego što se prijaviš.",
    items: [
      { q: "Da li mi treba tehničko znanje?", a: "Ne. Prijaviš se preko Facebook-a, izabereš stranicu i agent je povezan. Bez Meta developer konzole, bez koda, bez terminala." },
      { q: "Da li izmišlja cene ili obećanja?", a: "Ne — agent odgovara isključivo iz znanja koje mu daš. Kada nije siguran, kaže da će tim proveriti i prosledi razgovor tebi." },
      { q: "Šta je sa reklamacijama i nezadovoljnim kupcima?", a: "Ključne reči (reklamacija, problem, agent, čovek…) odmah ućutkaju bota, označe razgovor i obaveste te na Telegramu." },
      { q: "Mogu li da ga probam pre nego što priča sa kupcima?", a: "Da — draft režim priprema odgovore bez slanja, a ugrađeni test čet ti dozvoljava da ga prvo lično ispitaš." },
      { q: "Koje jezike govori?", a: "Srpski, bosanski, hrvatski i engleski, uz persiranje. Odgovara na jeziku na kom kupac piše." },
      { q: "Kako se naplaćuje?", a: "Postoji besplatan plan za probu, a zatim plaćeni planovi prema broju poruka. Naplata je za sada ručna — bez kartice na startu." }
    ]
  },
  finalCta: {
    h2: "Prestani da gubiš kupce u porukama.",
    sub: "Pusti NibaChat da odgovara i prima porudžbine dok ti vodiš posao. Poveži se za par minuta i gledaj kako radi.",
    ctaPrimary: "Pokreni besplatno",
    ctaSecondary: "Zakaži demo"
  },
  footer: {
    tagline: "AI agenti za Instagram i Facebook poruke. Napravljeno za radnje koje prodaju kroz poruke.",
    product: "Proizvod",
    legal: "Pravno",
    languages: "Jezici",
    langList: "Srpski · Bosanski · English",
    rights: "Sva prava zadržana.",
    links: { blog: "Blog", privacy: "Privatnost", terms: "Uslovi korišćenja", cookies: "Kolačići", dataDeletion: "Brisanje podataka", gdpr: "GDPR" }
  },
  blog: { title: "Blog", subtitle: "AI agenti, prodaja kroz poruke i brži odgovori kupcima.", all: "Svi članci", back: "Nazad na početnu", readMore: "Pročitaj više" }
};

const en: Dict = {
  htmlLang: "en",
  nav: { features: "Features", how: "How it works", pricing: "Pricing", faq: "FAQ", blog: "Blog", login: "Log in", start: "Start free" },
  hero: {
    eyebrow: "AI agent for Instagram & Facebook messages",
    h1a: "Every message answered.",
    h1b: "Every order captured.",
    sub: "NibaChat answers questions about price, delivery and stock, takes orders from Instagram and Facebook messages, and hands the tricky cases to your team.",
    ctaPrimary: "Start free",
    ctaSecondary: "See how it works",
    helper: "No card · Connect in one step",
    caps: ["Answers about price", "Takes orders", "Checks delivery & stock", "Works on Instagram & Facebook"]
  },
  demo: {
    channel: "Instagram DM",
    agentSub: "Automatic reply",
    cust: "Hi 👋 Do you have this dress in size M? Can it be delivered today?",
    bot: "We have size M ✓ Same-day delivery is possible for orders before 3pm. Shall I reserve it for you?",
    orderTitle: "Order",
    orderTag: "Ready to confirm",
    orderItem: "Linen dress — beige",
    orderMetaSize: "Size: M",
    orderMetaDelivery: "Delivery: today",
    chips: ["Customer answered", "Order captured", "Team notified"]
  },
  product: {
    eyebrow: "What it does",
    h2: "A chaotic inbox becomes calm — and profitable.",
    sub: "Repetitive questions — price, delivery, “is it in stock?” — answered the moment they arrive. You keep the conversations that matter; the agent quietly handles the rest.",
    benefits: [
      { tag: "Speed", title: "Answer before the customer leaves", body: "Price, delivery and “in stock?” are answered instantly. You keep the conversations that truly matter." },
      { tag: "Orders", title: "Orders from messages, no retyping", body: "Name, address, phone and city — collected in the chat and saved to your dashboard and your Google Sheet." },
      { tag: "Handoff", title: "The team steps in only when needed", body: "Words like “complaint” or “agent” instantly mute the bot, flag the chat and notify the team on Telegram." }
    ]
  },
  how: {
    eyebrow: "How it works",
    h2: "Live in an afternoon. Yours forever.",
    steps: [
      { title: "Connect your accounts", body: "One Facebook login links your Page and Instagram. Tokens are encrypted — no Meta console, no code." },
      { title: "Add products and rules", body: "Add your price list, delivery and FAQs — or just paste your site URL to read the catalog. Ten minutes, once." },
      { title: "NibaChat answers and takes orders", body: "Start in draft mode and review every answer. Go live when you trust it. Take over a conversation anytime." },
      { title: "The team handles only hard cases", body: "The agent handles the routine; you and the team step in only when human judgment is needed." }
    ]
  },
  live: {
    eyebrow: "Live demo",
    h2: "Talk to the agent. It answers like your best salesperson.",
    sub: "Short, warm answers — in the customer’s language. Try a few questions on the right. This demo uses canned answers; your live agent replies from your own catalog and rules.",
    ctaPrimary: "Start free",
    ctaSecondary: "Book a demo",
    greeting: "Hi! 👋 I’m the NibaChat demo agent — tap a question below.",
    active: "Active",
    qa: [
      { q: "How much is delivery?", a: "Delivery is 350 RSD, and free for orders over 5,000 RSD. 🚚" },
      { q: "Do you have size M?", a: "Yes, size M is currently available. Would you like me to reserve it for you?" },
      { q: "How do I order?", a: "Tell me what you’d like — I’ll take your name, address and phone right here. 🛒" },
      { q: "Do you work on Facebook too?", a: "Yes — the same agent answers both Instagram and Facebook messages, with the same knowledge and tone." }
    ]
  },
  pricing: {
    eyebrow: "Pricing",
    h2: "Start free. Pay as the inbox grows.",
    sub: "No card to start. Billing is manual for now — pick a plan and we’ll get you set up.",
    popular: "Most popular",
    free: "Free",
    contact: "Let’s talk",
    perMonth: "/mo",
    unitMessages: "messages / month",
    unitReplies: "AI replies / month",
    channel: "channel",
    channels: "channels",
    knowledge: "knowledge sources",
    handoffOn: "Human handoff",
    handoffOff: "No handoff",
    ordersSheet: "Orders in Google Sheet",
    ordersPanel: "Orders in dashboard",
    notifOn: "Telegram / WhatsApp alerts",
    notifOff: "Email alerts",
    analyticsAdv: "advanced analytics",
    analyticsBasic: "basic analytics",
    planNames: { Free: "Free", Basic: "Basic", Standard: "Standard", Pro: "Pro", Business: "Business", Enterprise: "Enterprise" },
    support: { Community: "Community", Email: "Email support", "Priority email": "Priority email", Priority: "Priority support", Dedicated: "Dedicated support", "Dedicated + SLA": "Dedicated + SLA" },
    ctaFree: "Start free",
    ctaContact: "Contact us",
    ctaChoose: "Choose plan"
  },
  faq: {
    eyebrow: "FAQ",
    h2: "Everything you’re wondering, before you sign up.",
    items: [
      { q: "Do I need technical knowledge?", a: "No. You log in with Facebook, pick your page, and the agent is connected. No Meta developer console, no code, no terminal." },
      { q: "Will it invent prices or promises?", a: "No — the agent answers only from the knowledge you give it. When unsure, it says the team will check and hands the conversation to you." },
      { q: "What about complaints and unhappy customers?", a: "Keywords (complaint, problem, agent, human…) instantly mute the bot, flag the chat and notify you on Telegram." },
      { q: "Can I test it before it talks to customers?", a: "Yes — draft mode prepares answers without sending, and a built-in test chat lets you interrogate it privately first." },
      { q: "Which languages does it speak?", a: "Serbian, Bosnian, Croatian and English, with polite forms. It replies in the language the customer writes in." },
      { q: "How is it billed?", a: "A free plan to try it, then paid plans by message volume. Billing is manual for now — no card to start." }
    ]
  },
  finalCta: {
    h2: "Stop losing customers in the inbox.",
    sub: "Let NibaChat answer and take orders while you run the business. Connect in a couple of minutes and watch it work.",
    ctaPrimary: "Start free",
    ctaSecondary: "Book a demo"
  },
  footer: {
    tagline: "AI agents for Instagram and Facebook messages. Built for shops that sell in DMs.",
    product: "Product",
    legal: "Legal",
    languages: "Languages",
    langList: "Srpski · Bosanski · English",
    rights: "All rights reserved.",
    links: { blog: "Blog", privacy: "Privacy", terms: "Terms of Service", cookies: "Cookies", dataDeletion: "Data deletion", gdpr: "GDPR" }
  },
  blog: { title: "Blog", subtitle: "AI agents, DM commerce, and answering customers faster.", all: "All articles", back: "Back to home", readMore: "Read more" }
};

/** Bosnian = Serbian base with ijekavica + a few lexical overrides. Missing keys fall back to sr. */
const bs: Dict = {
  ...sr,
  htmlLang: "bs-BA",
  hero: {
    ...sr.hero,
    h1b: "Svaka narudžba zabilježena.",
    sub: "NibaChat odgovara na pitanja o cijenama, dostavi i stanju proizvoda, prima narudžbe iz Instagram i Facebook poruka i prosljeđuje komplikovane slučajeve tvom timu.",
    caps: ["Odgovara o cijeni", "Prima narudžbe", "Provjerava dostavu i stanje", "Radi na Instagram i Facebook"]
  },
  demo: {
    ...sr.demo,
    bot: "Imamo broj M ✓ Dostava danas je moguća za narudžbe do 15h. Da rezervišem za Vas?",
    orderTitle: "Narudžba",
    chips: ["Odgovoreno kupcu", "Narudžba zabilježena", "Tim obaviješten"]
  },
  product: {
    ...sr.product,
    sub: "Pitanja koja se ponavljaju — cijena, dostava, „ima li na stanju“ — riješena čim stignu. Ti zadržavaš razgovore koji su bitni; agent tiho rješava sve ostalo.",
    benefits: [
      { tag: "Brzina", title: "Odgovori prije nego što kupac ode", body: "Na cijenu, dostavu i „ima li na stanju“ agent odgovara istog trenutka. Ti zadržavaš razgovore koji su zaista bitni." },
      { tag: "Narudžbe", title: "Narudžbe iz poruka, bez prepisivanja", body: "Ime, adresa, telefon i grad — prikupljeno kroz razgovor i sačuvano u tvoj panel i tvoju Google tabelu." },
      { tag: "Predaja", title: "Tim ulazi samo kada zaista treba", body: "Riječi poput „reklamacija“ ili „agent“ odmah ućutkaju bota, označe razgovor i obavijeste tim na Telegramu." }
    ]
  },
  how: {
    ...sr.how,
    h2: "Spremno za pola dana. Tvoje zauvijek.",
    steps: [
      { title: "Poveži naloge", body: "Jednim Facebook prijavljivanjem povezuješ stranicu i Instagram. Tokeni su šifrovani — bez Meta konzole i bez koda." },
      { title: "Dodaj proizvode i pravila", body: "Ubaci cjenovnik, dostavu i česta pitanja — ili samo nalijepi link svog sajta da pročita katalog. Deset minuta, jednom." },
      { title: "NibaChat odgovara i prima narudžbe", body: "Kreni u draft režimu i provjeri svaki odgovor. Uključi „uživo“ kad stekneš povjerenje. Preuzimaš razgovor kad god želiš." },
      { title: "Tim preuzima samo teže slučajeve", body: "Agent rješava rutinu; ti i tim ulazite tek kada je potrebna ljudska procjena." }
    ]
  },
  pricing: { ...sr.pricing, unitMessages: "poruka / mjesec", unitReplies: "AI odgovora / mjesec", perMonth: "/mj" },
  finalCta: { ...sr.finalCta, sub: "Pusti NibaChat da odgovara i prima narudžbe dok ti vodiš posao. Poveži se za par minuta i gledaj kako radi." }
};

const DICTS: Record<Locale, Dict> = { sr, bs, en };

export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
}
export type { Dict };
