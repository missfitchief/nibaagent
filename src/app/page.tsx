import Link from "next/link";
import { NibaLogo } from "@/components/logo";
import { LandingHeader } from "@/components/landing/header";
import { Reveal } from "@/components/landing/reveal";
import { AgentDemo } from "@/components/landing/agent-demo";
import { PLAN_DEFS } from "@/lib/plans";
import { BLOG_POSTS } from "@/lib/blog";

const PROOF = [
  { k: "~3s", v: "average reply time" },
  { k: "24/7", v: "always answering" },
  { k: "4", v: "languages, one agent" },
  { k: "0", v: "answers it invents" }
];

const BENEFITS = [
  {
    title: "Answers from your data — never guesses",
    body: "Feed it your products, prices, delivery rules, FAQs or just your website. It answers only from what it knows, and when it isn't sure it says the team will check.",
    tag: "Grounded"
  },
  {
    title: "Takes the whole order in chat",
    body: "Name, address, phone, city — collected politely inside the conversation and saved to your dashboard and your own Google Sheet.",
    tag: "Orders"
  },
  {
    title: "Knows when to step back",
    body: "Words like “reklamacija” or “agent” silence the bot instantly, flag the chat and ping your team on Telegram. Humans take over in one tap.",
    tag: "Handoff"
  }
];

const STEPS = [
  { n: "01", title: "Connect", body: "One Facebook login links your Page and Instagram. Tokens are stored encrypted — no developer console, no code." },
  { n: "02", title: "Train", body: "Add FAQs, prices and delivery rules, or paste your shop URL and let it read the catalog. Ten minutes, once." },
  { n: "03", title: "Go live", body: "Start in draft mode and review every answer. Flip to live when you trust it. Take over any conversation, any time." }
];

const FAQ = [
  { q: "Do I need any technical knowledge?", a: "No. You log in with Facebook, pick your page, and the agent is connected. No Meta developer console, no code, no terminal." },
  { q: "Will it invent prices or promises?", a: "No — the agent only answers from the knowledge you give it. When it's unsure it says the team will check and hands the conversation to you." },
  { q: "What happens with complaints or angry customers?", a: "Trigger words (reklamacija, problem, agent, čovek…) immediately silence the bot, flag the conversation and notify you on Telegram." },
  { q: "Can I try it before it talks to real customers?", a: "Yes — draft mode lets the agent prepare answers without sending, and a built-in test chat lets you interrogate it privately first." },
  { q: "Which languages does it speak?", a: "Serbian, Bosnian, Croatian and English out of the box, with polite Vi-forms. It replies in the language your customer writes in." },
  { q: "How is it priced?", a: "A free plan to try it, then paid plans by message volume. Billing is manual for now — no card required to start." }
];

