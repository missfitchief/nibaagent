# FIELD USAGE AUDIT — NibaChat Agent

Blunt, field-by-field audit of every control the user can edit in the UI, and
whether the value is actually **used** by the system. Nothing here is a "fake"
control: each field is either wired to real behavior, or explicitly marked
**coming soon** in the UI (and listed as such below). No control silently does
nothing.

Legend:
- ✅ **USED** — read and acted on by the reply engine or platform code.
- 🔵 **USED (config)** — used for configuration/resolution (OAuth, keys, limits, notifications), not the reply text.
- 🟡 **USED — production layer** — consumed by the shared n8n workflow (the production message loop), not the in-app engine. The in-app engine surfaces the value so n8n/worker can apply it.
- 🟣 **COMING SOON** — labeled as such in the UI; stored but intentionally not yet acted on.

---

## Bot settings — `/app/bot` and Admin → business → Bot tab (`bot_settings`)

| Field | Status | Where it's used |
|---|---|---|
| `tone` | ✅ USED | Injected into the system prompt (`engine.ts`), mirrored to `businesses.tone`. |
| `aiProvider` (OpenAI / Anthropic) | ✅ USED | Selects the API called (`callOpenAi` vs `callAnthropic`) and the key resolver. |
| `selectedModel` (recommended or custom) | ✅ USED | Passed to the provider call. No allow-list — future/unknown names pass through (`models.ts` `pickModel`/`sanitizeModel`). Stored on `businesses.selected_model`. |
| `aiStrategy` (rules_first / balanced / ai_heavy) | ✅ USED | `rules_first` = FAQ + deterministic order shortcut; `balanced` = FAQ, no order shortcut; `ai_heavy` = skip FAQ/order shortcuts and let the model write. |
| `persiranje` (formal "Vi") | ✅ USED | Chooses formal vs informal Serbian templates AND adds a persiranje instruction to the prompt. |
| `unknownBehavior` (offer_handoff / ask_rephrase / generic_help) | ✅ USED | The "no grounded answer" branch picks one of these deterministic replies. |
| `handoffThreshold` (0–100) | ✅ USED | Product-match confidence below this → treated as "unknown" (triggers `unknownBehavior`). |
| `imageRecognitionEnabled` | ✅ USED | If a photo arrives and this is off, the bot asks for a text description instead of guessing. (Full vision matching runs in the production/n8n layer.) |
| `replyDelaySeconds` | 🟡 USED — production layer | Surfaced on `EngineResult.replyDelaySeconds`; the sender (n8n/worker) waits this long before sending. The in-app test bot returns instantly. |
| `handoffWords` | ✅ USED | Substring match (diacritic-insensitive) → immediate handoff, bot goes silent. |
| `orderCollectionEnabled` | ✅ USED | Enables the deterministic order-collection reply on order intent. |
| `orderPrompt` | ✅ USED | Appended to the order-collection reply (e.g. "Also ask for preferred delivery time"). |
| `businessHours` (enabled/open/close/offHoursMessage) | ✅ USED | Outside hours → send the off-hours message (if set) or stay silent (`hours.ts` `withinBusinessHours`). |
| `customInstructions` | ✅ USED | Added to the system prompt as "Business rules". |
| `oldChatsSummary` | ✅ USED | Added to the prompt as a style/knowledge summary (populated by "Analyze old chats"). |
| `greetingBehavior` | 🟡 USED — production layer | Greeting de-dup is enforced in the n8n conversation flow. Not surfaced as an editable control in this UI (managed default). |
| `faq` (inline FAQ list) | ✅ USED | Merged with FAQ knowledge sources for matching. |

## Business controls — Admin → business → Bot tab (`businesses`)

| Field | Status | Where it's used |
|---|---|---|
| `aiMode` (draft / live / paused) | ✅ USED | **paused** = never reply; **draft** = prepare but `shouldSend=false`; **live** = `shouldSend=true`. |
| `plan` | 🔵 USED (config) | Drives feature/limits via `plans.ts` `planDef` (knowledge-source cap on the Knowledge page, plan badges). |
| `status` (active / inactive) | 🔵 USED (config) | Set by archive/danger actions; shown in admin lists. Not a reply gate (use `aiMode` to stop replies). |
| `handoffEnabled` | ✅ USED | Gates whether handoff-word detection runs at all. |
| `dailyMessageLimit` / `monthlyMessageLimit` | 🟡 USED — production layer | Rate limiting is enforced by the n8n send layer + surfaced in analytics; the in-app test engine does not rate-limit. |
| `tone` | ✅ USED | Mirror of bot tone (kept in sync on save). |
| `defaultLanguage` | ✅ USED | Chooses reply language + template set. |
| `googleSheetUrl` | 🟡 USED — production layer | Order export to Google Sheets is handled by n8n; validated on save. |
| `telegramChannelId` | 🔵 USED (config) | Fallback chat id for Telegram notifications (`resolveTelegram`). |
| `whatsappNotificationTarget` | 🟣 COMING SOON | Stored; WhatsApp notifications are not yet implemented. (Not shown as an active feature.) |

