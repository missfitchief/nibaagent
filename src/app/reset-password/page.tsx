import type { Metadata } from "next";
import Link from "next/link";
import { NibaLogo } from "@/components/logo";
import { inspectPasswordResetToken } from "@/lib/password-reset";
import { ResetPasswordForm } from "./form";

export const metadata: Metadata = { title: "Nova lozinka", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const info = token ? await inspectPasswordResetToken(token) : { valid: false, error: "Nedostaje token za resetovanje." };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="niba-ambient" />
      <div className="glass glass-strong w-full max-w-md p-8">
        <NibaLogo />
        {!info.valid ? (
          <div className="mt-6">
            <h1 className="text-xl font-semibold">Link nije važeći</h1>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{info.error}</p>
            <Link href="/forgot-password" className="btn-primary mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-medium">
              Zatraži novi link
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold">Postavite novu lozinku</h1>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Izaberite novu lozinku za svoj nalog (najmanje 8 karaktera).</p>
            <ResetPasswordForm token={token} />
          </>
        )}
      </div>
    </main>
  );
}
