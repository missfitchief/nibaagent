# Admin Guide

Hidden admin login: **/admin-login** (never linked publicly). Admin console at
**/admin**. Admins see and manage every business.

## Admin console (`/admin`)
Platform overview: total businesses, users, messages, AI replies, orders,
handoffs, estimated AI cost. "Newest businesses" table links into each.

## Businesses (`/admin/businesses`)
Searchable list: name, plan, AI mode, model, status. Open any → detail page.

## Business detail (`/admin/businesses/[id]`) — implemented controls
- **Business controls**: plan, status (active/inactive), AI mode
  (draft/live/paused), model per business, daily/monthly message limits, tone,
  handoff on/off. Saved via `adminUpdateBusinessAction` (audit-logged).
- **Connections**: view channels + masked token status.
- **Manual connection**: paste Page ID / Page token / Instagram Business ID —
  encrypted on save (fallback when OAuth isn't possible).
- **Integrations & keys**: set/rotate/remove the business's OpenAI key and
  Telegram token/chat (masked previews only).
- **Old-chats analysis**: one-shot, cached AI summary of stored conversations.
- **Telegram test**: send a test notification using the business's own token.
- **Logs**: recent `event_logs` + admin audit trail.

Every admin mutation writes `admin_audit_logs` (actor, action, target, metadata
— never secret values).

## Setup checklist per business
Business profile → channel connected → OpenAI key configured (or platform
fallback active) → knowledge added → bot tested → bot set live → Telegram
optional.

## Not yet in the admin UI (data model exists; see final report)
Full 13-tab detail page (Users/Products/Conversations/Orders as dedicated
tabs), multi-member management, in-place conversation viewer. These read from
tables that already exist; the pages are the remaining work.

## Business Detail tabs (added)

`/admin/businesses/[id]?tab=…` now has tabs: **Overview** (stats, controls,
connections, tools, old-chats), **Products** (add/edit/enable/disable/delete for
that business), **Users** (add member by email + role, remove), **Integrations
& Keys** (masked OpenAI/Telegram secrets, manual connection, Telegram test),
**Logs**. Admin acts on any business through the same forms clients use, scoped
by `requireBusiness` (admin branch). Remaining tabs from the spec
(Conversations/Handoffs/Orders/Analytics/Danger-Zone as dedicated views) still
render under Overview — splitting them out is the next increment.
