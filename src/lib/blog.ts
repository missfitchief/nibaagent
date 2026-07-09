/** Blog seed content — stored in code for the MVP, editable later via CMS/DB. */
export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  body: string[];
  /** Content language. Undefined = English (legacy posts). */
  lang?: "sr" | "bs" | "en";
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "why-facebook-instagram-businesses-need-ai-chat-automation",
    title: "Why Facebook and Instagram businesses need AI chat automation",
    description:
      "Social-commerce customers expect answers in minutes. Here is why AI agents became essential for pages that sell in DMs.",
    date: "2026-07-01",
    body: [
      "If your business sells through Instagram DMs or Facebook Messenger, your inbox is your storefront. Every unanswered “cena?” or “koliko je poštarina?” is a customer walking out of the shop.",
      "Studies of social commerce consistently show that reply time is the strongest predictor of conversion: answers within 5 minutes convert several times better than answers within 5 hours. No small team can hold that bar manually, at night, on weekends, during holidays.",
      "An AI agent answers the repetitive 80% instantly — price, delivery, ordering, availability — and hands the complex 20% to a human. The math is simple: faster answers, more orders, less time glued to the phone.",
      "NibaChat Agent connects to your Facebook Page and Instagram in one login, learns your products and FAQs, and starts answering in your tone — with a human takeover switch always one tap away."
    ]
  },
  {
    slug: "how-ai-agents-save-time-in-customer-support",
    title: "How AI agents save time in customer support",
    description: "A realistic breakdown of the hours an AI agent gives back to a small business every week.",
    date: "2026-07-02",
    body: [
      "A typical small social-commerce shop answers 30–100 messages per day. At 2–3 minutes per message, that is 1–5 hours of typing — every day.",
      "Most of those messages are the same ten questions: delivery price, delivery time, how to order, sizes, availability, payment methods. An AI agent answers those instantly and consistently, without copy-paste fatigue and without mistakes at 23:47.",
      "Our estimate model is conservative: a support worker costs about €600/month, and each AI-handled reply saves about two minutes. At 50 messages a day, that is roughly €80–100 of working time per month — from the cheapest plan.",
      "Time saved is not just money: it is evenings back, faster shipping (because you are packing instead of typing), and customers who never wait."
    ]
  },
  {
    slug: "collect-orders-automatically-from-instagram-dm",
    title: "How to collect orders automatically from Instagram DMs",
    description: "From “želim da naručim” to a structured order in your Google Sheet — without lifting a finger.",
    date: "2026-07-03",
    body: [
      "The moment a customer says they want to order, the clock starts. Ask for details too slowly and enthusiasm cools; ask in a messy thread and you ship to the wrong address.",
      "NibaChat Agent detects order intent and switches to collection mode: full name, street and number, city, postal code, phone, and what they are ordering. Politely, one message, in your language.",
      "The completed order is saved to your dashboard and appended to your own Google Sheet — the same sheet your packing table already uses. If the sheet is unreachable, the order is safely stored in the app and flagged for retry.",
      "For order-status questions, the agent answers honestly: “We will check and let you know soon” — and pings a human, instead of inventing tracking numbers."
    ]
  },
  {
    slug: "why-fast-replies-increase-sales",
    title: "Why fast replies increase sales",
    description: "Reply speed is the highest-leverage conversion factor in DM commerce. The data and the mechanism.",
    date: "2026-07-04",
    body: [
      "DM shoppers are impulse shoppers. They saw the reel, they want the necklace, they ask the price. If the answer arrives while the desire is hot, they buy; if it arrives tomorrow, they scrolled on long ago.",
      "Meta’s own guidance pushes pages toward fast response badges for a reason: response time is trust. A page that answers in seconds feels staffed, professional, real. A page that answers in a day feels like a risk.",
      "There is also a ranking effect: pages with consistently fast responses get better placement in inbox and discovery surfaces.",
      "An AI agent is the only way to answer in seconds, 24/7, without hiring a night shift. Even in cautious draft mode, prepared answers cut your response time in half."
    ]
  },
  {
    slug: "human-handoff-best-practices",
    title: "Human handoff best practices",
    description: "The AI answers the routine; humans handle the delicate. How to draw that line safely.",
    date: "2026-07-05",
    body: [
      "The fastest way to ruin a customer relationship is a bot that pretends to be human while mishandling a complaint. The handoff line must be sharp.",
      "Trigger words are the foundation: reklamacija, problem, kasni, agent, čovek, hitno — when the customer says them, the bot goes silent and a human is notified. NibaChat lets every business tune its own list.",
      "Silence after handoff matters as much as the handoff itself. Our agent stays quiet for 24 hours after a human takes over — no awkward bot interruptions mid-apology.",
      "Review your handoff list weekly at the start: every conversation there is either a missing FAQ (teach the bot) or a genuinely human case (keep it human). That loop is how the agent gets smarter without ever guessing."
    ]
  },
  {
    slug: "ai-chatbot-for-small-balkan-businesses",
    title: "AI chatbot for small Balkan businesses",
    description: "Serbian, Bosnian, Croatian — DM commerce in the Balkans has its own rules. NibaChat was built for them.",
    date: "2026-07-06",
    body: [
      "Balkan social commerce runs on Instagram DMs, cash on delivery, and trust. Customers write “jel ima?”, “može pouzećem?”, “šaljete za Banja Luku?” — short, informal, and expecting a human-fast answer.",
      "Generic chatbots trained for English e-commerce stumble here. NibaChat Agent speaks Serbian, Bosnian and Croatian natively, understands pouzeće and poštarina, and answers with the polite forms local customers expect.",
      "It also respects how these shops actually operate: orders in a Google Sheet, notifications in a Telegram group, one owner doing everything from a phone.",
      "Start free, connect your page in one login, add your ten most common questions — and let the agent take the night shift."
    ]
  }
];

