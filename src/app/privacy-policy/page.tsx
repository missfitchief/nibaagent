import type { Metadata } from "next";
import { LegalArticle } from "@/components/legal/legal-article";
import { PRIVACY } from "@/lib/legal";

const BASE = process.env.APP_URL || "https://nibaagent.vercel.app";

export const metadata: Metadata = {
  title: { absolute: PRIVACY.metaTitle },
  description: PRIVACY.description,
  alternates: { canonical: `${BASE}/privacy-policy` },
  openGraph: { title: PRIVACY.metaTitle, description: PRIVACY.description, url: `${BASE}/privacy-policy`, type: "article" }
};

export default function PrivacyPolicyPage() {
  return <LegalArticle doc={PRIVACY} />;
}
