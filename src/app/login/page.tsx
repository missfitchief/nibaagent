import Link from "next/link";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { loginAction } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Log in — NibaChat Agent" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="niba-ambient" />
      <AuthForm
        action={loginAction}
        title="Welcome back"
        subtitle="Log in to your NibaChat Agent dashboard."
        submitLabel="Log in"
        footer={
          <>
            New here?{" "}
            <Link href="/signup" className="text-sky-600 hover:underline">
              Start free
            </Link>
          </>
        }
      />
    </main>
  );
}
