import type { Metadata } from "next";
import { LegalArticle } from "@/components/legal/legal-article";
import { DATA_DELETION } from "@/lib/legal";

const BASE = process.env.APP_URL || "https://nibaagent.vercel.app";

export const metadata: Metadata = {
  title: { absolute: DATA_DELETION.metaTitle },
  description: DATA_DELETION.description,
  alternates: { canonical: `${BASE}/user-data-deletion` },
  openGraph: { title: DATA_DELETION.metaTitle, description: DATA_DELETION.description, url: `${BASE}/user-data-deletion`, type: "article" }
};

export default function UserDataDeletionPage() {
  return <LegalArticle doc={DATA_DELETION} />;
}
