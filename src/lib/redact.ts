/**
 * PII redaction for old-chat ingestion. Pure + deterministic so it can be unit
 * tested. Applied BEFORE any storage or model call — raw private chats are
 * never persisted as prompt material. Order matters (emails before phones so an
 * email's digits aren't caught by the phone rule).
 */

export interface RedactionResult {
  text: string;
  counts: Record<string, number>;
}

const RULES: Array<{ label: string; re: RegExp; repl: string }> = [
  { label: "email", re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, repl: "[EMAIL]" },
  // order/tracking codes: 6+ digits, or alnum codes like RB123456789BA
  { label: "tracking", re: /\b[A-Z]{2}\d{6,}[A-Z]{0,2}\b/g, repl: "[TRACKING]" },
  { label: "order_no", re: /\b(?:order|porudzbina|porudžbina|narudžba|#)\s*[:#]?\s*\d{3,}\b/gi, repl: "[ORDER_NO]" },
  // phones: +387…, 06x…, grouped digits (>=7 digits total)
  { label: "phone", re: /(?:\+?\d[\d\s\-/().]{6,}\d)/g, repl: "[PHONE]" },
  // street + number ("Ulica Nešto 12", "Bulevar … 12a")
  { label: "address", re: /\b([A-ZŠĐČĆŽ][a-zšđčćž]+(?:\s+[A-ZŠĐČĆŽa-zšđčćž]+){0,3})\s+\d{1,4}[a-z]?\b(?=,|\s|$)/g, repl: "[ADDRESS]" }
];

/** Explicit name markers ("ime i prezime: Marko Marković", "zovem se …"). */
const NAME_MARKERS = /\b(ime i prezime|zovem se|ja sam|my name is|name:)\s*[:\-]?\s*([A-ZŠĐČĆŽ][\p{L}]+(?:\s+[A-ZŠĐČĆŽ][\p{L}]+)?)/giu;

export function redactPII(input: string): RedactionResult {
  const counts: Record<string, number> = {};
  let text = String(input ?? "");

  text = text.replace(NAME_MARKERS, (_m, marker) => {
    counts.name = (counts.name ?? 0) + 1;
    return `${marker}: [NAME]`;
  });

  for (const { label, re, repl } of RULES) {
    text = text.replace(re, () => {
      counts[label] = (counts[label] ?? 0) + 1;
      return repl;
    });
  }
  return { text, counts };
}

export interface FaqCandidate {
  question: string;
  answer: string;
}

/**
 * Heuristic FAQ extraction from a (already redacted) transcript: a line that is
 * a question followed by a non-question line becomes a candidate. Cheap, no AI.
 * Deduped by normalized question.
 */
export function extractFaqCandidates(redactedTranscript: string, max = 25): FaqCandidate[] {
  const lines = redactedTranscript
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(customer|business|agent|bot|kupac|prodavac)\s*[:\-]\s*/i, "").trim())
    .filter(Boolean);
  const out: FaqCandidate[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length - 1; i++) {
    const q = lines[i];
    const a = lines[i + 1];
    if (!q.includes("?") || a.includes("?")) continue;
    if (q.length < 6 || a.length < 2) continue;
    const key = q.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ question: q.slice(0, 200), answer: a.slice(0, 400) });
    if (out.length >= max) break;
  }
  return out;
}
