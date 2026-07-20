# Google Sheets "bridge" — upustvo za podešavanje

Klijent u podešavanjima nalepi **samo link svoje Google tabele**
(`https://docs.google.com/spreadsheets/d/…`). Platforma ima **jedan** Apps Script
web-app ("bridge") koji prima porudžbine i upisuje ih u tu tabelu. Klijent ne
pravi svoj script i ne mora ništa da kodira.

## Kako radi

1. Bot zabeleži porudžbinu u razgovoru.
2. Aplikacija vidi da je sačuvani link obična Google tabela i šalje POST na
   bridge URL (`SHEETS_BRIDGE_URL`) sa JSON telom:
   `{ "secret": "…", "sheetUrl": "https://docs.google.com/spreadsheets/d/…", ...podaci porudžbine }`
3. Bridge proveri `secret`, otvori tabelu preko `SpreadsheetApp.openByUrl()` i
   dopiše red (a ako je list prazan, prvo upiše zaglavlje).
4. Ako tenant umesto toga nalepi svoj **sopstveni** Apps Script `/exec` link,
   aplikacija šalje direktno na njega (stari režim i dalje radi).

## Korak 1 — napravite bridge script (jednom, za celu platformu)

1. Otvorite <https://script.google.com> (Google nalog platforme) → **New project**.
2. Obrišite sadržaj i nalepite kod ispod:

```javascript
const SECRET = "IZABERITE_DUGACAK_SLUCAJAN_STRING"; // isti kao SHEETS_BRIDGE_SECRET

const HEADER = [
  "order_id", "created_at", "tenant_id", "business_name", "channel",
  "customer_name", "phone", "city", "postal_code", "street_and_number",
  "address", "order_text", "product", "note", "status"
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    if (!SECRET || body.secret !== SECRET) {
      return out({ ok: false, error: "unauthorized" });
    }
    const ss = SpreadsheetApp.openByUrl(body.sheetUrl);
    const sheet = ss.getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADER);
    sheet.appendRow(HEADER.map(function (k) { return body[k] != null ? body[k] : ""; }));
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err).slice(0, 300) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. Sačuvajte projekat (npr. ime "NibaChat Sheets Bridge").

## Korak 2 — objavite kao web app

1. **Deploy → New deployment → tip: Web app**.
2. **Execute as: Me** (script upisuje kao Google nalog platforme).
3. **Who has access: Anyone** (server-side pozivi; pristup i dalje štiti `secret`).
4. Deploy → dozvolite pristup → **kopirajte Web app URL** koji se završava na `/exec`.

## Korak 3 — podesite env varijable (Vercel)

```
SHEETS_BRIDGE_URL    = https://script.google.com/macros/s/…/exec
SHEETS_BRIDGE_SECRET = isti string kao SECRET u scriptu
```

## Korak 4 — jedini korak za klijenta

1. U NibaChat podešavanjima nalepi **link svoje Google tabele**.
2. **Podeli (Share) tu tabelu sa Google nalogom platforme** (nalog pod kojim je
   bridge deployovan) sa pravom **Editor** — jer "Execute as: Me" znači da script
   upisuje kao taj nalog, a može da upisuje samo u tabele koje su sa njim podeljene.

To je sve — porudžbine se od tog trenutka same dopisuju u tabelu.

## Napomene

- Ako bridge env varijable nisu podešene, sinhronizacija se preskače uz
  `sheet_sync_error = bridge_not_configured` na porudžbini (ništa se ne gubi —
  porudžbina je uvek sačuvana u NibaChat panelu).
- Bridge nikad ne baca grešku ka kupcu; neuspeh se vidi na porudžbini i u logovima.
