import Link from "next/link";
import type { Metadata } from "next";
import { postsFor } from "@/lib/blog";
import { NibaLogo } from "@/components/logo";
import { getLocale } from "@/lib/locale";
import { getDict, HREFLANG, LOCALES } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/landing/language-switcher";

const BASE = process.env.APP_URL || "https://nibaagent.vercel.app";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const sp = await searchParams;
  const locale = await getLocale(sp.lang);
  const t = getDict(locale);
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[HREFLANG[l]] = `${BASE}/blog?lang=${l}`;
  return {
    title: t.blog.title,
    description: t.blog.subtitle,
    alternates: { canonical: `${BASE}/blog?lang=${locale}`, languages }
  };
}

export default async function BlogIndex({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const locale = await getLocale(sp.lang);
  const t = getDict(locale);
  const posts = postsFor(locale);

  return (
    <div className="lp min-h-screen">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-6">
        <Link href="/" aria-label="NibaChat Agent — početna">
          <NibaLogo markColor="#b8511f" plain />
        </Link>
        <LanguageSwitcher current={locale} />
      </header>

      <main className="mx-auto max-w-4xl px-5 pb-24">
        <p className="eyebrow eyebrow-ember">{t.blog.title}</p>
        <h1 className="font-display mt-3 text-4xl leading-tight text-[color:var(--ink-warm)] md:text-5xl">{t.blog.title}</h1>
        <p className="mt-3 max-w-2xl text-lg text-[color:var(--muted)]">{t.blog.subtitle}</p>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}?lang=${locale}`} className="group">
              <article className="lp-card lp-lift h-full p-7">
                <div className="text-xs uppercase tracking-wider text-[color:var(--muted-2)]">{p.date}</div>
                <h2 className="font-display mt-2 text-xl leading-snug text-[color:var(--ink-warm)]">{p.title}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--muted)]">{p.description}</p>
                <span className="mt-4 inline-block text-sm font-medium text-[color:var(--ember-strong)]">{t.blog.readMore} →</span>
              </article>
            </Link>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link href={`/?lang=${locale}`} className="pill pill-ghost">
            ← {t.blog.back}
          </Link>
          <Link href="/signup" className="pill pill-solid">
            {t.nav.start}
          </Link>
        </div>
      </main>
    </div>
  );
}
