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
