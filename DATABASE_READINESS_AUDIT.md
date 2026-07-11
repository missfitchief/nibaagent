# Database Readiness Audit — NibaChat Agent (multi-business SaaS)

Source of truth: `src/lib/db/schema.ts` (Drizzle) + `drizzle/*.sql` (applied to Neon). Every tenant-owned table carries `business_id` and every query is scoped by it through `requireBusiness()` (the tenant-isolation chokepoint). The external n8n workflow reads three flat tables (`tenant_configs`, `catalog_snapshots`, `learning_memories`) + `meta_connections` + `processed_messages`.

Legend — Risk: 🟢 low / 🟡 medium / 🔴 high. "Scoped" = rows carry `business_id`. "n8n" = read by the n8n runtime. "UI writes" / "bot reads" as noted.

| # | Area | Table(s) | Scoped | n8n | UI writes | Bot reads | Missing / gaps | Risk |
|---|---|---|---|---|---|---|---|---|
| 1 | Users/auth | `users` (+ custom JWT session) | n/a | no | yes | no | — | 🟢 |
| 2 | Email verification | `users.email_verified_at`, `email_verification_tokens` | n/a | no | yes | no | **Added this pass** (migration 0006). SMTP send needs nodemailer (dev+resend supported). | 🟢 |
| 3 | Businesses/tenants | `businesses` | pk | via configs | yes | yes | — | 🟢 |
| 4 | Members/roles | `business_members` (owner/admin/agent/viewer) | yes | no | yes | no | — | 🟢 |
| 5 | Business secrets/API keys | `business_secrets` (AES-GCM) | yes | no | yes | server-side | `anthropic_api_key` kind added this pass. Encrypted + masked. | 🟢 |
| 6 | Platform settings | `platform_settings` | n/a | no | admin | server-side | Usage-mode + email + default-provider keys added this pass. | 🟢 |
| 7 | Meta connections | `meta_connections` | yes | yes | yes (OAuth/manual) | via n8n | plaintext+encrypted token, status='active' (0005). | 🟢 |
| 8 | Telegram | `businesses.telegram_channel_id` + `business_secrets` | yes | no | yes | server-side | — | 🟢 |
| 9 | Products | `products` | yes | via snapshot | yes | yes | — | 🟢 |
| 10 | Product images | `product_images` | yes | no | yes | matcher | — | 🟢 |
| 11 | Product variants | `product_variants` | yes | no | yes | yes | Variants not projected into `catalog_snapshots` (product-level only) — n8n grounds at product level. | 🟡 |
| 12 | Product imports | (writes `products`; logs `event_logs` area `product_import`) | yes | — | yes | — | No dedicated import-run history table; logged in event_logs. | 🟢 |
| 13 | Knowledge sources | `knowledge_sources` | yes | via memories | yes | yes | — | 🟢 |
| 14 | Knowledge chunks | `knowledge_chunks` | yes | no | yes | retrieval | Chunks not individually projected to `learning_memories` (source-level is). | 🟡 |
| 15 | FAQ | `bot_settings.faq` (jsonb) + `knowledge_sources` type=faq | yes | yes (memories) | yes | yes | — | 🟢 |
| 16 | Website crawl/import | `knowledge_sources` (type website/about/policy/…) | yes | yes | yes | yes | Single-page + shallow crawl MVP (documented). | 🟡 |
| 17 | Old-chat ingestion | `knowledge_sources` type=old_chats + `bot_settings.old_chats_summary` | yes | yes | yes | yes | PDF/DOCX not parsed (txt/paste only). | 🟡 |
| 18 | Conversations | `conversations` | yes | no | yes | yes | — | 🟢 |
| 19 | Messages | `messages` | yes | no | yes | yes | — | 🟢 |
| 20 | Handoffs | `handoffs` | yes | no | yes | yes | — | 🟢 |
| 21 | Orders/intents | `orders` | yes | no | yes | yes | — | 🟢 |
| 22 | Analytics/events | `analytics_daily` + derived from `messages` | yes | no | rollup | no | Rollup table exists but is sparsely populated; live metrics computed from messages. | 🟡 |
| 23 | Logs/errors | `event_logs` (+ `resolved_at`, `event_type` this pass) | yes | no | system | no | Unified into `event_logs` (area=source, level, resolved_at) — see Task 3. | 🟢 |
| 24 | Audit logs | `admin_audit_logs` | admin | no | system | no | `target_id` is text (not FK) so it survives business deletion. | 🟢 |
| 25 | n8n runtime | `tenant_configs`, `catalog_snapshots`, `learning_memories` | text bid | yes | sync | via n8n | Kept in sync by `src/lib/n8n-sync.ts` on every change. | 🟢 |
| 26 | Billing/plans/limits | `subscriptions`, `businesses.plan`, `daily/monthly_message_limit` | yes | no | admin | no | Limits are stored + surfaced but **enforced by n8n**, not the in-app engine (documented in FIELD_USAGE_AUDIT). No usage-metering table. | 🟡 |
| 27 | File uploads/storage | — (txt read in-memory; product image = URL) | n/a | no | no | no | **No blob storage** — images referenced by URL only; uploaded files not persisted. | 🟡 |
| 28 | Blog/CMS | static `src/lib/blog.ts` | n/a | no | no | no | Blog is code-defined, not DB-editable (by design). | 🟢 |
| 29 | Email provider config | `platform_settings` (EMAIL_MODE/FROM/RESEND_API_KEY/SMTP_*) | n/a | no | admin | no | Added this pass. | 🟢 |
| 30 | Data deletion/privacy | `/api/meta/data-deletion` + `purgeBusinessData()` | yes | no | admin | no | No standing "deletion request" queue table; deletions are immediate + audited. | 🟡 |

## Implemented this pass (safe, additive migration 0006)
- `event_logs`: `+ event_type text`, `+ resolved_at timestamptz`, `+ level` index — per-business filtered logs + error triage.
- `users`: `+ email_verified_at timestamptz`.
- `email_verification_tokens`: hashed single-use expiring tokens (unique index on `token_hash`).
- `business_secrets.kind`: `anthropic_api_key` added (text column, no migration needed).
- Hard-delete now covers **every** `business_id` table (previously omitted `bot_settings`, `analytics_daily`, `subscriptions`, `event_logs` → the delete FK-aborted; plus the 3 n8n tables were orphaned).

## Recommended next (NOT done — documented, medium risk, needs product decision)
- 🟡 **Usage metering table** (`message_usage` per business/day) to actually enforce `daily/monthly_message_limit` in-app rather than relying on n8n.
- 🟡 **Blob storage** (S3/R2/UploadThing) for uploaded knowledge files + product images, with a `file_uploads` table.
- 🟡 **PDF/DOCX ingestion** (pdf-parse/mammoth) — own pass due to serverless reliability.
- 🟡 **`catalog_variants`** projection so n8n can ground on variant-level stock/price.
- 🟡 **`privacy_requests`** table if a standing GDPR/Meta deletion queue is required (today deletions are immediate).
- 🟡 **`subscriptions` → real billing** (Stripe) with webhooks + invoice records if payments go live.

No 🔴 high-risk schema gaps remain for a functioning multi-business SaaS: every tenant table is business-scoped, isolation is enforced at one chokepoint, and the n8n contract tables are kept in sync.
