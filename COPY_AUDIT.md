# COPY AUDIT — Serbian / Bosnian (NibaChat Agent)

Audit of visible copy as a Serbian/Bosnian language check. The public landing copy
now lives in a single dictionary (`src/lib/i18n.ts`, locales `sr` / `bs` / `en`),
so fixes are made once and stay consistent across the site.

## Fixed

| Bad phrase | Replacement (sr) | Replacement (bs) | Location | Reason |
|---|---|---|---|---|
| „Kupac odgovoren“ | **„Odgovoreno kupcu“** | „Odgovoreno kupcu“ | Hero demo status chip | „Kupac odgovoren“ zvuči kao doslovan prevod („customer answered“); prirodan srpski koristi bezličnu formu „Odgovoreno kupcu“. |
| „Porudžbina uhvaćena“ | **„Porudžbina zabeležena“** | „Narudžba zabilježena“ | Hero demo status chip | „Uhvaćena“ je previše kolokvijalno za status; „zabeležena“ je jasno i profesionalno. |
| „Tim obavešten“ | **„Tim obavešten“** | „Tim obaviješten“ | Hero demo status chip | Zadržano — gramatički ispravno; bs koristi ijekavicu „obaviješten“. |
| „One login connects…“, „Connect Facebook / Instagram“ | **„Jedno prijavljivanje povezuje…“**, **„Poveži Facebook / Instagram“** | — | Admin → Kanali tab | Tab je bio na engleskom; preveden na prirodan srpski. |
| „Meta app is not configured…“ | **„Nedostaje Meta App ID ili App Secret…“** + link na Podešavanja | — | Admin → Kanali / Meta panel | Jasna poruka + akcija umesto tihe greške. |
| „Connected channels / None connected“ | **„Povezani kanali / Ništa još nije povezano“** | — | Admin → Kanali tab | Prevod na srpski. |
| Instagram DM (u demo kartici) | **„Instagram poruka“** | „Instagram poruka“ | Hero demo kanal oznaka | „Poruka“ je prirodnije od „DM“ za širu publiku. |
| Bosnian ekavica u dvojezičnim stringovima | **ijekavica**: cijena, vrijeme→„/mjesec“, narudžba, riješena, provjeri, povjerenje, zauvijek | — | Bosanski rečnik | Bosanski standard je ijekavica; ekavski oblici bi zvučali srpski, ne bosanski. |

## Terminology (dosledno kroz sajt)

| EN | SR / BS |
|---|---|
| Knowledge | Baza znanja / izvori znanja |
| Products | Proizvodi |
| Orders | Porudžbine (sr) / Narudžbe (bs) |
| Conversations | Razgovori |
| Handoff | Predaja timu / Ljudska podrška |
| Bot live / paused | Bot je aktivan / Bot je pauziran |
| Customer answered | Odgovoreno kupcu |
| Connect Facebook / Instagram | Poveži Facebook / Instagram |
| App Settings | Podešavanja aplikacije |
| Meta configuration check | Meta konfiguracija |

## Scope note

- **Public landing + blog**: fully audited, dictionary-driven, sr/bs/en. This is the
  customer-facing, SEO-indexed surface and the one the brief flagged.
- **Bot reply templates** (`src/lib/engine.ts`): Serbian templates with persiranje
  (formal „Vi“) were written and audited in an earlier pass; the „unknown answer“,
  handoff and order-collection replies read naturally.
- **Admin / client dashboard UI**: currently English (functional internal tooling,
  not SEO-indexed, behind auth). The Serbian strings newly added there (Channels tab,
  Meta panel) are natural. A full Serbian translation of the entire admin/client app
  is a larger, separate effort and is **not** yet done — documented here honestly
  rather than half-translated.
