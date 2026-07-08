# NibaChat Agent — SaaS Architecture

Multi-tenant AI-agent platform. One deployment serves many independent
businesses; each has its own connection, knowledge, secrets, settings, bot and
data. Next.js 16 (App Router) on Vercel + Neon Postgres (Drizzle ORM).

## Tenancy model

- `users` — accounts (role `admin` | `client`).
- `businesses` — one row per tenant; `owner_user_id` links the owning client.
  Every tenant-owned table carries `business_id`.
- **Isolation chokepoint**: `src/lib/auth/guards.ts → requireBusiness(id)`.
  Clients can only load a business where `ownerUserId === session.userId`;
  admins can load any. Nothing else loads a business row from user input.
  Server actions call `requireBusiness()` before any write; the Next 16
  `proxy.ts` guards `/app` (session) and `/admin` (admin role) at the edge for
  UX, but the server actions are the security boundary.

## Tables (Drizzle, `src/lib/db/schema.ts`)

users · businesses · meta_connections · **business_secrets** (new) ·
bot_settings · knowledge_sources · knowledge_chunks · conversations · messages
· processed_messages · orders · handoffs · analytics_daily · subscriptions ·
admin_audit_logs · event_logs.

All `business_id`-scoped tables are indexed on `business_id`. Migrations live in
`drizzle/*.sql`, applied by `npm run db:migrate` (works against Neon via
`DATABASE_URL`, or the embedded PGlite dev DB when unset).

## Request → reply flow (per business)

1. Inbound message arrives (webhook / n8n / in-app test).
2. Business identified by channel/page id (`meta_connections.page_id`).
3. Event de-duped (`processed_messages`).
4. Business settings + conversation state loaded (scoped).
5. Intent/language detected; attachments/cards processed.
6. **Business knowledge/products/FAQ retrieved — scoped to `business_id`.**
7. Reply composed with the business tone; grounded in DB facts only.
8. **AI key resolved per business** (own key → platform fallback; see
   `SECRETS_AND_TENANT_ISOLATION.md`).
9. Anti-repeat check → decide reply / handoff / silence.
10. Decision logged; reply sent through the business's own channel token.

The engine (`src/lib/engine.ts`) takes `businessId` and never reads another
business's data. StarLight is just one business record, not special-cased.

## Deployment

Vercel (app) + Neon (DB). See `DEPLOY_VERCEL.md`. The live StarLight bot on
Render is a **separate** deployment and is not affected by this app.

## What is implemented vs planned

Implemented: tenancy + guards, per-business Meta OAuth + encrypted tokens,
per-business encrypted secrets vault (OpenAI key, Telegram), key-resolution
with platform fallback + source logging, knowledge base (FAQ/manual/products-
as-text/URL extraction), rules-first engine, Telegram notifications, admin
control center, client dashboard, isolation test suite.

Planned / partial (see final report): dedicated `products`/`product_images`
tables (currently products stored as `knowledge_sources` type=products),
PDF/file upload extraction, CSV/JSON old-chat ingestion with PII redaction,
the full 13-tab admin Business Detail page, multi-member `business_users`
(currently single-owner).
