-- Additive + idempotent. No drops/renames/data loss.
-- 1) event_logs gains error-triage + finer event typing (per-business logs UI).
ALTER TABLE "event_logs" ADD COLUMN IF NOT EXISTS "event_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_logs" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_logs_level_idx" ON "event_logs" ("level");--> statement-breakpoint

-- 2) email verification: a nullable timestamp on users + a hashed-token table.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id"),
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "evt_token_hash_idx" ON "email_verification_tokens" ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evt_user_idx" ON "email_verification_tokens" ("user_id");
