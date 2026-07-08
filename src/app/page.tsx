import Link from "next/link";
import { NibaLogo } from "@/components/logo";
import { LandingHeader } from "@/components/landing/header";
import { Reveal } from "@/components/landing/reveal";
import { HeroDemo } from "@/components/landing/hero-demo";
import { AgentDemo } from "@/components/landing/agent-demo";
import { PLAN_DEFS } from "@/lib/plans";

const CAPS = ["Odgovara o ceni", "Prima porudžbine", "Proverava dostavu i stanje", "Radi na Instagram i Facebook"];

const BENEFITS = [
  {
    tag: "Brzina",
    title: "Odgovori pre nego što kupac ode",
    body: "Na cenu, dostavu i „ima li na stanju“ agent odgovara istog trenutka. Ti zadržavaš razgovore koji su zaista bitni."
  },
  {
    tag: "Porudžbine",
    title: "Porudžbine iz DM-a, bez prepisivanja",
    body: "Ime, adresa, telefon i grad — prikupljeno kroz razgovor i sačuvano u tvoj panel i tvoju Google tabelu."
  },
  {
    tag: "Predaja",
    title: "Tim ulazi samo kada zaista treba",
    body: "Reči poput „reklamacija“ ili „agent“ odmah ućutkaju bota, označe razgovor i obaveste tim na Telegramu."
  }
];

const STEPS = [
  { n: "01", title: "Poveži naloge", body: "Jednim Facebook loginom povezuješ stranicu i Instagram. Tokeni su šifrovani — bez Meta konzole i bez koda." },
  { n: "02", title: "Dodaj proizvode i pravila", body: "Ubaci cenovnik, dostavu i česta pitanja — ili samo nalepi link svog šopa da pročita katalog. Deset minuta, jednom." },
  { n: "03", title: "NibaChat odgovara i hvata porudžbine", body: "Kreni u draft režimu i proveri svaki odgovor. Uključi „uživo“ kad stekneš poverenje. Preuzimaš razgovor kad god želiš." },
  { n: "04", title: "Tim preuzima samo teže slučajeve", body: "Agent radi rutinu; ti i tim ulazite tek kada je potrebna ljudska procena." }
];

const FAQ = [
  { q: "Da li mi treba tehničko znanje?", a: "Ne. Prijaviš se preko Facebook-a, izabereš stranicu i agent je povezan. Bez Meta developer konzole, bez koda, bez terminala." },
  { q: "Da li izmišlja cene ili obećanja?", a: "Ne — agent odgovara isključivo iz znanja koje mu daš. Kada nije siguran, kaže da će tim proveriti i prosledi razgovor tebi." },
  { q: "Šta je sa reklamacijama i nezadovoljnim kupcima?", a: "Ključne reči (reklamacija, problem, agent, čovek…) odmah ućutkaju bota, označe razgovor i obaveste te na Telegramu." },
  { q: "Mogu li da ga probam pre nego što priča sa kupcima?", a: "Da — draft režim priprema odgovore bez slanja, a ugrađeni test čet ti dozvoljava da ga prvo lično ispitaš." },
  { q: "Koje jezike govori?", a: "Srpski, bosanski, hrvatski i engleski, uz persiranje. Odgovara na jeziku na kom kupac piše." },
  { q: "Kako se naplaćuje?", a: "Postoji besplatan plan za probu, a zatim plaćeni planovi prema broju poruka. Naplata je za sada ručna — bez kartice na startu." }
];

const PLAN_NAME_SR: Record<string, string> = {
  Free: "Početni",
  Basic: "Osnovni",
  Standard: "Standard",
  Pro: "Pro",
  Business: "Biznis",
  Enterprise: "Korporativni"
};

const SUPPORT_SR: Record<string, string> = {
  Community: "Zajednica",
  Email: "Email podrška",
  "Priority email": "Prioritetni email",
  Priority: "Prioritetna podrška",
  Dedicated: "Posvećena podrška",
  "Dedicated + SLA": "Posvećena podrška + SLA"
};