/** Serbian articles for the SR/BS market (default locale). */
export const BLOG_POSTS_SR: BlogPost[] = [
  {
    slug: "ai-chatbot-za-instagram-prodaju",
    title: "AI chatbot za Instagram prodaju: kako da ne izgubiš kupca",
    description: "Zašto je brzina odgovora najvažniji faktor prodaje u Instagram porukama i kako AI agent tu pomaže.",
    date: "2026-07-08",
    lang: "sr",
    body: [
      "Ako prodaješ preko Instagram poruka, tvoj inboks je tvoja radnja. Svako neodgovoreno „koliko košta?“ ili „ima li na stanju?“ je kupac koji izlazi iz radnje.",
      "Kupci na društvenim mrežama su impulsivni. Videli su objavu, žele proizvod, pitaju cenu. Ako odgovor stigne dok je želja topla — kupuju. Ako stigne sutra, odavno su otišli dalje.",
      "AI agent odgovara na 80% ponavljajućih pitanja odmah — cena, dostava, poručivanje, dostupnost — a komplikovanih 20% prosleđuje čoveku. Rezultat: brži odgovori, više porudžbina, manje vremena zalepljenog za telefon.",
      "NibaChat se povezuje na tvoju Facebook stranicu i Instagram u jednom koraku, uči tvoje proizvode i pitanja, i počinje da odgovara tvojim tonom — sa prekidačem za ljudsko preuzimanje uvek na dohvat ruke."
    ]
  },
  {
    slug: "kako-automatizovati-odgovore-na-facebook-i-instagram-poruke",
    title: "Kako automatizovati odgovore na Facebook i Instagram poruke",
    description: "Praktičan vodič: od povezivanja naloga do agenta koji odgovara i noću, bez izmišljanja.",
    date: "2026-07-08",
    lang: "sr",
    body: [
      "Automatizacija poruka ne znači robotske, hladne odgovore. Znači da rutinska pitanja dobiju tačan odgovor za nekoliko sekundi, a ti dobiješ nazad svoje veče.",
      "Prvi korak je povezivanje: jednim Facebook prijavljivanjem povezuješ stranicu i Instagram. Tokeni se čuvaju šifrovano — bez developer konzole i bez koda.",
      "Drugi korak je znanje: dodaš cenovnik, pravila dostave i najčešća pitanja, ili samo nalepiš link svog sajta da agent pročita katalog. Deset minuta, jednom.",
      "Treći korak je poverenje: kreni u draft režimu i proveri svaki odgovor pre nego što ga pustiš uživo. Kad vidiš da je tačan, uključiš „uživo“ — i agent preuzima noćnu smenu."
    ]
  },
  {
    slug: "chatbot-za-online-prodavnice",
    title: "Chatbot za online prodavnice: cena, dostava i stanje bez čekanja",
    description: "Kako AI agent odgovara na najčešća pitanja e-commerce kupaca i prima porudžbine direktno iz poruke.",
    date: "2026-07-08",
    lang: "sr",
    body: [
      "Online prodavnica koja prodaje kroz poruke dnevno dobije desetine istih pitanja: cena, poštarina, rok dostave, veličine, dostupnost, načini plaćanja.",
      "Umesto da ih prepisuješ ručno, AI agent odgovara odmah i dosledno — bez zamora od kopiranja i bez grešaka u pola noći. Kada kupac kaže da želi da poruči, agent prelazi u režim prikupljanja: ime, adresa, grad, telefon.",
      "Gotova porudžbina se čuva u tvom panelu i dodaje u tvoju Google tabelu — istu koju već koristiš za pakovanje. Ako tabela nije dostupna, porudžbina je bezbedno sačuvana u aplikaciji.",
      "Za pitanja o statusu porudžbine agent odgovara pošteno: „Proverićemo i javljamo“ — i obavesti čoveka, umesto da izmišlja brojeve za praćenje."
    ]
  },
  {
    slug: "kako-ai-bot-koristi-bazu-znanja-i-proizvode",
    title: "Kako AI bot koristi bazu znanja i proizvode",
    description: "Agent odgovara iz tvojih podataka, ne izmišlja. Kako baza znanja i katalog proizvoda rade zajedno.",
    date: "2026-07-08",
    lang: "sr",
    body: [
      "Dobar AI agent nije generički ćaskalo — on odgovara isključivo iz onoga što mu daš. To znanje dolazi iz dva izvora: baze znanja i kataloga proizvoda.",
      "Baza znanja pokriva opšta pitanja: dostava, plaćanje, povraćaj, radno vreme, lokacija, uslovi. Možeš je popuniti ručno ili tako što nalepiš link svog sajta pa agent izvuče tekst sa stranica „O nama“, „Dostava“, „Česta pitanja“.",
      "Katalog proizvoda pokriva konkretne činjenice: cena, stanje, veličine, boje, šifra, slike. Ove činjenice uvek imaju prednost — ako se sajt i katalog ne slažu oko cene, agent veruje katalogu.",
      "Kada agent nije siguran, ne pogađa. Kaže da će tim proveriti i prosledi razgovor tebi. Tako postaje pametniji vremenom, a nikada ne obećava ono što ne zna."
    ]
  },
  {
    slug: "kako-smanjiti-vreme-odgovaranja-kupcima",
    title: "Kako smanjiti vreme odgovaranja kupcima",
    description: "Vreme odgovora je najjači pokazatelj konverzije u prodaji kroz poruke. Evo kako da ga skratiš na sekunde.",
    date: "2026-07-08",
    lang: "sr",
    body: [
      "Mala radnja koja prodaje kroz poruke odgovara na 30–100 poruka dnevno. Uz 2–3 minuta po poruci, to je 1–5 sati kucanja — svakog dana.",
      "Većina tih poruka su istih deset pitanja. AI agent na njih odgovara u sekundi, 24/7, bez noćne smene i bez zamora. Čak i u opreznom draft režimu, spremni odgovori prepolove tvoje vreme odgovora.",
      "Meta nagrađuje stranice sa brzim odgovorom: bolji plasman u inboksu i veće poverenje kupaca. Stranica koja odgovara u sekundi deluje profesionalno; ona koja odgovara za dan deluje kao rizik.",
      "Ušteđeno vreme nije samo novac — to su večeri nazad, brža otprema (jer pakuješ umesto da kucaš) i kupci koji nikada ne čekaju."
    ]
  }
];

