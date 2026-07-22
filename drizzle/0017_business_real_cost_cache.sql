-- Short-TTL cache of the last OpenAI Costs API pull (see
-- src/lib/openai-costs.ts) so the Overview page doesn't re-hit OpenAI's
-- rate limit (30 req/min) on every load — each load needs 3 windows
-- (today/7d/30d), and an admin refreshing the page a few times in a row
-- was enough to exceed it.
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "real_cost_cache" jsonb;
