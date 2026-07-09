# SEO AUDIT — NibaChat Agent (public site)

## Pages checked
- `/` (landing, sr/bs/en via `?lang=`)
- `/blog` (index, locale-filtered)
- `/blog/[slug]` (articles, sr + en)
- `/legal/[privacy|terms|cookies|data-deletion|gdpr]`
- `/sitemap.xml`, `/robots.txt`

## Global metadata — status
| Item | Status | Where |
|---|---|---|
| Title template `%s — NibaChat Agent` | ✅ | `src/app/layout.tsx` |
| `metadataBase` (absolute URLs) | ✅ | layout (`APP_URL`) |
| Meta description | ✅ | layout + per-page |
| Keywords (Serbian target set) | ✅ | layout — „AI chatbot za Instagram/Facebook“, „chatbot za online prodavnice“, „automatizacija poruka“ … |
| OpenGraph (title/description/url/type/locale) | ✅ | layout + landing `generateMetadata` |
| Twitter card (`summary_large_image`) | ✅ | layout |
| Favicon / app icon | ✅ | `public/icon.svg` + `icons` in layout |
| robots.txt (allow public, disallow /app /admin /api) | ✅ | `src/app/robots.ts` |
| sitemap.xml | ✅ | `src/app/sitemap.ts` — landing per-locale, blog (sr+en), legal |

## Multilingual SEO — status
| Item | Status | Notes |
|---|---|---|
| hreflang sr-RS / bs-BA / en | ✅ | `alternates.languages` on `/` and `/blog` → `?lang=` URLs |
| canonical per locale | ✅ | `/?lang=<locale>` canonical |
| Localized titles/descriptions | ✅ | from `src/lib/i18n.ts` dictionary |
| Localized blog content | ✅ | Serbian articles (`BLOG_POSTS_SR`) shown for sr/bs; English legacy for en |
| Sitemap alternates per locale | ✅ | landing entries carry `alternates.languages` |
| `<html lang>` per locale | ⚠️ Partial | root layout keeps a single `lang`; making it per-request would force all routes dynamic (breaks SSG legal pages). hreflang + og:locale carry the signal. Follow-up. |

## Structured data (JSON-LD) — status
| Schema | Status | Where |
|---|---|---|
| Organization | ✅ | landing `@graph` |
| SoftwareApplication (offers €0) | ✅ | landing `@graph` |
| FAQPage (from localized FAQ) | ✅ | landing `@graph` |
| BlogPosting | ✅ | `/blog/[slug]` |
| BreadcrumbList | ✅ | `/blog/[slug]` (Home → Blog → Article) |

## Landing structure
- One clear `H1` (hero headline), section `H2`s (Šta radi / Kako radi / Uživo demo / Cene / Česta pitanja), card `H3`s.
- Internal links: header + footer → Blog, Pricing (#pricing), FAQ (#faq), Features (#product), Login, Signup; blog articles link back to Home/Pricing/Signup.
- Keyword-rich but natural Serbian copy (no stuffing).

## Performance basics
- Hero/CTA images: pre-optimized WebP with responsive `srcset` (720/1280/2200; hero ~49KB at 1280w), `fetchpriority=high` on the LCP image, `loading=lazy` + `decoding=async` on below-fold image.
- No layout shift: fixed-height hero demo card; images sized via CSS cover, not intrinsic.
- Motion respects `prefers-reduced-motion`; animations use transform/opacity only.
- No large JS dependencies added (i18n is a plain dictionary; no i18n library).

## What remains (honest)
- Per-request `<html lang>` (needs a dynamic root layout).
- Blog authoring for `bs` (currently Bosnian falls back to the Serbian articles).
- OG image asset (currently text-based OG; a branded 1200×630 image would improve social cards).
- Admin/client app is `noindex` by robots (intended) and not localized.