## Platform app settings — Admin → App settings (`platform_settings`)

All resolve **DB → env → missing** (`platform.ts`). Secrets are AES-GCM encrypted and shown masked.

| Field | Status | Where it's used |
|---|---|---|
| `APP_URL` | 🔵 USED (config) | Builds the OAuth callback + webhook + data-deletion URLs (live preview + `resolvedRedirectUri`). |
| `META_APP_ID` | 🔵 USED (config) | Facebook Login `client_id` (`/api/meta/start`, `meta.ts`). |
| `META_APP_SECRET` | 🔵 USED (config) | OAuth token exchange + webhook signature verification. |
| `META_VERIFY_TOKEN` | 🔵 USED (config) | Webhook GET handshake (`/api/meta/webhook`). |
| `META_MODE` | 🔵 USED (config) | Stored platform mode flag. |
| `META_REQUIRE_SIGNATURE` | 🔵 USED (config) | When not "false", the webhook POST verifies `X-Hub-Signature-256`. |
| `OPENAI_API_KEY` | 🔵 USED (config) | Platform fallback OpenAI key (`resolveOpenAiKey`, after per-business key). |
| `ANTHROPIC_API_KEY` | 🔵 USED (config) | Platform Anthropic key (`resolveAnthropicKey`). |
| `DEFAULT_OPENAI_MODEL` / `DEFAULT_VISION_MODEL` / `DEFAULT_ANTHROPIC_MODEL` | 🔵 USED (config) | Platform default model names (fallback in `pickModel`). |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 🔵 USED (config) | Platform fallback for Telegram notifications (`resolveTelegram`). |
| `N8N_WEBHOOK_URL` | 🟡 USED — production layer | Reference to the shared n8n webhook (informational for operators; the production loop points Meta at n8n). |
| `DATABASE_URL` / `ENCRYPTION_KEY` / `AUTH_SECRET` | 🔵 USED (config) | Infrastructure — read-only status only, set in the hosting env. |

## Knowledge tab — `/app/knowledge` and Admin → business → Knowledge tab

| Control | Status | Where it's used |
|---|---|---|
| FAQ (Q&A) | ✅ USED | Matched deterministically before AI. |
| Business info / rules (`manual`) | ✅ USED | Added to the prompt "BUSINESS INFO" block. |
| Website URL (single page, `url` type) | ✅ USED | Stored as a knowledge source. |
| **Read website** (multi-page crawl) | ✅ USED | Homepage + About/FAQ/delivery/payment/returns/contact → business-scoped knowledge (`website.ts`). Product-table facts still win in the prompt (products are marked authoritative; website text feeds the non-product block). |
| Old chats / notes paste | ✅ USED | PII-redacted, chunked, FAQ candidates extracted (`ingest.ts`, `redact.ts`). |
| **.txt file upload** | ✅ USED | Read + redacted + stored. |
| PDF / DOCX upload | 🟣 COMING SOON | Rejected with a clear "export to .txt for now" message. Labeled coming soon in the UI. |

## Products tab — `/app/products` and Admin → business → Products tab

| Control | Status | Where it's used |
|---|---|---|
| Manual product create/edit (title/price/stock/sku/colors/sizes/url) | ✅ USED | Authoritative facts for the bot (`matchProducts` + `productFacts`). |
| **Import from shop URL** (Scan → preview → import) | ✅ USED | Shopify `/products.json`, JSON-LD, WooCommerce Store API, generic OG fallback (`importer.ts`). Dedup by url→handle→sku→title; stock stays **unknown** unless the source states it; "available" = orderable. |
| Enable / disable | ✅ USED | Disabled products are excluded from bot answers. |
| Product images / variants | ✅ USED | Variant color/size/price injected when asked (`variantFacts`). |

---

## Fixed during this audit

- **`orderPrompt`** previously saved but was ignored by the engine → now appended to the order-collection reply.
- **`aiProvider`, `aiStrategy`, `persiranje`, `imageRecognitionEnabled`, `replyDelaySeconds`, `unknownBehavior`, `handoffThreshold`, `businessHours`** were new controls added and wired in this pass (previously the engine ignored per-business behavior beyond tone/model/mode).
- **Model dropdown** no longer hard-blocks to 3 hardcoded names; it's provider + recommended + free-text custom, with future models accepted.

## Honestly not wired in the in-app engine (documented, not hidden)

- Rate limits (`daily/monthlyMessageLimit`), Google Sheets export, greeting de-dup, reply delay, and full image→product vision are enforced by the **production n8n workflow**, which is the real message loop. The in-app engine (test bot + draft) surfaces these values but does not itself rate-limit, export, or delay. This split is by design: n8n owns the live send path.
- **WhatsApp notifications**: schema field exists, feature not implemented → marked coming soon.

