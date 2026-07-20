import "server-only";
import { resolvePlatform } from "./platform";

/**
 * Transactional email (account verification, password reset, owner
 * notifications). Three modes (Admin → App Settings → EMAIL_MODE):
 *   - dev   → does NOT send; returns the link/note so it can be logged. Clearly not
 *             production email (never fakes a "sent" success).
 *   - resend→ Resend HTTP API (no extra dependency).
 *   - smtp  → requires nodemailer (not bundled) → returns not-sent + a clear note;
 *             the link is still logged so the operator can complete the flow.
 */
export interface EmailResult {
  sent: boolean;
  mode: string;
  note: string;
}

/** Shared sender — resolves mode/from and dispatches. Never throws. */
async function send(to: string, subject: string, html: string, devNote: string): Promise<EmailResult> {
  const mode = (await resolvePlatform("EMAIL_MODE")).value || "dev";
  const from = (await resolvePlatform("EMAIL_FROM")).value || "NibaChat Agent <noreply@nibachat.app>";

  if (mode === "resend") {
    const key = (await resolvePlatform("RESEND_API_KEY")).value;
    if (!key) return { sent: false, mode, note: "RESEND_API_KEY nije podešen u App Settings — email nije poslat." };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ from, to, subject, html })
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { sent: false, mode, note: `Resend greška: ${t.slice(0, 140)}` };
      }
      return { sent: true, mode, note: "Email poslat preko Resend." };
    } catch (err) {
      return { sent: false, mode, note: `Resend greška: ${(err as Error).message.slice(0, 140)}` };
    }
  }

  if (mode === "smtp") {
    return { sent: false, mode, note: "SMTP nije podržan u ovom runtime-u (potreban nodemailer). Podržani su dev i resend. Link je u logovima." };
  }

  // dev — never pretend it was sent.
  return { sent: false, mode: "dev", note: `DEV režim: email NIJE poslat. ${devNote}` };
}

export async function sendVerificationEmail(to: string, name: string, verifyUrl: string): Promise<EmailResult> {
  const subject = "Potvrdite email adresu — NibaChat Agent";
  const html = `<p>Zdravo ${name || ""},</p>
<p>Hvala na registraciji. Potvrdite svoju email adresu klikom na link ispod:</p>
<p><a href="${verifyUrl}">${verifyUrl}</a></p>
<p>Link ističe za 24 sata. Ako niste vi kreirali nalog, ignorišite ovu poruku.</p>`;
  const r = await send(to, subject, html, `Verifikacioni link: ${verifyUrl}`);
  return r.sent ? { ...r, note: "Verifikacioni email poslat preko Resend." } : r;
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<EmailResult> {
  const subject = "Resetovanje lozinke — NibaChat Agent";
  const html = `<p>Zdravo ${name || ""},</p>
<p>Primili smo zahtev za resetovanje lozinke. Postavite novu lozinku klikom na link ispod:</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>
<p>Link ističe za 1 sat i može se iskoristiti samo jednom. Ako niste vi zatražili resetovanje, ignorišite ovu poruku — vaša lozinka ostaje nepromenjena.</p>`;
  const r = await send(to, subject, html, `Reset link: ${resetUrl}`);
  return r.sent ? { ...r, note: "Email za resetovanje lozinke poslat preko Resend." } : r;
}

/** Generic owner-facing notification (new order, handoff, …). Plain-text body wrapped in minimal HTML. */
export async function sendNotificationEmail(to: string, subject: string, text: string): Promise<EmailResult> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<p>${esc(text).replace(/\n/g, "<br>")}</p>`;
  const r = await send(to, subject, html, `Obaveštenje za ${to}: ${subject}`);
  return r.sent ? { ...r, note: "Obaveštenje poslato preko Resend." } : r;
}
