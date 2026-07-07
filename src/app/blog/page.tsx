import Link from "next/link";
import type { Metadata } from "next";
import { BLOG_POSTS } from "@/lib/blog";
import { Card } from "@/components/ui";
import { NibaLogo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Guides on AI chat automation for Instagram DM and Facebook Messenger: order collection, human handoff, reply speed and social commerce for Balkan businesses."
};

export default function BlogIndex() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="niba-ambient" />
      <Link href="/" className="inline-block">
        <NibaLogo />
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Blog</h1>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">AI agents, DM commerce, and answering customers faster.</p>
      <div className="mt-6 space-y-4">
        {BLOG_POSTS.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="block">
            <Card className="rise">
              <div className="text-xs text-[var(--ink-soft)]">{p.date}</div>
              <h2 className="mt-1 text-lg font-semibold">{p.title}</h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">{p.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
