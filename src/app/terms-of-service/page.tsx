import type { Metadata } from "next";
import { LegalArticle } from "@/components/legal/legal-article";
import { TERMS } from "@/lib/legal";

const BASE = process.env.APP_URL || "https://nibaagent.vercel.app";

export const metadata: Metadata = {
  title: TERMS.metaTitle,
  description: TERMS.description,
  alternates: { canonical: `${BASE}/terms-of-service` },
  openGraph: { title: TERMS.metaTitle, description: TERMS.description, url: `${BASE}/terms-of-service`, type: "article" }
};

export default function TermsOfServicePage() {
  return <LegalArticle doc={TERMS} />;
}
