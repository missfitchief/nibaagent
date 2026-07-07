# DEPLOY_VERCEL — NibaChat Agent, without touching the live StarLight bot

The StarLight bot currently runs on Render (`metabot-starlight.onrender.com`) and owns the webhook of Meta app
**2199807407438226 ("Niba Chat")**. Everything below deploys NibaChat Agent **next to** it, using a **separate Meta TEST
app**, so nothing can interrupt live traffic. The cutover to make StarLight "client #1" is a separate, manual, reversible
step at the end — nothing in this app flips any webhook automatically.

## Why this is safe by construction

- NibaChat Agent **never receives Meta webhooks itself** — the shared n8n workflow does. This app only manages OAuth,
  tokens, settings and data.
- The only Meta write this app performs is `POST /{page-id}/subscribed_apps` during a client's OAuth connect — that binds a
  page to **whatever app ID is in the env**. With the TEST app configured, the live app's webhook and page bindings are
  physically out of reach.
- The live app's webhook stays pointed at Render until a human changes it in the Meta dashboard or via the subscriptions
  API. **This repo contains no code that does that.**

---

## 1. Deploy to Vercel (test configuration)

### Prerequisites
1. **Neon**: create a project → copy the *pooled* connection string.
2. **Migrate + seed** (run locally against Neon — one time):
   ```powershell
   $env:DATABASE_URL="<neon-pooled-url>"; npm run db:migrate
   $env:DATABASE_URL="<neon-pooled-url>"; $env:ADMIN_EMAIL="you@domain.com"; $env:ADMIN_PASSWORD="<strong>"; npm run seed:admin
   ```
3. **Meta TEST app** (see §2) — you need its App ID + App Secret.

### Vercel steps
1. vercel.com → **Add New → Project** → import the GitHub repo (`nibaagent`). Framework is auto-detected (Next.js); default
   build settings are correct (`next build`).
2. Add the environment variables (table below) for the **Production** environment.
3. **Deploy.** Note the assigned domain (e.g. `nibaagent.vercel.app`).
4. Set `APP_URL=https://<your-domain>` in Vercel env (if you didn't know the domain before the first deploy, set it now and
   redeploy — it drives OAuth redirects, sitemap and the data-deletion callback URL).
5. In the **TEST** Meta app: Facebook Login → Settings → **Valid OAuth Redirect URIs** → add
   `https://<your-domain>/api/meta/callback` (the exact value is displayed at `/admin/settings` in the app).
6. Smoke test: open the landing page, sign up, complete onboarding, log into `/admin-login`, check `/admin/settings` shows
   every env as "configured".

### Required env vars

| Variable | Value / how to get it | Required |
|---|---|---|
| `DATABASE_URL` | Neon pooled connection string | ✅ |
| `APP_URL` | `https://<your-vercel-domain>` (no trailing slash) | ✅ |
| `ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | ✅ |
| `AUTH_SECRET` | another random string (falls back to ENCRYPTION_KEY if unset) | recommended |
| `META_APP_ID` | **TEST app ID** for now — NOT `2199807407438226` | ✅ |
| `META_APP_SECRET` | TEST app's secret (App Settings → Basic → Show) | ✅ |
| `META_REDIRECT_URI` | leave empty (defaults to `{APP_URL}/api/meta/callback`) | optional |
| `META_VERIFY_TOKEN` | `nibachat_verify_123` (must equal the n8n webhook's verify token) | ✅ |
| `N8N_WEBHOOK_URL` | your n8n instance's `meta-webhook` URL | when n8n is up |
| `OPENAI_API_KEY` | platform.openai.com key with billing | ✅ for AI replies |
| `TELEGRAM_BOT_TOKEN` | @BotFather token | optional |
| `WHATSAPP_PROVIDER_API_KEY` | leave empty (provider TBD) | optional |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` | break-glass admin (hash: see .env.example) | optional |
| `ADMIN_LOGIN_PATH` | default `admin-login` | optional |

No secrets in git — everything above lives only in Vercel's env UI.

---

## 2. Separate Meta TEST app first (do NOT reuse the live app)

1. developers.facebook.com → **Create App** → type *Business* → name e.g. **"NibaChat TEST"**.
2. Add products: **Facebook Login**, **Messenger**, **Instagram** (Webhooks comes with them).
3. Copy App ID + App Secret into the Vercel env (§1).
4. Point the TEST app's **webhook** at your n8n instance: callback = the `meta-webhook` URL, verify token =
   `nibachat_verify_123`, subscribe `messages` for the `page` and `instagram` objects. (If n8n is not ready, skip — OAuth
   connect and token storage are testable without any webhook.)
