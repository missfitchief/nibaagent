import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocalizedPost, allBlogParams } from "@/lib/blog";
import { NibaLogo } from "@/components/logo";
import { getDict, HREFLANG, LOCALES, isLocale } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/landing/language-switcher";

const BASE = process.env.APP_URL || "https://nibaagent.vercel.app";

export function generateStaticParams() {
  return allBlogParams();
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) return {};
  const post = getLocalizedPost(raw, slug);
  if (!post) return {};
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[HREFLANG[l]] = `${BASE}/${l}/blog/${slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `${BASE}/${raw}/blog/${slug}`, languages },
    openGraph: { title: post.title, description: post.description, type: "article", publishedTime: post.date, locale: HREFLANG[raw].replace("-", "_") }
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const post = getLocalizedPost(locale, slug);
  if (!post) notFound();
  const t = getDict(locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        inLanguage: HREFLANG[locale],
        author: { "@type": "Organization", name: "NibaChat Agent" },
        publisher: { "@type": "Organization", name: "NibaChat Agent" },
        mainEntityOfPage: `${BASE}/${locale}/blog/${slug}`
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NibaChat", item: `${BASE}/${locale}` },
          { "@type": "ListItem", position: 2, name: t.blog.title, item: `${BASE}/${locale}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: `${BASE}/${locale}/blog/${slug}` }
        ]
      }
    ]
  };

  return (
    <div className="lp min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="mx-auto flex max-w-2xl items-center justify-between px-5 py-6">
        <Link href={`/${locale}`} aria-label="NibaChat Agent — početna">
          <NibaLogo markColor="#b8511f" plain />
        </Link>
        <div className="flex items-center gap-3">
          <LanguageSwitcher current={locale} segment={`/blog/${slug}`} />
          <Link href={`/${locale}/blog`} className="text-sm text-[color:var(--ember-strong)] hover:underline">
            ← {t.blog.all}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-24">
        <article>
          <div className="text-xs uppercase tracking-wider text-[color:var(--muted-2)]">{post.date}</div>
          <h1 className="font-display mt-3 text-3xl leading-tight text-[color:var(--ink-warm)] md:text-[2.6rem]">{post.title}</h1>
          <div className="mt-7 space-y-5 text-[17px] leading-relaxed text-[color:var(--muted)]">
            {post.body.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </article>

        <div className="mt-10 rounded-2xl border border-[color:var(--line)] bg-[color:var(--paper-2)] p-6 text-center">
          <p className="font-display text-lg text-[color:var(--ink-warm)]">{t.finalCta.h2}</p>
          <div className="mt-4 flex justify-center gap-3">
            <Link href="/signup" className="pill pill-solid">
              {t.nav.start}
            </Link>
            <Link href={`/${locale}#pricing`} className="pill pill-ghost">
              {t.nav.pricing}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
