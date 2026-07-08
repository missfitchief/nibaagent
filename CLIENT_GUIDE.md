# Client Guide (business owner)

Sign up at **/signup** → onboarding creates your business → dashboard at
**/app**. You only ever see your own business.

## Pages
- **Dashboard** (`/app`) — messages today, AI replies, conversations, orders,
  open handoffs, estimated money saved, channel + bot status.
- **Connect FB/IG** (`/app/connect`) — one Facebook login connects your Page
  and Instagram; token stored encrypted. Status shows connected / Facebook-only
  / error with a reconnect button.
- **Bot settings** (`/app/bot`) — launch mode (draft / live / paused), tone,
  custom instructions, order collection, handoff trigger words.
- **Knowledge** (`/app/knowledge`) — FAQ, products & prices, business info,
  and website URL (auto-extracted). Only your business's knowledge is used by
  your bot.
- **Orders** (`/app/orders`) — orders the bot collected; status + sheet-sync.
- **Handoff** (`/app/handoff`) — conversations needing a human; resolve to let
  the bot resume.
- **Analytics** (`/app/analytics`) — 30-day message/AI chart, saved estimate.
- **Test bot** (`/app/test`) — send test messages privately; see intent,
  knowledge used, model, estimated cost — no real Instagram/Facebook needed.
- **Settings** (`/app/settings`) — business profile, **Integrations & keys**
  (your own OpenAI key + Telegram token, stored encrypted, masked after save),
  Google Sheet URL, notification targets.
- **Plan** (`/app/plan`) — current plan + limits; upgrade is contact-us.

## Launch safely
Start in **draft** (bot prepares answers, sends nothing) → test on `/app/test`
→ switch to **live**. Pause anytime. A handoff silences the bot for that
conversation until you resolve it.

## You cannot
See other businesses, open admin pages, or view any raw token/key (only masked
previews of your own).

## Products & Team (added)

- **Products** (`/app/products`) — add/edit/enable/disable/delete; price, stock
  (available/unavailable/unknown), SKU, colors, sizes, tags. This catalog is
  the bot's authoritative fact source (never invented). Search included.
- **Team** (`/app/team`) — owner/admin invite members by email with a role
  (admin/agent/viewer). Agents see conversations/handoffs but not keys; viewers
  are read-only.
