import Link from "next/link";
import { NibaLogo } from "@/components/logo";
import { DemoBot } from "@/components/demo-bot";
import { Badge, Card } from "@/components/ui";
import { PLAN_DEFS } from "@/lib/plans";
import { BLOG_POSTS } from "@/lib/blog";

const FEATURES = [
  { icon: "⚡", title: "Instant replies, 24/7", body: "Price, delivery, ordering — answered in seconds while your competitors sleep." },
  { icon: "🛒", title: "Order capture in chat", body: "Name, address, phone, city — collected politely and saved to your Google Sheet." },
  { icon: "🙋", title: "Human handoff", body: "Trigger words like “reklamacija” or “agent” silence the bot and alert your team." },
  { icon: "📚", title: "Train it on your business", body: "Products, prices, FAQs, your website — the agent answers from your data, never guesses." },
  { icon: "🌍", title: "Serbian, Bosnian, Croatian, English", body: "Built for Balkan social commerce — pouzeće, poštarina and polite Vi-forms included." },
  { icon: "📈", title: "Analytics & savings", body: "Messages, AI replies, orders, handoffs — plus an honest estimate of the time and money saved." }
];

const STEPS = [
  { n: "1", title: "Connect", body: "One Facebook login connects your Page and Instagram. Tokens stored encrypted — no technical setup." },
  { n: "2", title: "Train", body: "Add FAQs, product prices, delivery rules, or just your website URL. Takes ten minutes." },
  { n: "3", title: "Go live", body: "Start in draft mode, review the answers, flip to live when you trust it. Humans can take over anytime." }
];

