import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/blog";

const BASE = process.env.APP_URL || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/signup`, priority: 0.9 },
    { url: `${BASE}/login`, priority: 0.5 },
    { url: `${BASE}/blog`, changeFrequency: "weekly", priority: 0.8 },
    ...BLOG_POSTS.map((p) => ({ url: `${BASE}/blog/${p.slug}`, lastModified: p.date, priority: 0.7 })),
    ...["privacy", "terms", "cookies", "data-deletion", "gdpr"].map((s) => ({ url: `${BASE}/legal/${s}`, priority: 0.3 }))
  ];
}
