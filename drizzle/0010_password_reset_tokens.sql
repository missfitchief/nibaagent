-- Additive + idempotent. Password-reset tokens: raw token is emailed, only its
-- sha256 hash is stored; single-use; expires.
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id"),
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prt_token_hash_idx" ON "password_reset_tokens" ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prt_user_idx" ON "password_reset_tokens" ("user_id");
