import type { Metadata } from "next";
import { NibaLogo } from "@/components/logo";
import { inspectInvite } from "@/lib/actions/invites";
import { AcceptInviteForm } from "./form";

export const metadata: Metadata = { title: "Accept invite", robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await inspectInvite(token);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="niba-ambient" />
      <div className="glass glass-strong w-full max-w-md p-8">
        <NibaLogo />
        {!info.valid ? (
          <div className="mt-6">
            <h1 className="text-xl font-semibold">Invite unavailable</h1>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{info.reason}</p>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold">Join {info.businessName}</h1>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              You were invited as <strong>{info.role}</strong> ({info.email}). Set a password to accept.
            </p>
            <AcceptInviteForm token={token} />
          </>
        )}
      </div>
    </main>
  );
}
