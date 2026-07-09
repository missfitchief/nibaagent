import type { MetadataRoute } from "next";
import { BLOG_POSTS, BLOG_POSTS_SR } from "@/lib/blog";
import { LOCALES } from "@/lib/i18n";

const BASE = process.env.APP_URL || "https://nibaagent.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const landingLocales = LOCALES.map((l) => ({
    url: `${BASE}/?lang=${l}`,
    changeFrequency: "weekly" as const,
    priority: l === "sr" ? 1 : 0.9,
    alternates: { languages: Object.fromEntries(LOCALES.map((x) => [x, `${BASE}/?lang=${x}`])) }
  }));

  return [
    ...landingLocales,
    { url: `${BASE}/signup`, priority: 0.9 },
    { url: `${BASE}/login`, priority: 0.5 },
    { url: `${BASE}/blog`, changeFrequency: "weekly", priority: 0.8 },
    ...BLOG_POSTS_SR.map((p) => ({ url: `${BASE}/blog/${p.slug}`, lastModified: p.date, priority: 0.7 })),
    ...BLOG_POSTS.map((p) => ({ url: `${BASE}/blog/${p.slug}`, lastModified: p.date, priority: 0.6 })),
    ...["privacy", "terms", "cookies", "data-deletion", "gdpr"].map((s) => ({ url: `${BASE}/legal/${s}`, priority: 0.3 }))
  ];
}
