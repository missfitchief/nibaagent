import Link from "next/link";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { signupAction } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Start free — NibaChat Agent" };

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="niba-ambient" />
      <AuthForm
        action={signupAction}
        title="Create your account"
        subtitle="Free plan included — connect Facebook & Instagram in minutes."
        submitLabel="Create account"
        withName
        footer={
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-sky-600 hover:underline">
              Log in
            </Link>
          </>
        }
      />
    </main>
  );
}