---

## N8N Runtime Compatibility

The live message loop runs in a shared **n8n** workflow that reads three flat, snake_case tables in the same Neon DB. The app owns the source of truth in its own tables and **syncs** a denormalized, tenant-scoped, timestamped projection into the n8n tables on every relevant change (`src/lib/n8n-sync.ts`, all parameterized upserts). Sync is triggered from: bot-settings save, AI-mode change, business-settings save, product create/edit/delete/toggle, variant add/delete, product import, website ingest, knowledge create/delete, old-chat ingest, old-chats analysis, Meta connect (OAuth + manual), and the admin **"Sync n8n runtime data"** button (`syncN8nRuntimeAction`). Every trigger is best-effort (`safeSync*`): a sync failure is logged and never breaks the user's save.

### `meta_connections` (extended in-place — additive migration `0005`, no drops)
| n8n field | App source | Notes |
|---|---|---|
| `page_access_token` | Page token from OAuth (or manual) | **PLAINTEXT** — n8n reads this. Mirrors `encrypted_page_access_token`. |
| `instagram_access_token` | = page token when IG linked | PLAINTEXT mirror of `encrypted_instagram_access_token`. |
| `business_name` | `businesses.name` (server-side) | Loaded from DB, never a request param. |
| `plan` | `businesses.plan` | For n8n plan gating. |
| `client_id` / `business_id` | tenant id (from signed OAuth state) | Tenant resolved from signed state + session only. |
| `status` | `'active'` on success | n8n treats **`active` = connected**; UI treats `active`/`connected` as connected. Webhook-subscribe failure keeps the row and redirects `?connected=1&warning=webhook_subscription_failed`. |
| `instagram_business_account_id`, `page_id`, `page_name`, `connection_type` | OAuth/manual | `page_id` has a unique index → upsert `ON CONFLICT (page_id)`; a Page owned by another tenant is never reassigned. |

### `tenant_configs` (one row per tenant, key `business_id`)
| n8n field | App source (table.column) | Tenant-scoped |
|---|---|---|
| `client_id`, `business_id`, `business_name`, `plan` | `businesses` | ✅ |
| `ai_enabled`, `handoff_enabled` | `businesses.ai_enabled` / `.handoff_enabled` | ✅ |
| `bot_mode` (launch mode) | `businesses.ai_mode` (draft/live/paused) | ✅ |
| `default_language` | `businesses.default_language` | ✅ |
| `selected_model` | `businesses.selected_model` | ✅ |
| `tone`, `persiranje`, `ai_strategy` (AI mode), `ai_provider`, `image_recognition_enabled`, `handoff_threshold`, `unknown_behavior`, `business_hours` | `bot_settings` | ✅ |
| `telegram_connected` | `businesses.telegram_channel_id` set | ✅ |
| `meta_connected` | any `meta_connections` row for the tenant | ✅ |
| `updated_at` | sync time | ✅ |

### `catalog_snapshots` (one row per product, key `business_id`+`product_id`)
Projects `products` → `title, description, price, currency, stock_status, stock_quantity, sku, category, tags, colors, sizes, url, enabled`. Stale rows (deleted products) are pruned on each sync. Tenant-scoped: a sync for tenant A never reads or writes tenant B's products.

### `learning_memories` (one row per memory, key `business_id`+`source_id`)
Projects `knowledge_sources` (type → `source_type`: `faq`/`website`/`old_chats`/`knowledge`, `status='active'` → `enabled`) plus synthetic rows from `bot_settings`: `…:instructions` (custom instructions), `…:oldchats` (old-chats summary), `…:faq` (FAQ pairs), `…:tone`. Archived sources become `enabled=false`; removed ones are pruned. Tenant-scoped.

### Image (`image_url`) flow
n8n forwards `{ client_id, message, image_url }` to `POST /api/agent/reply`. The app resolves the tenant from `client_id` (business id → `meta_connections.client_id` → `page_id`; **never guesses**), loads THAT tenant's config/catalog/memories, and: if `image_url` is present **and** `image_recognition_enabled` is on, it describes the image with the **tenant's own** vision key/model (`describeImageWithTenantKey`) and folds the description into the grounded query; if recognition is **off**, it never calls vision and politely asks for a product name/link. No cross-tenant leakage; the endpoint returns a reply only — never tokens/secrets. Optional `AGENT_WEBHOOK_SECRET` (`x-agent-secret` header) gates the endpoint.

### Verification
Admin-only `GET /api/admin/meta-connections[?businessId=]` returns a hard allow-list of safe columns (`client_id, business_id, business_name, page_id, page_name, instagram_business_account_id, status, plan, connection_type, connected_at, updated_at`) — **no token/secret column is ever selected**. All logging in the OAuth callback and sync is sanitized (no tokens, app secret, auth code, DATABASE_URL, or encryption key).
