-- Additive + idempotent. Adds a stable n8n tenant/client id per business and
-- backfills it into meta_connections + the n8n runtime tables. No drops/renames.
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "client_id" text DEFAULT '' NOT NULL;--> statement-breakpoint

-- Default each business's client id to a slug of its name ("StarLight" -> "starlight").
UPDATE "businesses"
  SET "client_id" = trim(both '-' from lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')))
  WHERE "client_id" = '';--> statement-breakpoint

-- Backfill meta_connections.client_id (was the UUID or empty) from the business client id.
UPDATE "meta_connections" mc
  SET "client_id" = b."client_id"
  FROM "businesses" b
  WHERE mc."business_id" = b."id" AND (mc."client_id" = '' OR mc."client_id" = mc."business_id"::text);--> statement-breakpoint

-- Backfill the n8n runtime tables (business_id is TEXT there) the same way.
UPDATE "tenant_configs" t
  SET "client_id" = b."client_id"
  FROM "businesses" b
  WHERE t."business_id" = b."id"::text AND (t."client_id" = '' OR t."client_id" = t."business_id");--> statement-breakpoint
UPDATE "catalog_snapshots" c
  SET "client_id" = b."client_id"
  FROM "businesses" b
  WHERE c."business_id" = b."id"::text AND (c."client_id" = '' OR c."client_id" = c."business_id");--> statement-breakpoint
UPDATE "learning_memories" l
  SET "client_id" = b."client_id"
  FROM "businesses" b
  WHERE l."business_id" = b."id"::text AND (l."client_id" = '' OR l."client_id" = l."business_id");
