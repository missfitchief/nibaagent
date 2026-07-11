/**
 * Tenant / n8n client-id resolution.
 *
 * The shared n8n workflow keys every lookup by a stable STRING client id
 * (e.g. "starlight"), stored in meta_connections.client_id and the n8n runtime
 * tables. Internally the app still keys by the business UUID (business_id). This
 * helper is the single place that maps a business → its n8n client id.
 */

/** URL/n8n-safe slug: lowercase, non-alphanumeric → single hyphen, trimmed. "StarLight" → "starlight". */
export function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The stable n8n client id for a business: its explicit `client_id` field if set,
 * else a slug of its name (e.g. "StarLight" → "starlight"). Never the UUID.
 */
export function clientIdFor(business: { clientId?: string | null; name?: string | null }): string {
  const explicit = (business.clientId ?? "").trim();
  if (explicit) return explicit;
  return slugify(business.name ?? "") || "tenant";
}
