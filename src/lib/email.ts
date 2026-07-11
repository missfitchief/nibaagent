import "server-only";
import { resolvePlatform } from "./platform";

/**
 * Transactional email for account verification. Three modes (Admin → App
 * Settings → EMAIL_MODE):
 *   - dev   → does NOT send; returns the link so it can be logged. Clearly not
 *             production email (never fakes a "sent" success).
 *   - resend→ Resend HTTP API (no extra dependency).
 *   - smtp  → requires nodemailer (not bundled) → returns not-sent + a clear note;
 *             the link is still logged so the operator can complete verification.
 */
export interface EmailResult {
  sent: boolean;
  mode: string;
  note: string;
}

export async function sendVerificationEmail(to: string, name: string, verifyUrl: string): Promise<EmailResult> {
  const mode = (await resolvePlatform("EMAIL_MODE")).value || "dev";
  const from = (await resolvePlatform("EMAIL_FROM")).value || "NibaChat Agent <noreply@nibachat.app>";
  const subject = "Potvrdite email adresu — NibaChat Agent";
  const html = `<p>Zdravo ${name || ""},</p>
<p>Hvala na registraciji. Potvrdite svoju email adresu klikom na link ispod:</p>
<p><a href="${verifyUrl}">${verifyUrl}</a></p>
<p>Link ističe za 24 sata. Ako niste vi kreirali nalog, ignorišite ovu poruku.</p>`;

  if (mode === "resend") {
    const key = (await resolvePlatform("RESEND_API_KEY")).value;
    if (!key) return { sent: false, mode, note: "RESEND_API_KEY nije podešen u App Settings — email nije poslat." };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject, html })
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { sent: false, mode, note: `Resend greška: ${t.slice(0, 140)}` };
    }
    return { sent: true, mode, note: "Verifikacioni email poslat preko Resend." };
  }

  if (mode === "smtp") {
    return { sent: false, mode, note: "SMTP nije podržan u ovom runtime-u (potreban nodemailer). Podržani su dev i resend. Link je u logovima." };
  }

  // dev — never pretend it was sent.
  return { sent: false, mode: "dev", note: `DEV režim: email NIJE poslat. Verifikacioni link: ${verifyUrl}` };
}
