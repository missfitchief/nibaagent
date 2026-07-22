-- OpenAI API key id (e.g. "key_abc123", not the secret) per business, used to
-- pull real spend from OpenAI's Costs API (see src/lib/openai-costs.ts and
-- businesses.costTrackingSince in schema.ts). Safe to store in plaintext —
-- it's an identifier, not a credential.
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "openai_api_key_id" text NOT NULL DEFAULT '';
