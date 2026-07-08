# Knowledge Ingestion

All knowledge is stored in `knowledge_sources` (and `knowledge_chunks`),
`business_id`-scoped. The bot retrieves only the current business's rows.

## Sources — status

| Source | Status | Notes |
|---|---|---|
| Manual FAQ | ✅ implemented | question/answer via `/app/knowledge` |
| Products & prices (text) | ✅ implemented | stored as `type=products`; dedicated `products` table is planned |
| Business info / rules | ✅ implemented | free text |
| Website URL | ✅ implemented (MVP) | fetch on save, strip scripts/styles/tags, capture title/meta/prices, cap 300 KB / 8 s; stored cleaned |
| Old chats → summary | ✅ implemented (admin) | one-shot cached AI summary of stored conversations (`analyzeOldChatsAction`) |
| PDF / file upload | ⏳ planned | UI + `pdf`/`doc` source types exist; extraction not wired |
| CSV/JSON old-chat import + PII redaction | ⏳ planned | design below |

## Website extraction (implemented)
On adding a `url` source, the server fetches the page once, strips markup,
extracts title + meta description + visible prices + first ~6 KB of text, and
stores it as the source content. Failures are saved with `status=error` and a
clear message; nothing blocks the bot.

## Old-chats analysis (implemented)
Admin-only, click-to-run, never continuous. Summarizes up to 20 recent stored
conversations into a compact style/knowledge summary cached in
`bot_settings.old_chats_summary` with a timestamp. One cheap batched
`gpt-4o-mini` call; re-runs only on demand. Cost + token count logged (no PII).

## Grounding rule (enforced)
The bot answers product facts from DB rows only. If an old-chat summary implies
an old price and the product record says otherwise, **the DB wins** — summaries
are tone/FAQ guidance, never a fact source that overrides the catalog.

## Planned: CSV/JSON old-chat import with PII redaction
1. Admin/client uploads an export (or pulls via page token where permitted).
2. Redact names, phones, emails, addresses, order/tracking numbers before any
   storage or model call.
3. Detect common intents, extract best answers → FAQ candidates + tone examples.
4. Show suggestions for approval before enabling.
5. Report: conversations/messages processed, redactions, FAQ generated, unsafe
   skipped. Raw private chats are never stored as prompt material.
