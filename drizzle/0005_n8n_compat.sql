-- n8n runtime compatibility (additive + idempotent; no drops/renames/data loss).
-- 1) meta_connections gets the plaintext-token + business_name + plan columns the
--    shared n8n workflow reads, mirroring the encrypted columns already present.
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "page_access_token" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "instagram_access_token" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "business_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
-- Align existing rows with the n8n "active = connected" convention + fill name/plan.
UPDATE "meta_connections" SET "status" = 'active' WHERE "status" IN ('connected', 'partial');--> statement-breakpoint
UPDATE "meta_connections" mc SET "business_name" = b."name", "plan" = b."plan"
  FROM "businesses" b WHERE mc."business_id" = b."id" AND (mc."business_name" = '' OR mc."plan" = 'free');--> statement-breakpoint

-- 2) tenant_configs — one runtime-config row per tenant (business), read by n8n.
CREATE TABLE IF NOT EXISTS "tenant_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"business_id" text NOT NULL,
	"business_name" text DEFAULT '' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"ai_enabled" boolean DEFAULT false NOT NULL,
	"bot_mode" text DEFAULT 'draft' NOT NULL,
	"default_language" text DEFAULT 'sr' NOT NULL,
	"tone" text DEFAULT 'friendly' NOT NULL,
	"persiranje" boolean DEFAULT true NOT NULL,
	"ai_strategy" text DEFAULT 'rules_first' NOT NULL,
	"ai_provider" text DEFAULT 'openai' NOT NULL,
	"selected_model" text DEFAULT '' NOT NULL,
	"image_recognition_enabled" boolean DEFAULT false NOT NULL,
	"handoff_enabled" boolean DEFAULT true NOT NULL,
	"handoff_threshold" integer DEFAULT 40 NOT NULL,
	"unknown_behavior" text DEFAULT 'offer_handoff' NOT NULL,
	"business_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"telegram_connected" boolean DEFAULT false NOT NULL,
	"meta_connected" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_configs_business_idx" ON "tenant_configs" ("business_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_configs_client_idx" ON "tenant_configs" ("client_id");--> statement-breakpoint

-- 3) catalog_snapshots — one row per product, read by n8n for grounding.
CREATE TABLE IF NOT EXISTS "catalog_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"business_id" text NOT NULL,
	"product_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" numeric,
	"currency" text DEFAULT '' NOT NULL,
	"stock_status" text DEFAULT 'unknown' NOT NULL,
	"stock_quantity" integer,
	"sku" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sizes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_snapshots_product_idx" ON "catalog_snapshots" ("business_id", "product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_snapshots_business_idx" ON "catalog_snapshots" ("business_id");--> statement-breakpoint

-- 4) learning_memories — one row per knowledge chunk/source, read by n8n.
CREATE TABLE IF NOT EXISTS "learning_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"business_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_type" text DEFAULT 'knowledge' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learning_memories_source_idx" ON "learning_memories" ("business_id", "source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_memories_business_idx" ON "learning_memories" ("business_id");
