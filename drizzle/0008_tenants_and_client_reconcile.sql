-- Additive + idempotent. Creates the tenants registry n8n reads, and reconciles
-- the StarLight tenant id from the auto-slug "starlight-nakit" to the stable
-- "starlight" across every table that stores it. No drops/renames.

-- 1) tenants registry (n8n looks tenants up by client_id).
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_business_idx" ON "tenants" ("business_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenants_client_idx" ON "tenants" ("client_id");--> statement-breakpoint

-- 2) One-time reconcile: starlight-nakit -> starlight (only that tenant is affected).
UPDATE "businesses" SET "client_id" = 'starlight', "updated_at" = now() WHERE "client_id" = 'starlight-nakit';--> statement-breakpoint
UPDATE "meta_connections" SET "client_id" = 'starlight', "updated_at" = now() WHERE "client_id" = 'starlight-nakit';--> statement-breakpoint
UPDATE "tenant_configs" SET "client_id" = 'starlight', "updated_at" = now() WHERE "client_id" = 'starlight-nakit';--> statement-breakpoint
UPDATE "catalog_snapshots" SET "client_id" = 'starlight', "updated_at" = now() WHERE "client_id" = 'starlight-nakit';--> statement-breakpoint
UPDATE "learning_memories" SET "client_id" = 'starlight', "updated_at" = now() WHERE "client_id" = 'starlight-nakit';--> statement-breakpoint

-- 3) Backfill the tenants registry from businesses (upsert by business_id).
INSERT INTO "tenants" ("business_id", "client_id", "name", "plan", "status", "created_at", "updated_at")
	SELECT "id", "client_id", "name", "plan", "status", "created_at", "updated_at" FROM "businesses"
	ON CONFLICT ("business_id") DO UPDATE SET
		"client_id" = EXCLUDED."client_id",
		"name" = EXCLUDED."name",
		"plan" = EXCLUDED."plan",
		"status" = EXCLUDED."status",
		"updated_at" = now();
