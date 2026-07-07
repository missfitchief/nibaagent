import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { adminLoginAction } from "@/lib/actions/auth";

/** Hidden route — never linked from public UI. */
export const metadata: Metadata = { title: "Restricted", robots: { index: false, follow: false } };

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="niba-ambient" />
      <AuthForm action={adminLoginAction} title="Restricted area" subtitle="Authorized personnel only." submitLabel="Continue" />
    </main>
  );
}
