import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { NibaLogo } from "@/components/logo";

/** Legal templates — replace {COMPANY}/{EMAIL} details before real launch. */
const DOCS: Record<string, { title: string; sections: Array<[string, string]> }> = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      ["Who we are", "NibaChat Agent (“we”) provides AI-assisted messaging for businesses on Facebook Messenger and Instagram Direct. Contact: privacy@nibachat.agency."],
      ["Data we process", "Business account data (email, name), connected Page/Instagram identifiers, encrypted access tokens, customer conversation content needed to generate replies, collected order details (name, address, phone), and usage analytics."],
      ["Why we process it", "To deliver the service a business configures: answering its customers, collecting orders it requested, notifying its team, and showing it analytics. We do not sell personal data or use it for advertising."],
      ["Storage & security", "Data is stored in our database hosting (Neon Postgres, EU/US regions). Access tokens are encrypted at rest (AES-256-GCM). Access is limited to the business that owns the data and platform administrators bound by confidentiality."],
      ["Retention & deletion", "Conversation and order data is retained while the business account is active. Businesses can request export or deletion at any time — see Data Deletion Instructions. Customer end-users can request deletion through the business or directly via our data deletion page."],
      ["Meta platform data", "Data received via Meta's platform is handled according to Meta's Platform Terms and Developer Policies, used only to provide the messaging service, and deleted on request."]
    ]
  },
  terms: {
    title: "Terms of Service",
    sections: [
      ["The service", "NibaChat Agent automates replies to a business's own social-media messages, collects orders and provides analytics. The business remains responsible for the content of its automated replies and its own commercial obligations."],
      ["Accounts", "One owner account per business. You are responsible for keeping credentials confidential and for everything done under your account."],
      ["Acceptable use", "No spam, harassment, deception about human/AI identity where disclosure is legally required, or violation of Meta's platform policies. We may suspend accounts that endanger the shared platform (e.g., cause Meta policy strikes)."],
      ["AI disclaimer", "AI replies are generated from the knowledge you provide. We design the system to say “we will check” rather than guess, but you accept that automated replies may contain errors and you can enable draft mode to review them."],
      ["Billing", "Paid plans are billed manually per the published price list until online billing launches. No refunds for partial months; you can downgrade any time."],
      ["Liability", "Service is provided “as is”. To the maximum extent permitted by law, our liability is limited to the fees paid in the last 3 months."]
    ]
  },
  cookies: {
    title: "Cookie Policy",
    sections: [
      ["What we use", "One strictly necessary session cookie (niba_session) to keep you logged in, and a language preference cookie. No advertising or cross-site tracking cookies."],
      ["Analytics", "If we add analytics they will be privacy-preserving and aggregate-only; this policy will be updated first."],
      ["Managing cookies", "You can clear cookies in your browser at any time; you will simply be logged out."]
    ]
  },
  "data-deletion": {
    title: "Data Deletion Instructions",
    sections: [
      ["For businesses", "Email privacy@nibachat.agency from the account owner address with subject “Delete my data”. We delete the business, its connections, tokens, conversations, orders and analytics within 30 days and confirm in writing."],
      ["For customers of a business", "If you messaged a business that uses NibaChat Agent, you can ask that business to delete your conversation, or email privacy@nibachat.agency with the page name and approximate date — we will locate and delete your messages and any order details."],
      ["Facebook data deletion callback", "Requests initiated from Facebook's “Apps and Websites” settings are received automatically at /api/meta/data-deletion and processed the same way; you receive a confirmation code to track the request."]
    ]
  },
  gdpr: {
    title: "GDPR Notice",
    sections: [
      ["Roles", "For business account data we are the controller. For customer conversation data processed on behalf of a business, the business is the controller and NibaChat Agent is the processor."],
      ["Legal bases", "Contract performance (providing the service), legitimate interest (security, abuse prevention), and consent where required."],
      ["Your rights", "Access, rectification, erasure, restriction, portability, and objection. Contact privacy@nibachat.agency; we respond within 30 days."],
      ["Transfers", "Where data leaves the EEA, standard contractual clauses or equivalent safeguards apply."],
      ["Complaints", "You may lodge a complaint with your local supervisory authority."]
    ]
  }
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = DOCS[slug];
  return doc ? { title: doc.title } : {};
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = DOCS[slug];
  if (!doc) notFound();
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="niba-ambient" />
      <Link href="/" className="inline-block">
        <NibaLogo />
      </Link>
      <article className="glass glass-strong mt-6 p-8">
        <h1 className="text-3xl font-semibold">{doc.title}</h1>
        <p className="mt-1 text-xs text-[var(--ink-soft)]">Last updated: July 2026 · Template — review with your lawyer before launch.</p>
        <div className="mt-5 space-y-5">
          {doc.sections.map(([h, body]) => (
            <section key={h}>
              <h2 className="font-semibold">{h}</h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">{body}</p>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
