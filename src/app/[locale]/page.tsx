import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { NibaLogo } from "@/components/logo";
import { LandingHeader } from "@/components/landing/header";
import { Reveal } from "@/components/landing/reveal";
import { HeroDemo } from "@/components/landing/hero-demo";
import { AgentDemo } from "@/components/landing/agent-demo";
import { LanguageSwitcher } from "@/components/landing/language-switcher";
import { PLAN_DEFS } from "@/lib/plans";
import { getDict, HREFLANG, LOCALES, isLocale, type Locale } from "@/lib/i18n";

const BASE = process.env.APP_URL || "https://nibaagent.vercel.app";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const t = getDict(raw);
  const title = "NibaChat Agent — " + (raw === "en" ? "AI agent for Instagram & Facebook messages" : raw === "bs" ? "AI agent za Instagram i Facebook poruke" : "AI agent za Instagram i Facebook poruke");
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[HREFLANG[l]] = `${BASE}/${l}`;
  return {
    title,
    description: t.hero.sub,
    alternates: { canonical: `${BASE}/${raw}`, languages },
    openGraph: { title, description: t.hero.sub, url: `${BASE}/${raw}`, locale: HREFLANG[raw].replace("-", "_"), type: "website" }
  };
}

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDict(locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "NibaChat Agent", url: BASE, logo: `${BASE}/icon.svg` },
      {
        "@type": "SoftwareApplication",
        name: "NibaChat Agent",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: HREFLANG[locale],
        description: t.hero.sub,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" }
      },
      {
        "@type": "FAQPage",
        inLanguage: HREFLANG[locale],
        mainEntity: t.faq.items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } }))
      }
    ]
  };

  return (
    <div className="lp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LandingHeader t={t.nav} locale={locale} />
      <Reveal />

      <main>
        {/* HERO */}
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
            <div className="reveal in">
              <p className="eyebrow eyebrow-ember">{t.hero.eyebrow}</p>
              <h1 className="font-display mt-5 text-[2.6rem] leading-[1.05] tracking-tight text-[color:var(--ink-warm)] sm:text-[3.4rem] lg:text-[4rem]">
                {t.hero.h1a}
                <br />
                <span className="italic text-[color:var(--ember-strong)]">{t.hero.h1b}</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[color:var(--muted)]">{t.hero.sub}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/signup" className="pill pill-solid">
                  {t.hero.ctaPrimary}
                </Link>
                <a href="#demo" className="pill pill-ghost">
                  {t.hero.ctaSecondary}
                </a>
              </div>
              <p className="mt-4 text-sm text-[color:var(--muted-2)]">{t.hero.helper}</p>
              <div className="cap-row mt-8 flex flex-wrap gap-2.5">
                {t.hero.caps.map((c) => (
                  <span key={c} className="cap-chip">
                    <span className="cap-tick">✓</span>
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="reveal reveal-slow flex justify-center lg:justify-end">
              <HeroDemo t={t.demo} />
            </div>
          </div>
        </section>

        {/* PRODUCT */}
        <section id="product" className="mx-auto max-w-6xl px-5 py-24 md:py-32">
          <div className="max-w-2xl reveal">
            <p className="eyebrow eyebrow-ember">{t.product.eyebrow}</p>
            <h2 className="font-display mt-4 text-3xl leading-tight text-[color:var(--ink-warm)] md:text-[2.75rem]">{t.product.h2}</h2>
            <p className="mt-4 text-lg leading-relaxed text-[color:var(--muted)]">{t.product.sub}</p>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {t.product.benefits.map((b, i) => (
              <div key={b.title} className="lp-card lp-lift reveal p-7 md:p-8" style={{ transitionDelay: `${i * 90}ms` }}>
                <span className="eyebrow eyebrow-ember">{b.tag}</span>
                <h3 className="font-display mt-4 text-xl text-[color:var(--ink-warm)]">{b.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--muted)]">{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* HOW */}
        <section id="how" className="border-y border-[color:var(--line)] bg-[color:var(--paper-2)]">
          <div className="mx-auto max-w-6xl px-5 py-24 md:py-32">
            <div className="max-w-2xl reveal">
              <p className="eyebrow eyebrow-ember">{t.how.eyebrow}</p>
              <h2 className="font-display mt-4 text-3xl leading-tight text-[color:var(--ink-warm)] md:text-[2.75rem]">{t.how.h2}</h2>
            </div>
            <div className="mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
              {t.how.steps.map((s, i) => (
                <div key={s.title} className="reveal" style={{ transitionDelay: `${i * 80}ms` }}>
                  <div className="font-display text-4xl text-[color:var(--ember-strong)]">{String(i + 1).padStart(2, "0")}</div>
                  <div className="mt-4 h-px w-12 bg-[color:var(--ember)]/50" />
                  <h3 className="font-display mt-5 text-lg leading-snug text-[color:var(--ink-warm)]">{s.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--muted)]">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* LIVE DEMO */}
        <section id="demo" className="bg-[color:var(--night)] text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 md:grid-cols-2 md:py-32">
            <div className="reveal">
              <p className="eyebrow text-white/45">{t.live.eyebrow}</p>
              <h2 className="font-display mt-4 text-3xl leading-tight md:text-[2.75rem]">{t.live.h2}</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-white/70">{t.live.sub}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="pill pill-solid">
                  {t.live.ctaPrimary}
                </Link>
                <a href="mailto:demo@nibachat.agency?subject=Zahtev%20za%20demo" className="pill pill-glass">
                  {t.live.ctaSecondary}
                </a>
              </div>
            </div>
            <div className="reveal reveal-slow">
              <AgentDemo t={{ greeting: t.live.greeting, active: t.live.active, qa: t.live.qa }} />
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="mx-auto max-w-6xl px-5 py-24 md:py-32">
          <div className="max-w-2xl reveal">
            <p className="eyebrow eyebrow-ember">{t.pricing.eyebrow}</p>
            <h2 className="font-display mt-4 text-3xl leading-tight text-[color:var(--ink-warm)] md:text-[2.75rem]">{t.pricing.h2}</h2>
            <p className="mt-4 text-lg leading-relaxed text-[color:var(--muted)]">{t.pricing.sub}</p>
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
                    {t.pricing.popular}
                  </span>
                )}
                <h3 className={`font-display text-xl ${p.highlight ? "text-white" : "text-[color:var(--ink-warm)]"}`}>{t.pricing.planNames[p.name] ?? p.name}</h3>
                <div className={`mt-3 font-display text-4xl ${p.highlight ? "text-white" : "text-[color:var(--ink-warm)]"}`}>
                  {p.priceEur === null ? t.pricing.contact : p.priceEur === 0 ? t.pricing.free : `€${p.priceEur}`}
                  {p.priceEur !== null && p.priceEur > 0 && (
                    <span className={`text-sm font-normal ${p.highlight ? "text-white/60" : "text-[color:var(--muted-2)]"}`}> {t.pricing.perMonth}</span>
                  )}
                </div>
                <ul className={`mt-5 flex-1 space-y-2 text-sm ${p.highlight ? "text-white/75" : "text-[color:var(--muted)]"}`}>
                  <li>{p.messagesPerMonth === Infinity ? "∞" : p.messagesPerMonth.toLocaleString("sr-RS")} {t.pricing.unitMessages}</li>
                  <li>{p.aiRepliesPerMonth === Infinity ? "∞" : p.aiRepliesPerMonth.toLocaleString("sr-RS")} {t.pricing.unitReplies}</li>
                  <li>
                    {p.channels === Infinity ? "∞" : p.channels} {p.channels === 1 ? t.pricing.channel : t.pricing.channels} ·{" "}
                    {p.knowledgeSources === Infinity ? "∞" : p.knowledgeSources} {t.pricing.knowledge}
                  </li>
                  <li>{p.handoff ? t.pricing.handoffOn : t.pricing.handoffOff} · {p.sheetOrders ? t.pricing.ordersSheet : t.pricing.ordersPanel}</li>
                  <li>{p.notifications ? t.pricing.notifOn : t.pricing.notifOff} · {p.analytics === "advanced" ? t.pricing.analyticsAdv : t.pricing.analyticsBasic}</li>
                  <li>{t.pricing.support[p.support] ?? p.support}</li>
                </ul>
                <Link
                  href={p.priceEur === null ? "mailto:sales@nibachat.agency?subject=Enterprise" : "/signup"}
                  className={`pill mt-7 w-full ${p.highlight ? "pill-solid" : "pill-ghost"}`}
                >
                  {p.priceEur === 0 ? t.pricing.ctaFree : p.priceEur === null ? t.pricing.ctaContact : t.pricing.ctaChoose}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-[color:var(--line)] bg-[color:var(--paper-2)]">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 md:grid-cols-[0.8fr_1.2fr] md:py-32">
            <div className="reveal">
              <p className="eyebrow eyebrow-ember">{t.faq.eyebrow}</p>
              <h2 className="font-display mt-4 text-3xl leading-tight text-[color:var(--ink-warm)] md:text-4xl">{t.faq.h2}</h2>
            </div>
            <div className="reveal divide-y divide-[color:var(--line)]">
              {t.faq.items.map((f) => (
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

        {/* FINAL CTA */}
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
            <h2 className="font-display text-3xl leading-tight text-white md:text-5xl reveal">{t.finalCta.h2}</h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/85 reveal">{t.finalCta.sub}</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3 reveal">
              <Link href="/signup" className="pill pill-solid">
                {t.finalCta.ctaPrimary}
              </Link>
              <a href="mailto:demo@nibachat.agency?subject=Zahtev%20za%20demo" className="pill pill-glass">
                {t.finalCta.ctaSecondary}
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-[color:var(--night)] text-white/70">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <NibaLogo markColor="#d9814e" plain />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/55">{t.footer.tagline}</p>
            <div className="mt-5">
              <LanguageSwitcher current={locale} segment="" tone="dark" />
            </div>
          </div>
          <FooterCol
            title={t.footer.product}
            links={[
              { href: "#product", label: t.nav.features },
              { href: "#pricing", label: t.nav.pricing },
              { href: `/${locale}/blog`, label: t.footer.links.blog }
            ]}
          />
          <FooterCol
            title={t.footer.legal}
            links={[
              { href: "/legal/privacy", label: t.footer.links.privacy },
              { href: "/legal/terms", label: t.footer.links.terms },
              { href: "/legal/cookies", label: t.footer.links.cookies },
              { href: "/legal/data-deletion", label: t.footer.links.dataDeletion },
              { href: "/legal/gdpr", label: t.footer.links.gdpr }
            ]}
          />
          <div>
            <div className="text-sm font-semibold text-white">{t.footer.languages}</div>
            <p className="mt-3 text-sm text-white/55">{t.footer.langList}</p>
            <div className="mt-6 flex gap-2">
              <Link href="/login" className="pill pill-glass !px-4 !py-2 !text-sm">
                {t.nav.login}
              </Link>
              <Link href="/signup" className="pill pill-solid !px-4 !py-2 !text-sm">
                {t.nav.start}
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-5 text-xs text-white/40">© 2026 NibaChat Agent. {t.footer.rights}</div>
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
