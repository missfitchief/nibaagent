import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BLOG_POSTS, getPost } from "@/lib/blog";
import { NibaLogo } from "@/components/logo";

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    openGraph: { title: post.title, description: post.description, type: "article", publishedTime: post.date }
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: "NibaChat Agent" }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="niba-ambient" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/" className="inline-block">
        <NibaLogo />
      </Link>
      <article className="glass glass-strong mt-6 p-8">
        <div className="text-xs text-[var(--ink-soft)]">{post.date}</div>
        <h1 className="mt-2 text-3xl font-semibold leading-tight">{post.title}</h1>
        <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-[var(--ink)]">
          {post.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        <div className="mt-8 border-t border-[var(--card-border)] pt-5">
          <Link href="/signup" className="btn-primary inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold">
            Try NibaChat Agent free →
          </Link>
        </div>
      </article>
      <p className="mt-4 text-sm">
        <Link href="/blog" className="text-sky-600 hover:underline">
          ← All articles
        </Link>
      </p>
    </main>
  );
}