/** Bosnian articles — same slugs as the Serbian set, authored in ijekavica. */
export const BLOG_POSTS_BS: BlogPost[] = [
  {
    slug: "ai-chatbot-za-instagram-prodaju",
    title: "AI chatbot za Instagram prodaju: kako da ne izgubiš kupca",
    description: "Zašto je brzina odgovora najvažniji faktor prodaje u Instagram porukama i kako AI agent tu pomaže.",
    date: "2026-07-08",
    lang: "bs",
    body: [
      "Ako prodaješ preko Instagram poruka, tvoj inboks je tvoja radnja. Svako neodgovoreno „koliko košta?“ ili „ima li na stanju?“ je kupac koji izlazi iz radnje.",
      "Kupci na društvenim mrežama su impulsivni. Vidjeli su objavu, žele proizvod, pitaju cijenu. Ako odgovor stigne dok je želja topla — kupuju. Ako stigne sutra, odavno su otišli dalje.",
      "AI agent odgovara na 80% ponavljajućih pitanja odmah — cijena, dostava, naručivanje, dostupnost — a komplikovanih 20% prosljeđuje čovjeku. Rezultat: brži odgovori, više narudžbi, manje vremena zalijepljenog za telefon.",
      "NibaChat se povezuje na tvoju Facebook stranicu i Instagram u jednom koraku, uči tvoje proizvode i pitanja, i počinje da odgovara tvojim tonom — sa prekidačem za ljudsko preuzimanje uvijek na dohvat ruke."
    ]
  },
  {
    slug: "kako-automatizovati-odgovore-na-facebook-i-instagram-poruke",
    title: "Kako automatizovati odgovore na Facebook i Instagram poruke",
    description: "Praktičan vodič: od povezivanja naloga do agenta koji odgovara i noću, bez izmišljanja.",
    date: "2026-07-08",
    lang: "bs",
    body: [
      "Automatizacija poruka ne znači robotske, hladne odgovore. Znači da rutinska pitanja dobiju tačan odgovor za nekoliko sekundi, a ti dobiješ nazad svoju večer.",
      "Prvi korak je povezivanje: jednim Facebook prijavljivanjem povezuješ stranicu i Instagram. Tokeni se čuvaju šifrovano — bez developer konzole i bez koda.",
      "Drugi korak je znanje: dodaš cjenovnik, pravila dostave i najčešća pitanja, ili samo nalijepiš link svog sajta da agent pročita katalog. Deset minuta, jednom.",
      "Treći korak je povjerenje: kreni u draft režimu i provjeri svaki odgovor prije nego što ga pustiš uživo. Kad vidiš da je tačan, uključiš „uživo“ — i agent preuzima noćnu smjenu."
    ]
  },
  {
    slug: "chatbot-za-online-prodavnice",
    title: "Chatbot za online prodavnice: cijena, dostava i stanje bez čekanja",
    description: "Kako AI agent odgovara na najčešća pitanja e-commerce kupaca i prima narudžbe direktno iz poruke.",
    date: "2026-07-08",
    lang: "bs",
    body: [
      "Online prodavnica koja prodaje kroz poruke dnevno dobije desetine istih pitanja: cijena, poštarina, rok dostave, veličine, dostupnost, načini plaćanja.",
      "Umjesto da ih prepisuješ ručno, AI agent odgovara odmah i dosljedno — bez zamora od kopiranja i bez grešaka u pola noći. Kada kupac kaže da želi da naruči, agent prelazi u režim prikupljanja: ime, adresa, grad, telefon.",
      "Gotova narudžba se čuva u tvom panelu i dodaje u tvoju Google tabelu — istu koju već koristiš za pakovanje. Ako tabela nije dostupna, narudžba je bezbjedno sačuvana u aplikaciji.",
      "Za pitanja o statusu narudžbe agent odgovara pošteno: „Provjerićemo i javljamo“ — i obavijesti čovjeka, umjesto da izmišlja brojeve za praćenje."
    ]
  },
  {
    slug: "kako-ai-bot-koristi-bazu-znanja-i-proizvode",
    title: "Kako AI bot koristi bazu znanja i proizvode",
    description: "Agent odgovara iz tvojih podataka, ne izmišlja. Kako baza znanja i katalog proizvoda rade zajedno.",
    date: "2026-07-08",
    lang: "bs",
    body: [
      "Dobar AI agent nije generičko ćaskalo — on odgovara isključivo iz onoga što mu daš. To znanje dolazi iz dva izvora: baze znanja i kataloga proizvoda.",
      "Baza znanja pokriva opća pitanja: dostava, plaćanje, povrat, radno vrijeme, lokacija, uslovi. Možeš je popuniti ručno ili tako što nalijepiš link svog sajta pa agent izvuče tekst sa stranica „O nama“, „Dostava“, „Česta pitanja“.",
      "Katalog proizvoda pokriva konkretne činjenice: cijena, stanje, veličine, boje, šifra, slike. Ove činjenice uvijek imaju prednost — ako se sajt i katalog ne slažu oko cijene, agent vjeruje katalogu.",
      "Kada agent nije siguran, ne pogađa. Kaže da će tim provjeriti i proslijedi razgovor tebi. Tako postaje pametniji vremenom, a nikada ne obećava ono što ne zna."
    ]
  },
  {
    slug: "kako-smanjiti-vreme-odgovaranja-kupcima",
    title: "Kako smanjiti vrijeme odgovaranja kupcima",
    description: "Vrijeme odgovora je najjači pokazatelj konverzije u prodaji kroz poruke. Evo kako da ga skratiš na sekunde.",
    date: "2026-07-08",
    lang: "bs",
    body: [
      "Mala radnja koja prodaje kroz poruke odgovara na 30–100 poruka dnevno. Uz 2–3 minuta po poruci, to je 1–5 sati kucanja — svakog dana.",
      "Većina tih poruka su istih deset pitanja. AI agent na njih odgovara u sekundi, 24/7, bez noćne smjene i bez zamora. Čak i u opreznom draft režimu, spremni odgovori prepolove tvoje vrijeme odgovora.",
      "Meta nagrađuje stranice sa brzim odgovorom: bolji plasman u inboksu i veće povjerenje kupaca. Stranica koja odgovara u sekundi djeluje profesionalno; ona koja odgovara za dan djeluje kao rizik.",
      "Ušteđeno vrijeme nije samo novac — to su večeri nazad, brža otprema (jer pakuješ umjesto da kucaš) i kupci koji nikada ne čekaju."
    ]
  }
];

