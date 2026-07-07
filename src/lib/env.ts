import { z } from "zod";

/**
 * All configuration comes from environment variables — never hardcode secrets.
 * `DATABASE_URL` empty => embedded PGlite under ./.data (local dev only), so the
 * app boots with zero external services; production always sets a Neon URL.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().default(""),

  META_APP_ID: z.string().default(""),
  META_APP_SECRET: z.string().default(""),
  META_REDIRECT_URI: z.string().default(""), // defaults to `${APP_URL}/api/meta/callback` when empty
  META_VERIFY_TOKEN: z.string().default(""),

  N8N_WEBHOOK_URL: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),

  /** 32-byte key (base64 or hex) for AES-256-GCM token encryption at rest. */
  ENCRYPTION_KEY: z.string().default(""),
  /** Secret for signing session JWTs. Falls back to ENCRYPTION_KEY. */
  AUTH_SECRET: z.string().default(""),

  TELEGRAM_BOT_TOKEN: z.string().default(""),
  WHATSAPP_PROVIDER_API_KEY: z.string().default(""),

  ADMIN_EMAIL: z.string().default(""),
  ADMIN_PASSWORD_HASH: z.string().default(""),
  /** Hidden admin login route segment, e.g. "admin-login". */
  ADMIN_LOGIN_PATH: z.string().default("admin-login")
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  cached = EnvSchema.parse(process.env);
  if (cached.NODE_ENV === "production") {
    const missing: string[] = [];
    if (!cached.DATABASE_URL) missing.push("DATABASE_URL");
    if (!cached.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
    if (missing.length) throw new Error(`Missing required env vars in production: ${missing.join(", ")}`);
  }
  return cached;
}

export function metaRedirectUri(): string {
  const e = env();
  return e.META_REDIRECT_URI || `${e.APP_URL.replace(/\/$/, "")}/api/meta/callback`;
}
