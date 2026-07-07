# NibaChat Agent

Multi-tenant SaaS that connects a business's **Facebook Page + Instagram** in one login and answers customer messages with a
cost-optimized AI agent: instant replies, in-chat **order collection**, **human handoff**, knowledge training, notifications
and analytics. The production message loop runs through a shared **n8n workflow** ("Meta Messenger Multi-Tenant SaaS"); this
app is the management platform that owns the database both sides share.

**Stack:** Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · Drizzle ORM · Neon Postgres (embedded PGlite for
local dev) · custom JWT auth (bcrypt + jose) · Vercel-ready.

## Quick start (local)

```bash
npm install
cp .env.example .env          # defaults work locally — no external services needed
npm run db:migrate            # applies drizzle/*.sql (embedded dev DB under ./.data)
ADMIN_EMAIL=admin@local ADMIN_PASSWORD=change-me npm run seed:admin
npm run dev                   # http://localhost:3000
```

- Sign up at `/signup` → onboarding creates your business → client dashboard at `/app`.
- Hidden admin login at `/admin-login` (never linked in the UI) → admin console at `/admin`.
- Test the bot without Meta at `/app/test` (rules work with zero keys; AI replies need `OPENAI_API_KEY`).

## Environment variables

See [.env.example](.env.example) — every variable is documented there. Required in production:
`DATABASE_URL`, `ENCRYPTION_KEY`, `APP_URL`, `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `OPENAI_API_KEY`.
Optional: `N8N_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`, `WHATSAPP_PROVIDER_API_KEY`, `ADMIN_*`.

## Setup guide

### 1. Neon (database)
Create a project at neon.tech → copy the **pooled** connection string into `DATABASE_URL` → `npm run db:migrate` →
`npm run seed:admin`. All tables are created by the SQL in `drizzle/`; `meta_connections` and `processed_messages` follow the
shared n8n contract (snake_case columns — do not rename).

### 2. Meta app (one app for all clients)
App ID `2199807407438226` ("Niba Chat"). In the Meta dashboard:
- **Facebook Login → Settings → Valid OAuth Redirect URIs**: add `{APP_URL}/api/meta/callback` (shown in `/admin/settings`).
- **Webhooks**: callback = your n8n webhook URL (path `meta-webhook`), verify token = `META_VERIFY_TOKEN`
  (`nibachat_verify_123`), subscribe `messages` for the `page` and `instagram` objects.
- **App Review**: `pages_messaging` + `instagram_manage_messages` Advanced Access is required before the bot can serve the
  general public; in Development Mode only app-role holders' messages arrive. The data-deletion callback required by review is
  implemented at `/api/meta/data-deletion`, and the legal pages it wants are at `/legal/*`.
- Clients never touch any of this — they click **Connect via Facebook login** in the app; the OAuth flow stores an encrypted
  permanent Page token, resolves the Instagram Business ID, and subscribes the page to the app automatically (including the
  `/me/accounts`-returns-empty fallback via `debug_token` granular scopes).

### 3. n8n (reply engine)
Import your "Meta Messenger Multi-Tenant SaaS" workflow, point its Postgres credentials at the same Neon database, and set
`N8N_WEBHOOK_URL` here. The app writes `businesses`, `meta_connections`, `bot_settings`, `knowledge_sources` etc.; n8n reads
them to route and answer messages and writes `processed_messages`/`messages`. ⚠ Verify the workflow's SQL column names match
`src/lib/db/schema.ts` — the schema was built from the spec, and any drift breaks routing silently.

### 4. OpenAI
Set `OPENAI_API_KEY`. Cost controls are built in: rules (FAQ/handoff/order intent) run before any AI call, the default model
is `gpt-4o-mini` (admin can change per business), prompts are compact (knowledge summaries, not raw dumps), the landing demo
bot is 100% static, and per-business daily/monthly caps + AI on/off switches are enforced from the admin console.

### 5. Telegram (optional)
Create a bot via @BotFather → `TELEGRAM_BOT_TOKEN`. Each business sets its own chat/channel ID in Settings; admins can send a
test notification from the business detail page. WhatsApp has a provider abstraction ready (`src/lib/notify.ts`) — wire a
provider key when chosen.

### 6. Vercel deployment
Import the GitHub repo in Vercel → framework auto-detected → add the env vars above → deploy. Set `APP_URL` to the final
domain and whitelist the redirect URI in Meta. Note: PGlite is dev-only; production requires `DATABASE_URL` (the app refuses
to boot without it). Run `npm run db:migrate` against Neon once (locally with the Neon URL, or as a CI step).

## Architecture notes

- **Tenant isolation**: every query goes through `requireBusiness()` (`src/lib/auth/guards.ts`) — clients can only load
  businesses they own; admins can load any. Route protection is layered: Next 16 `proxy.ts` for UX, guards for security.
- **Token security**: page/Instagram tokens are AES-256-GCM encrypted (`ENCRYPTION_KEY`) before touching the database, never
  returned by any API, and shown only masked (`EAAB…xyz`) in the admin UI.
- **Safe launch modes** per business: `draft` (suggest, never send) → `live` → `paused`.
- **Observability**: `event_logs` (OAuth, webhook-subscribe, AI, notification, sheet errors) + `admin_audit_logs` for every
  admin action — both visible at `/admin/logs`.
- **Money-saved estimate**: €600/month agent cost, ~2 min saved per AI reply — always labeled an estimate.

## Commands

```bash
npm run dev          # dev server (Turbopack)
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run db:generate  # regenerate SQL from schema changes
npm run db:migrate   # apply migrations (Neon or local dev DB)
npm run seed:admin   # create/update the hidden admin user
```

## Still pending (needs external secrets/decisions)

- Real Neon `DATABASE_URL` (runs on the embedded dev DB until then)
- `META_APP_SECRET` + n8n webhook URL for the live message loop
- Google Sheets order **append** (orders persist in DB with `google_sheet_synced` tracking; a sheet/service-account
  integration slot is ready in settings + order model)
- WhatsApp notification provider choice
- Stripe/Paddle (subscriptions table is billing-ready; current billing is contact-us/manual)