export default function LandingPage() {
  return (
    <div className="lp">
      <LandingHeader />
      <Reveal />

      <main>
        {/* ---------------------------------------------------------------- HERO */}
        <section className="lp-hero flex min-h-[100svh] flex-col">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="lp-hero-img"
            src="/hero/hero-street-1280.webp"
            srcSet="/hero/hero-street-720.webp 720w, /hero/hero-street-1280.webp 1280w, /hero/hero-street.webp 2200w"
            sizes="100vw"
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="async"
          />
          <div className="lp-hero-scrim" />
          <div className="lp-hero-glow" />

          <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 pb-12 pt-28 md:pt-32 lg:grid-cols-[1.05fr_0.95fr]">
            {/* left: copy */}
            <div className="reveal in">
              <p className="eyebrow eyebrow-ember">AI agent za Instagram i Facebook poruke</p>
              <h1 className="font-display mt-5 text-[2.6rem] leading-[1.05] tracking-tight text-[color:var(--ink-warm)] sm:text-[3.4rem] lg:text-[4rem]">
                Svaka poruka odgovorena.
                <br />
                <span className="italic text-[color:var(--ember-strong)]">Svaka porudžbina uhvaćena.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[color:var(--muted)]">
                NibaChat odgovara na pitanja o cenama, dostavi i stanju proizvoda, prima porudžbine iz Instagram i Facebook
                poruka i prosleđuje komplikovane slučajeve tvom timu.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/signup" className="pill pill-solid">
                  Pokreni besplatno
                </Link>
                <a href="#demo" className="pill pill-ghost">
                  Pogledaj kako radi
                </a>
              </div>
              <p className="mt-4 text-sm text-[color:var(--muted-2)]">Bez kartice · Povezivanje u jednom koraku</p>

              <div className="cap-row mt-8 flex flex-wrap gap-2.5">
                {CAPS.map((c) => (
                  <span key={c} className="cap-chip">
                    <span className="cap-tick">✓</span>
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {/* right: animated product demo */}
            <div className="reveal reveal-slow flex justify-center lg:justify-end">
              <HeroDemo />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- PRODUCT */}
        <section id="product" className="mx-auto max-w-6xl px-5 py-24 md:py-32">
          <div className="max-w-2xl reveal">
            <p className="eyebrow eyebrow-ember">Šta radi</p>
            <h2 className="font-display mt-4 text-3xl leading-tight text-[color:var(--ink-warm)] md:text-[2.75rem]">
              Haotičan inboks postaje miran — i naplativ.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[color:var(--muted)]">
              Pitanja koja se ponavljaju — cena, dostava, „ima li na stanju“ — rešena čim stignu. Ti zadržavaš razgovore koji su
              bitni; agent tiho rešava sve ostalo.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {BENEFITS.map((b, i) => (
              <div key={b.title} className="lp-card lp-lift reveal p-7 md:p-8" style={{ transitionDelay: `${i * 90}ms` }}>
                <span className="eyebrow eyebrow-ember">{b.tag}</span>
                <h3 className="font-display mt-4 text-xl text-[color:var(--ink-warm)]">{b.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--muted)]">{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- HOW */}
        <section id="how" className="border-y border-[color:var(--line)] bg-[color:var(--paper-2)]">
          <div className="mx-auto max-w-6xl px-5 py-24 md:py-32">
            <div className="max-w-2xl reveal">
              <p className="eyebrow eyebrow-ember">Kako radi</p>
              <h2 className="font-display mt-4 text-3xl leading-tight text-[color:var(--ink-warm)] md:text-[2.75rem]">
                Spremno za pola dana. Tvoje zauvek.
              </h2>
            </div>
            <div className="mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <div key={s.n} className="reveal" style={{ transitionDelay: `${i * 80}ms` }}>
                  <div className="font-display text-4xl text-[color:var(--ember-strong)]">{s.n}</div>
                  <div className="mt-4 h-px w-12 bg-[color:var(--ember)]/50" />
                  <h3 className="font-display mt-5 text-lg leading-snug text-[color:var(--ink-warm)]">{s.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--muted)]">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- LIVE DEMO (dark) */}
        <section id="demo" className="bg-[color:var(--night)] text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 md:grid-cols-2 md:py-32">
            <div className="reveal">
              <p className="eyebrow text-white/45">Uživo demo</p>
              <h2 className="font-display mt-4 text-3xl leading-tight md:text-[2.75rem]">
                Pričaj sa agentom. Odgovara kao tvoj najbolji prodavac.
              </h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-white/70">
                Kratki, topli odgovori — na jeziku kupca. Probaj par pitanja desno. Ovaj demo koristi unapred spremljene
                odgovore; tvoj agent uživo odgovara iz tvog kataloga i tvojih pravila.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="pill pill-solid">
                  Pokreni besplatno
                </Link>
                <a href="mailto:demo@nibachat.agency?subject=Zahtev%20za%20demo" className="pill pill-glass">
                  Zakaži demo
                </a>
              </div>
            </div>
            <div className="reveal reveal-slow">
              <AgentDemo />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- PRICING */}
        <section id="pricing" className="mx-auto max-w-6xl px-5 py-24 md:py-32">
          <div className="max-w-2xl reveal">
            <p className="eyebrow eyebrow-ember">Cene</p>
            <h2 className="font-display mt-4 text-3xl leading-tight text-[color:var(--ink-warm)] md:text-[2.75rem]">
              Počni besplatno. Plaćaš kako inboks raste.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[color:var(--muted)]">
              Bez kartice na startu. Naplata je za sada ručna — izaberi plan i mi te povežemo.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PLAN_DEFS.map((p, i) => (
              <div
                key={p.id}
                className={`reveal relative flex flex-col rounded-[1.5rem] p-7 ${
                  p.highlight ? "bg-[color:var(--night)] text-white shadow-[0_30px_70px_-40px_rgba(13,26,38,0.7)]" : "lp-card lp-lift"
                }`}
                style={{ transitionDelay: `${(i % 3) * 80}ms` }}
              >
                {p.highlight && (
                  <span className="absolute right-6 top-7 rounded-full bg-[color:var(--ember-strong)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
                    Najpopularniji
                  </span>
                )}
                <h3 className={`font-display text-xl ${p.highlight ? "text-white" : "text-[color:var(--ink-warm)]"}`}>{PLAN_NAME_SR[p.name] ?? p.name}</h3>
                <div className={`mt-3 font-display text-4xl ${p.highlight ? "text-white" : "text-[color:var(--ink-warm)]"}`}>
                  {p.priceEur === null ? "Po dogovoru" : p.priceEur === 0 ? "Besplatno" : `€${p.priceEur}`}
                  {p.priceEur !== null && p.priceEur > 0 && (
                    <span className={`text-sm font-normal ${p.highlight ? "text-white/60" : "text-[color:var(--muted-2)]"}`}> /mes</span>
                  )}
                </div>
                <ul className={`mt-5 flex-1 space-y-2 text-sm ${p.highlight ? "text-white/75" : "text-[color:var(--muted)]"}`}>
                  <li>{p.messagesPerMonth === Infinity ? "Neograničeno" : p.messagesPerMonth.toLocaleString("sr-RS")} poruka / mesec</li>
                  <li>{p.aiRepliesPerMonth === Infinity ? "Neograničeno" : p.aiRepliesPerMonth.toLocaleString("sr-RS")} AI odgovora / mesec</li>
                  <li>
                    {p.channels === Infinity ? "Neograničeno" : p.channels} {p.channels === 1 ? "kanal" : "kanala"} ·{" "}
                    {p.knowledgeSources === Infinity ? "neograničeno" : p.knowledgeSources} izvora znanja
                  </li>
                  <li>{p.handoff ? "Predaja timu" : "Bez predaje"} · {p.sheetOrders ? "Porudžbine u Google tabeli" : "Porudžbine u panelu"}</li>
                  <li>
                    {p.notifications ? "Telegram / WhatsApp obaveštenja" : "Email obaveštenja"} ·{" "}
                    {p.analytics === "advanced" ? "napredna analitika" : "osnovna analitika"}
                  </li>
                  <li>{SUPPORT_SR[p.support] ?? p.support}</li>
                </ul>
                <Link
                  href={p.priceEur === null ? "mailto:sales@nibachat.agency?subject=Enterprise" : "/signup"}
                  className={`pill mt-7 w-full ${p.highlight ? "pill-solid" : "pill-ghost"}`}
                >
                  {p.priceEur === 0 ? "Pokreni besplatno" : p.priceEur === null ? "Kontaktiraj nas" : "Izaberi plan"}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- FAQ */}
        <section id="faq" className="border-t border-[color:var(--line)] bg-[color:var(--paper-2)]">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 md:grid-cols-[0.8fr_1.2fr] md:py-32">
            <div className="reveal">
              <p className="eyebrow eyebrow-ember">Česta pitanja</p>
              <h2 className="font-display mt-4 text-3xl leading-tight text-[color:var(--ink-warm)] md:text-4xl">
                Sve što te zanima, pre nego što se prijaviš.
              </h2>
            </div>
            <div className="reveal divide-y divide-[color:var(--line)]">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-[color:var(--ink-warm)]">
                    {f.q}
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[color:var(--line)] text-[color:var(--muted-2)] transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[color:var(--muted)]">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- FINAL CTA */}
        <section className="relative isolate overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="absolute inset-0 -z-20 h-full w-full object-cover"
            src="/hero/cta-street-960.webp"
            srcSet="/hero/cta-street-960.webp 960w, /hero/cta-street.webp 1920w"
            sizes="100vw"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(13,26,38,0.62),rgba(13,26,38,0.48))]" />
          <div className="mx-auto max-w-3xl px-5 py-28 text-center md:py-36">
            <h2 className="font-display text-3xl leading-tight text-white md:text-5xl reveal">
              Prestani da gubiš kupce u porukama.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/85 reveal">
              Pusti NibaChat da odgovara i hvata porudžbine dok ti vodiš posao. Poveži se za par minuta i gledaj kako radi.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3 reveal">
              <Link href="/signup" className="pill pill-solid">
                Pokreni besplatno
              </Link>
              <a href="mailto:demo@nibachat.agency?subject=Zahtev%20za%20demo" className="pill pill-glass">
                Zakaži demo
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ---------------------------------------------------------------- FOOTER */}
      <footer className="bg-[color:var(--night)] text-white/70">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <NibaLogo markColor="#d9814e" plain />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/55">
              AI agenti za Instagram i Facebook poruke. Napravljeno za radnje koje prodaju kroz DM.
            </p>
          </div>
          <FooterCol
            title="Proizvod"
            links={[
              { href: "#product", label: "Funkcije" },
              { href: "#pricing", label: "Cene" },
              { href: "/blog", label: "Blog" }
            ]}
          />
          <FooterCol
            title="Pravno"
            links={[
              { href: "/legal/privacy", label: "Privatnost" },
              { href: "/legal/terms", label: "Uslovi korišćenja" },
              { href: "/legal/cookies", label: "Kolačići" },
              { href: "/legal/data-deletion", label: "Brisanje podataka" },
              { href: "/legal/gdpr", label: "GDPR" }
            ]}
          />
          <div>
            <div className="text-sm font-semibold text-white">Jezici</div>
            <p className="mt-3 text-sm text-white/55">Srpski · Bosanski · Hrvatski · English</p>
            <div className="mt-6 flex gap-2">
              <Link href="/login" className="pill pill-glass !px-4 !py-2 !text-sm">
                Prijava
              </Link>
              <Link href="/signup" className="pill pill-solid !px-4 !py-2 !text-sm">
                Pokreni besplatno
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-5 text-xs text-white/40">© 2026 NibaChat Agent. Sva prava zadržana.</div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <div className="text-sm font-semibold text-white">{title}</div>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-white/55 transition hover:text-white">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
