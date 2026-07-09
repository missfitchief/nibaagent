import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPost } from "@/lib/blog";
import { NibaLogo } from "@/components/logo";
import { getLocale } from "@/lib/locale";
import { getDict } from "@/lib/i18n";

const BASE = process.env.APP_URL || "https://nibaagent.vercel.app";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `${BASE}/blog/${post.slug}` },
    openGraph: { title: post.title, description: post.description, type: "article", publishedTime: post.date }
  };
}

export default async function BlogPostPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const post = getPost(slug);
  if (!post) notFound();
  const locale = await getLocale(sp.lang);
  const t = getDict(locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        inLanguage: post.lang === "sr" ? "sr-RS" : "en",
        author: { "@type": "Organization", name: "NibaChat Agent" },
        publisher: { "@type": "Organization", name: "NibaChat Agent" },
        mainEntityOfPage: `${BASE}/blog/${post.slug}`
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NibaChat", item: BASE },
          { "@type": "ListItem", position: 2, name: t.blog.title, item: `${BASE}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: `${BASE}/blog/${post.slug}` }
        ]
      }
    ]
  };

  return (
    <div className="lp min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="mx-auto flex max-w-2xl items-center justify-between px-5 py-6">
        <Link href={`/?lang=${locale}`} aria-label="NibaChat Agent — početna">
          <NibaLogo markColor="#b8511f" plain />
        </Link>
        <Link href={`/blog?lang=${locale}`} className="text-sm text-[color:var(--ember-strong)] hover:underline">
          ← {t.blog.all}
        </Link>
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
            <Link href={`/?lang=${locale}#pricing`} className="pill pill-ghost">
              {t.nav.pricing}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
