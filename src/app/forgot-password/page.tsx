import type { Metadata } from "next";
import Link from "next/link";
import { NibaLogo } from "@/components/logo";
import { ForgotPasswordForm } from "./form";

export const metadata: Metadata = { title: "Zaboravljena lozinka", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="niba-ambient" />
      <div className="glass glass-strong w-full max-w-md p-8">
        <NibaLogo />
        <h1 className="mt-6 text-xl font-semibold">Zaboravljena lozinka</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Unesite email adresu naloga — poslaćemo vam link za postavljanje nove lozinke.
        </p>
        <ForgotPasswordForm />
        <p className="mt-4 text-center text-sm text-[var(--ink-soft)]">
          Setili ste se lozinke?{" "}
          <Link href="/login" className="text-sky-600 hover:underline">
            Prijava
          </Link>
        </p>
      </div>
    </main>
  );
}
