import crypto from "node:crypto";
import { env } from "./env";

/**
 * AES-256-GCM encryption for tokens at rest (page/Instagram access tokens).
 * Wire format: v1:<iv b64>:<ciphertext b64>:<authTag b64>. Never log outputs
 * of decrypt(); UI only ever sees masked status, never token material.
 */

function key(): Buffer {
  const raw = env().ENCRYPTION_KEY;
  if (!raw) {
    if (env().NODE_ENV === "production") throw new Error("ENCRYPTION_KEY is required in production");
    // Deterministic dev-only key so local restarts can still decrypt dev data.
    return crypto.createHash("sha256").update("nibachat-dev-only-key").digest();
  }
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) return crypto.createHash("sha256").update(raw).digest();
  return buf;
}

export function encryptToken(plain: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${enc.toString("base64")}:${cipher.getAuthTag().toString("base64")}`;
}

export function decryptToken(stored: string): string {
  if (!stored) return "";
  const [v, ivB64, dataB64, tagB64] = stored.split(":");
  if (v !== "v1" || !ivB64 || !dataB64 || !tagB64) throw new Error("bad token format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** "EAAB...xyz" -> "EAAB…xyz" style mask for admin UI. Never more than this. */
export function maskToken(stored: string): string {
  if (!stored) return "";
  try {
    const plain = decryptToken(stored);
    return plain.length <= 8 ? "••••" : `${plain.slice(0, 4)}…${plain.slice(-4)}`;
  } catch {
    return "•invalid•";
  }
}

export function uuid(): string {
  return crypto.randomUUID();
}
