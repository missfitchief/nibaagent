import Link from "next/link";
import { NibaLogo } from "@/components/logo";
import type { LegalDoc } from "@/lib/legal";

/** Turn bare URLs and emails inside prose into real links. */
function linkify(text: string): React.ReactNode[] {
  const parts = text.split(/(https?:\/\/[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} className="text-[color:var(--ember-strong)] underline">
          {part}
        </a>
      );
    }
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(part)) {
      return (
        <a key={i} href={`mailto:${part}`} className="text-[color:var(--ember-strong)] underline">
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const FOOTER_LINKS = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-of-service", label: "Terms of Service" },
  { href: "/user-data-deletion", label: "User Data Deletion" }
];

export function LegalArticle({ doc }: { doc: LegalDoc }) {
  return (
    <div className="lp min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6">
        <Link href="/" aria-label="NibaChat Agent — home">
          <NibaLogo markColor="#b8511f" plain />
        </Link>
        <Link href="/" className="text-sm text-[color:var(--ember-strong)] hover:underline">
          ← Home
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20">
        <h1 className="font-display text-4xl leading-tight text-[color:var(--ink-warm)] md:text-5xl">{doc.title}</h1>
        <p className="mt-3 text-sm text-[color:var(--muted-2)]">Last updated: {doc.updated}</p>

        <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-[color:var(--muted)]">
          {doc.body.map((block, i) => {
            if ("h" in block) {
              return (
                <h2 key={i} className="font-display pt-4 text-xl text-[color:var(--ink-warm)]">
                  {block.h}
                </h2>
              );
            }
            if ("ul" in block) {
              return (
                <ul key={i} className="ml-5 list-disc space-y-1">
                  {block.ul.map((li, j) => (
                    <li key={j}>{linkify(li)}</li>
                  ))}
                </ul>
              );
            }
            return <p key={i}>{linkify(block.p)}</p>;
          })}
        </div>
      </main>

      <footer className="border-t border-[color:var(--line)]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6 text-sm">
          {FOOTER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-[color:var(--muted)] hover:text-[color:var(--ink-warm)]">
              {l.label}
            </Link>
          ))}
          <span className="text-[color:var(--muted-2)]">© 2026 NibaChat Agent</span>
        </div>
      </footer>
    </div>
  );
}
