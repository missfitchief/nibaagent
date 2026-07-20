-- Drop the plaintext Meta token mirrors. Tokens live ONLY in
-- encrypted_page_access_token / encrypted_instagram_access_token (AES-256-GCM
-- at rest, decrypted at runtime). Idempotent: safe to re-run.
ALTER TABLE "meta_connections" DROP COLUMN IF EXISTS "page_access_token";--> statement-breakpoint
ALTER TABLE "meta_connections" DROP COLUMN IF EXISTS "instagram_access_token";