const FAQ = [
  { q: "Do I need any technical knowledge?", a: "No. You log in with Facebook, click your page, and the agent is connected. No Meta developer console, no code, no terminal." },
  { q: "Will it invent prices or promises?", a: "No — the agent only answers from the knowledge you give it. When it is not sure, it says the team will check and hands the conversation to you." },
  { q: "What happens with angry customers or complaints?", a: "Trigger words (reklamacija, problem, agent, čovek…) immediately silence the bot, flag the conversation, and notify you on Telegram." },
  { q: "Can I try it before it talks to real customers?", a: "Yes — draft mode lets the agent suggest answers without sending, and the built-in test chat lets you interrogate it privately first." },
  { q: "Which languages does it speak?", a: "Serbian, Bosnian, Croatian and English out of the box. It answers in the language your customer writes." },
  { q: "How is it priced?", a: "There is a free plan for trying it out, and paid plans by message volume. Billing is manual for now — no card required to start." }
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <div className="niba-ambient" />

      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-[var(--card-border)] bg-white/70 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/">
            <NibaLogo />
          </Link>
          <div className="hidden items-center gap-5 text-sm md:flex">
            <a href="#features" className="hover:text-sky-600">Features</a>
            <a href="#how" className="hover:text-sky-600">How it works</a>
            <a href="#pricing" className="hover:text-sky-600">Pricing</a>
            <Link href="/blog" className="hover:text-sky-600">Blog</Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-medium hover:bg-sky-50">Login</Link>
            <Link href="/signup" className="btn-primary rounded-xl px-4 py-2 text-sm font-medium">Start free</Link>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <Badge tone="info">AI agent for Instagram DM & Facebook Messenger</Badge>
            <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-5xl">
              Reply instantly. <span className="grad-text">Capture orders.</span> Save time.
            </h1>
            <p className="mt-4 max-w-lg text-lg text-[var(--ink-soft)]">
              NibaChat Agent answers your customers in seconds — price, delivery, ordering — collects complete orders in chat,
              and hands the hard conversations to a human. Built for social-commerce businesses.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/signup" className="btn-primary rounded-xl px-6 py-3 text-sm font-semibold">Start free</Link>
              <a
                href="mailto:demo@nibachat.agency?subject=Live demo request"
                className="rounded-xl border border-[var(--card-border)] bg-white/70 px-6 py-3 text-sm font-semibold transition hover:bg-white"
              >
                Book live demo
              </a>
            </div>
            <p className="mt-4 text-xs text-[var(--ink-soft)]">Free plan included · no card required · connect in one login</p>
          </div>
          <div className="justify-self-center md:justify-self-end">
            <DemoBot />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-center text-3xl font-semibold">Everything a DM-first business needs</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="rise">
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-2 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">{f.body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-center text-3xl font-semibold">Connect once. Let the agent handle repetitive messages.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <Card key={s.n} className="rise text-center">
                <div className="btn-primary mx-auto flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold">{s.n}</div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">{s.body}</p>
              </Card>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-[var(--ink-soft)]">
            Orders land in your dashboard and your own Google Sheet. Handoffs ping your Telegram. Analytics show messages, AI
            replies, orders and the estimated money saved — honestly labeled as an estimate.
          </p>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-center text-3xl font-semibold">Pricing</h2>
          <p className="mt-2 text-center text-sm text-[var(--ink-soft)]">
            Start free. Upgrade when the inbox grows. Manual billing — contact us, no card forms.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {PLAN_DEFS.map((p) => (
              <Card key={p.id} className={`rise ${p.highlight ? "ring-2 ring-sky-300" : ""}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.highlight && <Badge tone="info">Popular</Badge>}
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {p.priceEur === null ? "Contact us" : p.priceEur === 0 ? "€0" : `€${p.priceEur}`}
                  {p.priceEur !== null && p.priceEur > 0 && <span className="text-sm font-normal text-[var(--ink-soft)]">/month</span>}
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-[var(--ink-soft)]">
                  <li>💬 {p.messagesPerMonth === Infinity ? "Unlimited" : p.messagesPerMonth.toLocaleString()} messages/mo</li>
                  <li>🤖 {p.aiRepliesPerMonth === Infinity ? "Unlimited" : p.aiRepliesPerMonth.toLocaleString()} AI replies/mo</li>
                  <li>
                    🔌 {p.channels === Infinity ? "Unlimited" : p.channels} channel{p.channels === 1 ? "" : "s"} · 📚{" "}
                    {p.knowledgeSources === Infinity ? "unlimited" : p.knowledgeSources} knowledge entries
                  </li>
                  <li>
                    {p.handoff ? "✅ Handoff" : "— Handoff"} · {p.sheetOrders ? "✅ Sheet orders" : "— Sheet orders"}
                  </li>
                  <li>{p.notifications ? "✅ Telegram/WhatsApp alerts" : "— Alerts"} · 📈 {p.analytics}</li>
                  <li>🛟 {p.support}</li>
                </ul>
                <Link
                  href={p.priceEur === null ? "mailto:sales@nibachat.agency?subject=Enterprise" : "/signup"}
                  className="btn-primary mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-medium"
                >
                  {p.priceEur === 0 ? "Start free" : p.priceEur === null ? "Contact us" : "Get started"}
                </Link>
              </Card>
            ))}
          </div>
        </section>

        {/* Blog preview */}
        <section className="mx-auto max-w-6xl px-4 py-14">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-semibold">From the blog</h2>
            <Link href="/blog" className="text-sm text-sky-600 hover:underline">
              All articles →
            </Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {BLOG_POSTS.slice(0, 3).map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`}>
                <Card className="rise h-full">
                  <div className="text-xs text-[var(--ink-soft)]">{p.date}</div>
                  <h3 className="mt-1 font-semibold">{p.title}</h3>
                  <p className="mt-1 line-clamp-3 text-sm text-[var(--ink-soft)]">{p.description}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-14">
          <h2 className="text-center text-3xl font-semibold">Frequently asked questions</h2>
          <div className="mt-6 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="glass group p-4">
                <summary className="cursor-pointer list-none font-medium">
                  {f.q}
                  <span className="float-right text-[var(--ink-soft)] transition group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Book demo CTA */}
        <section className="mx-auto max-w-4xl px-4 py-14">
          <Card className="glass-strong text-center">
            <h2 className="text-2xl font-semibold">See it answer your own customers’ questions</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--ink-soft)]">
              Book a 20-minute live demo — we connect a test page, train the agent on your products, and you watch it work.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <a href="mailto:demo@nibachat.agency?subject=Live demo request" className="btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
                Book live demo
              </a>
              <Link
                href="/signup"
                className="rounded-xl border border-[var(--card-border)] bg-white/70 px-6 py-3 text-sm font-semibold hover:bg-white"
              >
                Or start free now
              </Link>
            </div>
          </Card>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--card-border)] bg-white/60">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm md:grid-cols-4">
          <div>
            <NibaLogo size={24} />
            <p className="mt-2 text-xs text-[var(--ink-soft)]">
              AI agents for Instagram DM and Facebook Messenger. Built for social-commerce businesses.
            </p>
          </div>
          <div>
            <div className="font-semibold">Product</div>
            <ul className="mt-2 space-y-1 text-[var(--ink-soft)]">
              <li>
                <a href="#features" className="hover:text-sky-600">Features</a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-sky-600">Pricing</a>
              </li>
              <li>
                <Link href="/blog" className="hover:text-sky-600">Blog</Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="font-semibold">Legal</div>
            <ul className="mt-2 space-y-1 text-[var(--ink-soft)]">
              <li>
                <Link href="/legal/privacy" className="hover:text-sky-600">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/legal/terms" className="hover:text-sky-600">Terms of Service</Link>
              </li>
              <li>
                <Link href="/legal/cookies" className="hover:text-sky-600">Cookie Policy</Link>
              </li>
              <li>
                <Link href="/legal/data-deletion" className="hover:text-sky-600">Data Deletion</Link>
              </li>
              <li>
                <Link href="/legal/gdpr" className="hover:text-sky-600">GDPR</Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="font-semibold">Languages</div>
            <p className="mt-2 text-[var(--ink-soft)]">English · Srpski · Bosanski · Hrvatski</p>
            <p className="mt-3 text-xs text-[var(--ink-soft)]">© 2026 NibaChat Agent</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
