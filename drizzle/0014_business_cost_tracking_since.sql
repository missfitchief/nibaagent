-- Admin-settable "start counting AI cost from here" point per business (see
-- src/lib/db/schema.ts businesses.costTrackingSince). Null = since the
-- beginning; set when a business switches to its own API key (or any time
-- the historical estimate is known to be unreliable) so the displayed
-- figure is trustworthy going forward without rewriting past message rows.
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "cost_tracking_since" timestamp with time zone;