const SETS: Record<"sr" | "bs" | "en", BlogPost[]> = {
  sr: BLOG_POSTS_SR,
  bs: BLOG_POSTS_BS,
  en: BLOG_POSTS.filter((p) => (p.lang ?? "en") === "en")
};

/** Localized post list for a public locale. */
export function postsFor(locale: "sr" | "bs" | "en"): BlogPost[] {
  return SETS[locale] ?? BLOG_POSTS_SR;
}

/** Localized single post by slug — STRICT: only returns a post that exists in
 * that locale (no cross-language fallback, so we never render English content
 * under /bs or /sr). Missing → undefined → the route 404s. */
export function getLocalizedPost(locale: "sr" | "bs" | "en", slug: string): BlogPost | undefined {
  return SETS[locale]?.find((p) => p.slug === slug);
}

export function getPost(slug: string): BlogPost | undefined {
  return [...BLOG_POSTS_SR, ...BLOG_POSTS_BS, ...BLOG_POSTS].find((p) => p.slug === slug);
}

/** Which locales actually have an article at this slug (for hreflang alternates). */
export function localesForSlug(slug: string): ("sr" | "bs" | "en")[] {
  return (["sr", "bs", "en"] as const).filter((l) => SETS[l].some((p) => p.slug === slug));
}

/** All (locale, slug) pairs for static generation. */
export function allBlogParams(): { locale: "sr" | "bs" | "en"; slug: string }[] {
  return (["sr", "bs", "en"] as const).flatMap((locale) => SETS[locale].map((p) => ({ locale, slug: p.slug })));
}
