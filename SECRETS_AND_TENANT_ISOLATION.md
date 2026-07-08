# Secrets & Tenant Isolation

## Tenant isolation

Every business-owned table has `business_id`. All access flows through
`requireBusiness(id)` (`src/lib/auth/guards.ts`), which for a **client** only
returns a business owned by the session user, and for an **admin** returns any.
Server actions call it before every read/write, so a client can never load,
edit, or reference another business's row — even by guessing an id.

Proven by `test/isolation.test.ts` (8 tests, all green):
- Business A's knowledge query never returns B's rows.
- Conversations/orders are business-scoped.
- A's owner user cannot load B via any owner-scoped query.

## Per-business secrets vault

Table `business_secrets` (one row per business × kind):

| kind | used for |
|---|---|
| `openai_api_key` | business brings its own OpenAI key (billed to them) |
| `telegram_bot_token` | that business's notification bot |
| `telegram_chat_id` | where its alerts go |

Meta page/Instagram tokens stay in `meta_connections` (also encrypted).

**Guarantees (all test-covered):**
- **Encrypted at rest** — AES-256-GCM (`src/lib/crypto.ts`), wire format
  `v1:iv:data:tag`. Plaintext is never stored; the test asserts the ciphertext
  contains none of the key material.
- **Never returned to the client** — the UI receives only `listMaskedSecrets()`
  output: `{ kind, hasValue, preview: "…ab12" }`. No ciphertext, no plaintext.
- **Removable / rotatable** — `deleteBusinessSecret` / re-`setBusinessSecret`.
- **Never logged** — writes log the kind and actor, never the value.
- **Never cross business boundaries** — every function takes `businessId`;
  resolution reads only that business's row (test: A's key never appears in B's
  resolution).

## Key resolution (the "critical" rule)

`resolveOpenAiKey(businessId)`:
1. business's own `openai_api_key` → `{ source: "business_key" }`
2. else platform `OPENAI_API_KEY` → `{ source: "platform_key" }`
3. else `{ source: "none" }` (AI disabled; rules still work)

The source (never the key) is written to `event_logs` so per-business AI cost
is attributable. `resolveTelegram(businessId, fallbackChatId)` follows the same
own→platform→none pattern. The engine uses the resolved key; there is no
remaining direct read of the platform key in the reply path.

## Encryption key management

`ENCRYPTION_KEY` (32 bytes, base64/hex) in the environment encrypts all
secrets and tokens. **Rotating it makes existing ciphertext undecryptable** —
if you must rotate, re-enter each business's secrets afterward. It is set in
Vercel env, never in git.
