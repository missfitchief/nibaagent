# Meta Connect Guide

How a business connects its Facebook Page + Instagram. Client-facing: one
button, no Meta Developer console, no terminal.

## OAuth flow (implemented — `src/app/api/meta/*`)
1. Client (or admin, for a chosen business) clicks **Connect via Facebook login**.
2. `/api/meta/start?businessId=…` — `requireBusiness` authorizes, then a signed
   short-lived JWT carrying `businessId` becomes the OAuth `state` (CSRF-safe).
3. Facebook dialog with scopes: `pages_show_list, pages_read_engagement,
   pages_manage_metadata, pages_messaging, instagram_basic,
   instagram_manage_messages`.
4. `/api/meta/callback` — verifies state, exchanges code → **long-lived** user
   token → derives the permanent **Page access token**.
5. Pages via `/me/accounts`; if empty, falls back to `debug_token`
   granular-scopes to find granted page ids (task-based-access quirk).
6. Instagram Business account id resolved from the page.
7. Connection saved under **that business only** (page token encrypted, IG id
   stored); page subscribed to the app (`subscribed_apps`, `messages`).
8. Status shown: connected / Facebook-only (no IG) / error.

Every page id is globally unique in `meta_connections`, so a page can belong to
exactly one business; attempting to attach a page already owned by another
business is rejected.

## Manual fallback (implemented — admin)
Admin → business detail → **Manual connection**: paste Page ID, Page access
token, Instagram Business ID, name. Encrypted on save. Use when OAuth isn't
possible.

## Troubleshooting surfaced to the user
- `/me/accounts` empty → "your Facebook account is not an admin of any Page".
- Development Mode → only app-role holders' messages arrive; add testers.
- Missing IG → "Facebook connected, Instagram not connected".
- Expired/invalid token → "Reconnect needed".

## Do NOT (hard rules)
- One Meta app has ONE webhook. **Use a separate TEST Meta app** for NibaChat;
  do not point the live StarLight app's webhook here. See `DEPLOY_VERCEL.md` for
  the test-app setup and the eventual StarLight→NibaChat migration + rollback
  plan. This app never flips a webhook automatically.