export default function LandingPage() {
  return (
    <div className="lp">
      <LandingHeader />
      <Reveal />

      <main>
        {/* ---------------------------------------------------------------- HERO */}
        <section className="lp-hero flex min-h-[100svh] flex-col">
          {/* background (pre-optimized WebP + srcset; deliberate over next/image) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="lp-hero-img"
            src="/hero/hero-dawn-1280.webp"
            srcSet="/hero/hero-dawn-720.webp 720w, /hero/hero-dawn-1280.webp 1280w, /hero/hero-dawn.webp 2200w"
            sizes="100vw"
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="async"
          />
          <div className="lp-hero-scrim" />
          <div className="lp-grain" />

          {/* headline block */}
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-10 pt-32 md:pt-40">
            <div className="max-w-2xl reveal in">
              <p className="eyebrow text-white/70">AI agent · Instagram DM &amp; Messenger</p>
              <h1 className="font-display mt-5 text-[2.65rem] leading-[1.04] tracking-tight text-white sm:text-6xl md:text-[4.25rem]">
                Every message answered.
                <br />
                <span className="italic text-[color:#f3c9a6]">Every order captured.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/85">
                NibaChat is an AI agent for Instagram and Facebook DMs. It answers price, delivery and stock questions in
                seconds, takes complete orders in chat, and hands the tricky ones to your team.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/signup" className="pill pill-solid">
                  Start free
                </Link>
                <a href="#demo" className="pill pill-glass">
                  See it in action
                </a>
              </div>
              <p className="mt-5 text-sm text-white/60">Free plan · no card required · connect in one login</p>
            </div>
          </div>

          {/* proof strip near bottom of hero */}
          <div className="relative z-10 border-t border-white/15">
            <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-5 py-7 md:grid-cols-4">
              {PROOF.map((p) => (
                <div key={p.v} className="text-white">
                  <div className="font-display text-2xl md:text-3xl">{p.k}</div>
                  <div className="mt-1 text-xs uppercase tracking-wider text-white/60">{p.v}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- PRODUCT / BENEFITS */}
        <section id="product" className="mx-auto max-w-6xl px-5 py-24 md:py-32">
          <div className="max-w-2xl reveal">
            <p className="eyebrow eyebrow-ember">What it does</p>
            <h2 className="font-display mt-4 text-3xl leading-tight text-[color:var(--ink-warm)] md:text-[2.75rem]">
              The calm inbox your shop has been missing.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[color:var(--muted)]">
              Repetitive questions — price, delivery, “is this in stock?” — answered the moment they arrive. You keep the
              conversations that matter; the agent quietly handles the rest.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {BENEFITS.map((b, i) => (
              <div key={b.title} className={`lp-card reveal p-7 md:p-8`} style={{ transitionDelay: `${i * 90}ms` }}>
                <span className="eyebrow eyebrow-ember">{b.tag}</span>
                <h3 className="font-display mt-4 text-xl text-[color:var(--ink-warm)]">{b.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--muted)]">{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- HOW IT WORKS */}
        <section id="how" className="border-y border-[color:var(--line)] bg-[color:var(--paper-2)]">
          <div className="mx-auto max-w-6xl px-5 py-24 md:py-32">
            <div className="max-w-2xl reveal">
              <p className="eyebrow eyebrow-ember">How it works</p>
              <h2 className="font-display mt-4 text-3xl leading-tight text-[color:var(--ink-warm)] md:text-[2.75rem]">
                Live in an afternoon. Yours forever after.
              </h2>
            </div>
            <div className="mt-14 grid gap-x-8 gap-y-12 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <div key={s.n} className="reveal" style={{ transitionDelay: `${i * 90}ms` }}>
                  <div className="font-display text-4xl text-[color:var(--ember-strong)]">{s.n}</div>
                  <div className="mt-4 h-px w-12 bg-[color:var(--ember)]/50" />
                  <h3 className="font-display mt-5 text-xl text-[color:var(--ink-warm)]">{s.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--muted)]">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- SEE IT IN ACTION (dark band) */}
        <section id="demo" className="bg-[color:var(--night)] text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 md:grid-cols-2 md:py-32">
            <div className="reveal">
              <p className="eyebrow text-white/45">See it in action</p>
              <h2 className="font-display mt-4 text-3xl leading-tight md:text-[2.75rem]">
                Talk to it. It answers like your best salesperson would.
              </h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-white/70">
                Short, warm, on-brand replies — in the customer&apos;s language. Try a few questions on the right. This demo
                uses canned answers; your live agent replies from your own catalog and rules.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="pill pill-solid">
                  Start free
                </Link>
                <a
                  href="mailto:demo@nibachat.agency?subject=Live%20demo%20request"
                  className="pill pill-glass"
                >
                  Book a live demo
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
            <p className="eyebrow eyebrow-ember">Pricing</p>
            <h2 className="font-display mt-4 text-3xl leading-tight text-[color:var(--ink-warm)] md:text-[2.75rem]">
              Start free. Pay as the inbox grows.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[color:var(--muted)]">
              No card to begin. Billing is manual for now — pick a plan and we&apos;ll set you up.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PLAN_DEFS.map((p, i) => (
              <div
                key={p.id}
                className={`reveal relative flex flex-col rounded-[1.5rem] p-7 ${
                  p.highlight
                    ? "bg-[color:var(--night)] text-white shadow-[0_30px_70px_-40px_rgba(13,26,38,0.7)]"
                    : "lp-card"
                }`}
                style={{ transitionDelay: `${(i % 3) * 80}ms` }}
              >
                {p.highlight && (
                  <span className="absolute right-6 top-7 rounded-full bg-[color:var(--ember-strong)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
                    Popular
                  </span>
                )}
                <h3 className={`font-display text-xl ${p.highlight ? "text-white" : "text-[color:var(--ink-warm)]"}`}>{p.name}</h3>
                <div className={`mt-3 font-display text-4xl ${p.highlight ? "text-white" : "text-[color:var(--ink-warm)]"}`}>
                  {p.priceEur === null ? "Let's talk" : p.priceEur === 0 ? "€0" : `€${p.priceEur}`}
                  {p.priceEur !== null && p.priceEur > 0 && (
                    <span className={`text-sm font-normal ${p.highlight ? "text-white/60" : "text-[color:var(--muted-2)]"}`}> /month</span>
                  )}
                </div>
                <ul className={`mt-5 flex-1 space-y-2 text-sm ${p.highlight ? "text-white/75" : "text-[color:var(--muted)]"}`}>
                  <li>{p.messagesPerMonth === Infinity ? "Unlimited" : p.messagesPerMonth.toLocaleString()} messages / month</li>
                  <li>{p.aiRepliesPerMonth === Infinity ? "Unlimited" : p.aiRepliesPerMonth.toLocaleString()} AI replies / month</li>
                  <li>
                    {p.channels === Infinity ? "Unlimited" : p.channels} channel{p.channels === 1 ? "" : "s"} ·{" "}
                    {p.knowledgeSources === Infinity ? "unlimited" : p.knowledgeSources} knowledge entries
                  </li>
                  <li>{p.handoff ? "Human handoff" : "No handoff"} · {p.sheetOrders ? "Google Sheet orders" : "Dashboard orders"}</li>
                  <li>{p.notifications ? "Telegram / WhatsApp alerts" : "Email alerts"} · {p.analytics} analytics</li>
                  <li>{p.support}</li>
                </ul>
                <Link
                  href={p.priceEur === null ? "mailto:sales@nibachat.agency?subject=Enterprise" : "/signup"}
                  className={`pill mt-7 w-full ${p.highlight ? "pill-solid" : "pill-ghost"}`}
                >
                  {p.priceEur === 0 ? "Start free" : p.priceEur === null ? "Contact us" : "Choose plan"}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- FAQ */}
        <section className="border-t border-[color:var(--line)] bg-[color:var(--paper-2)]">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 md:grid-cols-[0.8fr_1.2fr] md:py-32">
            <div className="reveal">
              <p className="eyebrow eyebrow-ember">Questions</p>
              <h2 className="font-display mt-4 text-3xl leading-tight text-[color:var(--ink-warm)] md:text-4xl">
                Everything you&apos;re wondering, before you sign up.
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

        {/* ---------------------------------------------------------------- JOURNAL (slim) */}
        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="flex items-end justify-between reveal">
            <h2 className="font-display text-2xl text-[color:var(--ink-warm)] md:text-3xl">From the journal</h2>
            <Link href="/blog" className="text-sm text-[color:var(--ember-strong)] hover:underline">
              All articles →
            </Link>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {BLOG_POSTS.slice(0, 3).map((p, i) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="reveal group" style={{ transitionDelay: `${i * 80}ms` }}>
                <article className="lp-card h-full p-6 transition group-hover:-translate-y-1">
                  <div className="text-xs uppercase tracking-wider text-[color:var(--muted-2)]">{p.date}</div>
                  <h3 className="font-display mt-2 text-lg leading-snug text-[color:var(--ink-warm)]">{p.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[color:var(--muted)]">{p.description}</p>
                </article>
              </Link>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- FINAL CTA (image band) */}
        <section className="relative isolate overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="absolute inset-0 -z-20 h-full w-full object-cover"
            src="/hero/cta-dawn-960.webp"
            srcSet="/hero/cta-dawn-960.webp 960w, /hero/cta-dawn.webp 1920w"
            sizes="100vw"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(9,17,26,0.55),rgba(9,17,26,0.35))]" />
          <div className="mx-auto max-w-3xl px-5 py-28 text-center md:py-36">
            <h2 className="font-display text-3xl leading-tight text-white md:text-5xl reveal">
              See it answer your own customers.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/80 reveal">
              Book a 20-minute demo — we connect a test page, train the agent on your products, and you watch it work. Or just
              start free and see for yourself.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3 reveal">
              <Link href="/signup" className="pill pill-solid">
                Start free
              </Link>
              <a href="mailto:demo@nibachat.agency?subject=Live%20demo%20request" className="pill pill-glass">
                Book a live demo
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ---------------------------------------------------------------- FOOTER */}
      <footer className="bg-[color:var(--night)] text-white/70">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <NibaLogo markColor="#dd8a57" plain />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/55">
              AI agents for Instagram DM and Facebook Messenger. Built for social-commerce shops across the region.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              { href: "#product", label: "Features" },
              { href: "#pricing", label: "Pricing" },
              { href: "/blog", label: "Journal" }
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              { href: "/legal/privacy", label: "Privacy" },
              { href: "/legal/terms", label: "Terms" },
              { href: "/legal/cookies", label: "Cookies" },
              { href: "/legal/data-deletion", label: "Data deletion" },
              { href: "/legal/gdpr", label: "GDPR" }
            ]}
          />
          <div>
            <div className="text-sm font-semibold text-white">Languages</div>
            <p className="mt-3 text-sm text-white/55">English · Srpski · Bosanski · Hrvatski</p>
            <div className="mt-6 flex gap-2">
              <Link href="/login" className="pill pill-glass !px-4 !py-2 !text-sm">
                Log in
              </Link>
              <Link href="/signup" className="pill pill-solid !px-4 !py-2 !text-sm">
                Start free
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-5 text-xs text-white/40">© 2026 NibaChat Agent. All rights reserved.</div>
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