5. Use a **throwaway test Facebook Page + test Instagram** (Business/Creator, linked to the page). **Never connect the real
   Star Light Nakit page to the test app** — a page can be subscribed to multiple apps at once, and you'd get double replies
   the moment both engines are live.
6. Test app is in Development Mode: only app-role holders' messages trigger webhooks. Add your accounts as testers — that is
   exactly what you want for a test phase.

### Safe test plan (order matters)
1. Signup → onboarding → business created (Neon rows appear).
2. `/app/test` — rules answer without any Meta involvement (FAQ, handoff word, order intent).
3. **Connect via Facebook login** with the test page → expect status "Connected", token stored encrypted, page subscribed to
   the TEST app (verify: `GET /{page-id}/subscribed_apps` shows "NibaChat TEST" only).
4. If n8n is wired: DM the test page from a tester account → n8n receives → replies → rows land in `messages`/
   `processed_messages` → visible in the dashboard.
5. Throughout: the live StarLight bot keeps answering its page via Render — verify with a control DM to the real page.

---

## 3. StarLight as client #1 — safe migration plan (LATER, manual)

**The trigger that stops the old Render bot:** the Render bot stops receiving messages at the exact moment the **live app's
(`2199807407438226`) webhook callback URL** is changed away from `https://metabot-starlight.onrender.com/webhook` — via the
Meta dashboard or a `POST /{app-id}/subscriptions` call. Nothing else does it: not deploying this app, not creating the
business, not OAuth, not `subscribed_apps`. Until that moment, Render answers everything; after it, n8n does. (If both an
old and a new app were subscribed to the page simultaneously, BOTH would receive — which is why the checklist pauses one bot
before any overlap.)

### Migration checklist (cutover day, ~15 minutes, low-traffic hour)
1. ✅ Test phase (§2) fully green, n8n answering the test page correctly for at least a few days.
2. Create the **StarLight business** in NibaChat (owner account for Nikola), add its FAQs/knowledge, set **draft** mode.
3. In Vercel env: switch `META_APP_ID`/`META_APP_SECRET` to the **live** app (`2199807407438226` + its secret) → redeploy.
   Whitelist the redirect URI in the live app's Facebook Login settings. *(Still nothing has changed for the Render bot.)*
4. **Pause the Render bot** so there is no double-reply window: on Render env set `META_MODE=mock` (accepts but stops
   sending) — or simply proceed to step 5 immediately; before 5, Render still answers.
5. **THE FLIP** (this is the moment Render stops receiving): in the live Meta app change the webhook callback to the n8n
   `meta-webhook` URL with verify token `nibachat_verify_123`, objects `page` + `instagram`, field `messages`. Equivalent
   API call (labeled for cutover day — do not run before):
   ```bash
   curl -X POST "https://graph.facebook.com/v25.0/2199807407438226/subscriptions" \
     --data-urlencode "object=page" \
     --data-urlencode "callback_url=<N8N_WEBHOOK_URL>" \
     --data-urlencode "verify_token=nibachat_verify_123" \
     --data-urlencode "fields=messages" \
     --data-urlencode "access_token=2199807407438226|<LIVE_APP_SECRET>"
   # repeat with object=instagram
   ```
6. In NibaChat: StarLight owner clicks **Connect via Facebook login**, selects the Star Light Nakit page → token stored,
   `subscribed_apps` refreshed.
7. Send test DMs (text + the handoff word) → n8n answers, rows appear in the NibaChat dashboard.
8. Run **draft mode** under human supervision first; flip to **live** when the answers are trusted.
9. Keep the Render service running but idle for at least a week — it is the rollback.

### Rollback plan (back to the Render bot, ~2 minutes)
1. Re-point the live app's webhook back (dashboard, or the same API call with
   `callback_url=https://metabot-starlight.onrender.com/webhook` and **Render's** `META_VERIFY_TOKEN` value from the Render
   env page — the service answers Meta's verification challenge immediately).
2. If Render was set to `META_MODE=mock` in step 4: set it back to `real` → auto-redeploys (~2 min).
3. In NibaChat: set the StarLight business to **paused** so nothing double-fires if the webhook is flipped again later.
4. Verify with a test DM — Render's channel config (encrypted page token, page id, IG id) was never deleted, so recovery is
   immediate. Keep it that way until the migration is final.

---

## Hard rules encoded in this plan

- ❌ Never point the TEST app at the real StarLight page.
- ❌ Never change app `2199807407438226`'s webhook until checklist step 5, knowingly, on cutover day.
- ✅ One engine live per page at any moment (pause the other).
- ✅ Rollback path stays warm until StarLight has run clean on n8n for a week.
