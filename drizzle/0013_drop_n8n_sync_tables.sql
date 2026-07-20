-- Drop the n8n runtime-sync shadow tables. The n8n-sync layer (src/lib/n8n-sync.ts)
-- is removed; the app answers webhooks directly and these denormalized
-- projections are no longer written or read by anything. Idempotent.
DROP TABLE IF EXISTS "tenant_configs";--> statement-breakpoint
DROP TABLE IF EXISTS "catalog_snapshots";--> statement-breakpoint
DROP TABLE IF EXISTS "learning_memories";--> statement-breakpoint
DROP TABLE IF EXISTS "tenants";
