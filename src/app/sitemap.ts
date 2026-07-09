import type { MetadataRoute } from "next";
import { postsFor } from "@/lib/blog";
import { LOCALES } from "@/lib/i18n";

const BASE = process.env.APP_URL || "https://nibaagent.vercel.app";
const altLanding = Object.fromEntries(LOCALES.map((l) => [l, `${BASE}/${l}`]));
const altBlog = Object.fromEntries(LOCALES.map((l) => [l, `${BASE}/${l}/blog`]));

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  // localized landing + blog index (with hreflang alternates)
  for (const l of LOCALES) {
    entries.push({ url: `${BASE}/${l}`, changeFrequency: "weekly", priority: l === "sr" ? 1 : 0.9, alternates: { languages: altLanding } });
    entries.push({ url: `${BASE}/${l}/blog`, changeFrequency: "weekly", priority: 0.8, alternates: { languages: altBlog } });
  }

  // localized articles
  for (const l of LOCALES) {
    for (const p of postsFor(l)) {
      const alt = Object.fromEntries(LOCALES.map((x) => [x, `${BASE}/${x}/blog/${p.slug}`]));
      entries.push({ url: `${BASE}/${l}/blog/${p.slug}`, lastModified: p.date, priority: 0.7, alternates: { languages: alt } });
    }
  }

  entries.push({ url: `${BASE}/signup`, priority: 0.9 });
  entries.push({ url: `${BASE}/login`, priority: 0.5 });
  for (const s of ["privacy", "terms", "cookies", "data-deletion", "gdpr"]) entries.push({ url: `${BASE}/legal/${s}`, priority: 0.3 });

  return entries;
}
