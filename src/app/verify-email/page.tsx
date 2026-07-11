import Link from "next/link";
import { verifyEmailToken } from "@/lib/verification";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const result = token ? await verifyEmailToken(token) : { ok: false, error: "Nedostaje verifikacioni token." };

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-6">
      <Card className="text-center">
        {result.ok ? (
          <>
            <div className="text-4xl">✅</div>
            <h1 className="mt-3 text-2xl font-semibold">Email potvrđen</h1>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">Vaš nalog je aktiviran. Sada možete pristupiti kontrolnoj tabli.</p>
            <Link href="/app" className="btn-primary mt-5 inline-flex rounded-xl px-6 py-3 text-sm font-semibold">
              Otvori kontrolnu tablu
            </Link>
          </>
        ) : (
          <>
            <div className="text-4xl">⚠️</div>
            <h1 className="mt-3 text-2xl font-semibold">Verifikacija nije uspela</h1>
            <p className="mt-2 text-sm text-rose-600">{result.error}</p>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">Prijavite se i zatražite novi verifikacioni email.</p>
            <Link href="/app" className="mt-5 inline-flex rounded-xl border border-[var(--card-border)] px-6 py-3 text-sm font-medium hover:bg-slate-50">
              Nazad na prijavu
            </Link>
          </>
        )}
      </Card>
    </main>
  );
}
