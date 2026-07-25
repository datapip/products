# GDPR-Ready Shopify GA4 & Google Ads Setup — Entwicklungsdokumentation

## Projektübersicht

Kommerzielles Plug-and-Play Tracking-Setup für Shopify Stores mit DSGVO-konformer
Consent-Logik. Keine Abhängigkeit zu intransparenten 3rd-Party Apps und volle Kontrolle. Verkauft auf Gumroad:
https://datapip.gumroad.com

**Zwei Komponenten:**

1. **Shopify Custom Pixel** — läuft im Shopify Pixel-Sandbox (isolierter iframe),
   liest Shopify-Events, prüft GDPR-Consent, lädt GTM conditional, befüllt dataLayer
2. **GTM Web Container** (`.json`, importierbar) — enthält alle Tags, Trigger und
   Variablen für GA4 und Google Ads inkl. Consent Mode v2

**Was der Käufer bekommt:**

- `shopify-custom-pixel.js` — in Shopify Customer Events einfügen (Custom Pixel)
- `gtm-container.json` — in GTM importieren (Web Container)
- Setup-Anleitung (PDF)

---

## Dateistruktur

| Datei                                   | Zweck                                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `shopify-custom-pixel.js`               | Das Custom Pixel — wird als Custom Pixel in Shopify Customer Events eingefügt. Einzige Datei, die der Käufer im Shopify Admin bearbeitet. |
| `gtm-container.json`                    | Exportierter GTM Web Container mit allen GA4- und Google Ads-Tags. Käufer importiert in sein GTM-Konto.                                   |
| `shopify-custom-pixel-setup-guide.pdf`  | Setup-Anleitung für Käufer (aus `.docx` generiert)                                                                                        |
| `shopify-custom-pixel-setup-guide.docx` | Editierbare Quelldatei der Setup-Anleitung                                                                                                |

**Referenz-Implementierung (nicht Teil des Produkts):**
`d:\Development\projects\digital synergies\shopify\shopify-custom-pixel-gtm.js` —
Produktionsversion für Schiesser AG, v1.5.3. Neue Features hier zuerst testen,
dann auf das Produkt-File portieren (mit Entfernung von Client-spezifischem Code).

---

## Entwicklungs-Workflow

1. Logik in `shopify-custom-pixel.js` entwickeln (orientiert an Referenz-Implementierung)
2. Produkt-agnostische Version sicherstellen: keine festen Domains, keine Client-IDs,
   alle Config-Werte über das `const config = {...}`-Objekt am Dateianfang, das der Käufer direkt
   im Pixel-Code editiert (**nicht** über Shopifys native Pixel-Settings-UI/`pixel.settings.*` —
   ältere Version dieser Doku war hier falsch, im Code kommt `settings` nirgends vor)
3. GTM Container in GTM UI pflegen, dann als `gtm-container.json` exportieren
4. Manuelle End-to-End-Tests im Shopify Development Store (Pixel Sandbox)
5. Setup-Anleitung in `.docx` aktualisieren → PDF exportieren

---

## Custom Pixel — Architektur

### Laufzeitumgebung (Shopify Pixel Sandbox)

Der Code läuft in einem **isolierten Browser-iframe** mit stark eingeschränktem API-Zugriff:

- Kein `document`, `window`, `localStorage` auf Parent-Webseite
- Kein direkter DOM-Zugriff auf Parent-Webseite
- Verfügbare APIs: `analytics.subscribe()`, `sessionStorage` (direkt, kein `browser.*` Wrapper nötig), `api.customerPrivacy.subscribe()`, `init` (Objekt mit initialem Customer-Privacy-/Kundenstatus, im globalen Scope verfügbar), `crypto.subtle` (verfügbar). **Kein** `pixel.settings` — Konfiguration läuft über das `config`-Objekt im Code (siehe "Entwicklungs-Workflow").

### GTM Loading

- GTM wird per Script-Inject in den Pixel-Kontext geladen (Shopify erlaubt das)
- GTM-URL: Standard `https://www.googletagmanager.com/gtm.js?id=GTM-XXXXXXX`
- GTM Container ID kommt aus `config`-Objekt
- Events, die vor GTM-Load eintreffen, werden in `pendingEvents[]` gepuffert
  und nach GTM-Load geflusht
- **Warum `pendingEvents[]` statt direktem `window.dataLayer.push()`**: Auf normalen Webseiten
  spielt gtm.js beim Laden das komplette bestehende `dataLayer`-Array nach — Events, die vor dem
  Laden gepusht wurden, gehen dort nicht verloren. In der Shopify Pixel-Sandbox wurde das
  getestet und **funktioniert nicht zuverlässig**: Events, die direkt vor GTM-Load per
  `window.dataLayer.push()` gepusht wurden, kamen nie in GTM an. Deshalb müssen alle Events, die
  zuverlässig ankommen sollen, über `pushEvent()` laufen (das bei `gtmLoaded === false` manuell
  puffert), nicht direkt über `window.dataLayer.push()`.
  Die `gtag("consent", ...)`-Aufrufe (Consent Default/Update, vor GTM-Load) nutzen weiterhin den
  direkten Push-Pfad (`window.gtag` → `window.dataLayer.push(arguments)`), NICHT `pushEvent()`.
  **Verifiziert** (`/test-purchase-flow`-Läufe vom 2026-07-25, dev-store): in beiden Läufen wurde
  Consent granted, *bevor* GTM lud, und trotzdem kamen alle nachfolgenden GA4/Ads-Requests mit
  `gcs=G111` (granted) an — das befürchtete Verlust-Verhalten trat hier nicht ein. Kein offener
  Pre-Release-Blocker mehr, aber bei zukünftigen Auffälligkeiten hier zuerst nachschauen.

### dataLayer-Struktur

Jedes Event wird als Standard GA4-Event gepusht. **Alle Felder liegen flach im Event-Objekt** —
es gibt keinen `page_data`- oder `user_data`-Wrapper (ältere Version dieser Doku war hier falsch):

```js
window.dataLayer.push({ ecommerce: null }); // flush vorheriges ecommerce Objekt
window.dataLayer.push({
  event: 'purchase',            // GA4 Event Name
  ecommerce: { ... },           // GA4 Ecommerce Objekt
  user: { ... },                // Gehashte + Klartext User-Daten — Key heißt `user`, nicht `user_data`
  new_customer: true,           // nur bei purchase
  customer_type: 'new',         // nur bei purchase
});
```

Nicht-Ecommerce-Events (z. B. `page_view`) pushen ihre Metadaten ebenfalls flach auf Top-Level
(`page_location`, `page_title`, `page_referrer`, `page_hash`, `page_search`, `environment`),
nicht unter einem gemeinsamen Objekt.

---

## Event-Mapping: Shopify → GA4

"Pflichtfelder" = tatsächlich in `EVENT_REQUIRED_PARAMS` validiert (fehlt eines davon, wird das
Event nicht gepusht, sondern stattdessen `datalayer_error`). Weitere Felder wie `coupon`, `tax`,
`shipping`, `item_list_id`/`item_list_name`, `page_title` werden zwar immer mitgeschickt, aber
nicht validiert — ältere Version dieser Doku listete sie fälschlich als Pflichtfelder.

| Shopify Event                      | GA4 Event           | Pflichtfelder (validiert)                        |
| ----------------------------------- | ------------------- | -------------------------------------------------- |
| `page_viewed`                      | `page_view`         | `page_location`                                    |
| `collection_viewed`                | `view_item_list`    | `items[]`                                          |
| `product_viewed`                   | `view_item`         | `currency`, `value`, `items[]`                     |
| `product_added_to_cart`            | `add_to_cart`       | `currency`, `value`, `items[]`                     |
| `product_removed_from_cart`        | `remove_from_cart`  | `currency`, `value`, `items[]`                     |
| `cart_viewed`                      | `view_cart`         | `currency`, `value`                                |
| `checkout_started`                 | `begin_checkout`    | `currency`, `value`, `items[]`                     |
| `checkout_shipping_info_submitted` | `add_shipping_info` | `currency`, `value`, `shipping_tier`, `items[]`    |
| `payment_info_submitted`           | `add_payment_info`  | `currency`, `value`, `payment_type`, `items[]`     |
| `checkout_completed`               | `purchase`          | `currency`, `value`, `transaction_id`, `items[]`   |
| `search_submitted`                 | `search`            | `search_term`                                      |

### Item-Objekt (GA4 Standard)

```js
{
  item_id: "SKU123",
  item_name: "Product Name",
  item_brand: "Brand",
  item_category: "Category > Subcategory",  // aus productType
  item_variant: "Size / Color",
  price: 29.99,
  quantity: 1,
  discount: 5.00,
  index: 0                                   // Position in Liste
}
```

---

## User Data & Hashing

Für Enhanced Conversions (Google Ads) und GA4 User Properties werden PII-Daten
gehasht bevor sie in den dataLayer gepusht werden:

Alle vier Felder landen flach unter `user.*_hash` im dataLayer (nicht `user_data.*`, kein
Array-Wrapper — ältere Version dieser Doku war hier falsch) und werden von der GTM Custom-JS-Variable
`cjs - GAds User-Provided Data Code` auf die von Google Ads erwarteten Feldnamen gemappt:

- **E-Mail**: SHA-256, lowercase, trimmed → `user.email_hash` im dataLayer → `sha256_email_address` im Enhanced-Conversions-Payload
- **Telefon**: SHA-256, lowercase, trimmed (**keine** E.164-Normalisierung — ältere Version dieser Doku war hier falsch) → `user.phone_hash` → `sha256_phone_number`
- **Vorname / Nachname**: Lowercase, trimmed, SHA-256 gehasht → `user.first_name_hash` / `user.last_name_hash`
  im dataLayer, gemappt auf `sha256_first_name` / `sha256_last_name` im GTM Enhanced-Conversions-Payload
  (Google Ads erwartet diese Felder gehasht, nicht im Klartext)

Hash-Implementierung: `crypto.subtle` ist in der Shopify Pixel-Sandbox verfügbar und wird direkt genutzt.

---

## GTM Container — Struktur

### Tags

Es gibt **keinen** eigenen GTM-Tag für Consent-Defaults — die werden direkt im Pixel per
`gtag("consent", "default", ...)` gesetzt, bevor GTM überhaupt lädt (siehe "Consent Mode v2"
unten). Eine ältere Version dieser Doku listete dafür fälschlich einen "Consent Mode Default"-Tag.

| Tag                                          | Typ                       | Trigger                                                                    |
| --------------------------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| GA4 - Configuration                          | GA4 Config                | All Pages (implizit, kein `firingTriggerId` gesetzt)                       |
| GAds - Configuration                         | Google Ads Config         | All Pages (implizit)                                                       |
| GA4 - Event - Page View                      | GA4 Event                 | `ce - page_view`                                                          |
| GA4 - Event - Ecommerce                      | GA4 Event                 | `ce - Ecommerce Events`                                                   |
| GA4 - Event - Search                         | GA4 Event                 | `ce - search`                                                             |
| GAds - Event - Conversion                    | Google Ads Conversion (`awct`) | `ce - purchase`, blockiert durch `ce - No Marketing Consent`         |
| GAds - Remarketing                           | Google Ads Remarketing (`sp`) | `ce - page_view`, blockiert durch `ce - No Marketing Consent`         |
| GAds - Event - User Data (unpause, if allowed) | Enhanced Conversions (`awud`) | `ce - add_shipping_info`, blockiert durch `ce - No Marketing Consent` — **paused** seit 2026-07-13 |

### Variablen (DLV = dataLayer Variable)

Alle DLV-Variablen lesen **flach** aus dem dataLayer — kein `page_data`/`user_data`-Wrapper
(siehe "dataLayer-Struktur" oben). Auszug (vollständige Liste: `gtm-container.json`):

| Variable                                                              | dataLayer-Key                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| `dlv - ecommerce`, `dlv - ecommerce.value/.currency/.transaction_id`  | `ecommerce`, `ecommerce.value`, `.currency`, `.transaction_id` |
| `dlv - page_location/page_title/page_referrer/page_hash/page_search` | `page_location`, `page_title`, … (flach, Top-Level)          |
| `dlv - user.id/.orders_count/.email_hash/.phone_hash/.first_name_hash/.last_name_hash` | `user.*` — Pixel pusht als `user: {...}`, nicht `user_data` |
| `dlv - user.street/.city/.region/.zip/.country`                      | `user.*` — Klartext-Adresse für Enhanced Conversions          |
| `dlv - user.__email/__first_name/__last_name/__phone`                | `user.__*` — Klartext, optional über `pushClearUserData`      |
| `dlv - consent_preferences/consent_analytics/consent_marketing`      | `consent_*`                                                  |
| `dlv - customer_type/search_term/environment`                        | wie benannt                                                   |
| `url - gclid`                                                        | Query-Parameter aus `page_location`                           |

**Plattform-IDs** (`lookup - GA4 Measurement ID`, `lookup - GAds Account ID`,
`lookup - GAds Conversion Label`) sind **Simple-Table-Lookup**-Variablen, keine Constants — sie
wählen anhand von `dlv - environment` (`development`/`production`) den passenden Wert. Käufer
trägt beide Zeilen ein.

**Config-Variablen**: `config - GA4 Configuration Settings`, `config - GA4 Event Settings`,
`config - GAds Configuration Settings`, `config - GAds User-Provided Data` (nutzt
`cjs - GAds User-Provided Data Code`, ein Custom-JS-Variable das das Enhanced-Conversions-Payload
aus den `dlv - user.*`-Variablen baut).

### Triggers

| Trigger                  | Typ                      | Bedingung                                                                                                                                            |
| -------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ce - page_view`          | Custom Event               | `event == page_view`                                                                                                                                |
| `ce - Ecommerce Events`   | Custom Event               | `event` matcht `view_item_list\|select_item\|view_item\|add_to_cart\|remove_from_cart\|view_cart\|begin_checkout\|add_shipping_info\|add_payment_info\|purchase` |
| `ce - purchase`           | Custom Event               | `event == purchase`                                                                                                                                 |
| `ce - search`             | Custom Event               | `event == search`                                                                                                                                   |
| `ce - add_shipping_info`  | Custom Event               | `event == add_shipping_info`                                                                                                                        |
| `ce - consent_update`     | Custom Event               | `event == consent_update`                                                                                                                           |
| `ce - No Analytics Consent` | Custom Event (blockierend) | `consent_analytics != true` — blockiert GA4-Tags                                                                                                  |
| `ce - No Marketing Consent` | Custom Event (blockierend) | `consent_marketing != true` — blockiert GAds-Tags                                                                                                 |
| `ce - No Functional Consent` | Custom Event (blockierend) | `consent_preferences != true`                                                                                                                     |

Es gibt **keinen** separaten "All Pages"- oder "Consent Initialization"-Trigger als Objekt im
Export — GA4/GAds Config-Tags feuern auf GTMs implizitem Built-in-"All Pages"-Trigger (kein
`firingTriggerId` gesetzt), und es gibt keinen GTM-seitigen Consent-Init-Tag (siehe "Tags" oben).

### Consent Mode v2

**Nicht der GTM Container** setzt die Consent-Mode-Defaults — das macht das **Pixel selbst**,
per `gtag("consent", "default", ...)`, noch bevor GTM überhaupt lädt (ältere Version dieser Doku
war hier falsch, inkl. eines nicht existierenden `wait_for_update`-Felds):

```js
gtag("consent", "default", {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
});
```

`gtag()` ist im Pixel ein simpler Wrapper (`window.dataLayer.push(arguments)`) — dieser Push läuft
über den **direkten Pfad**, nicht über `pushEvent()`/`pendingEvents[]` (siehe Warnung oben unter
"GTM Loading").

Bei Consent-Erteilung pusht das Pixel **zwei separate** dataLayer-Einträge — einmal das
`gtag("consent","update", ...)` mit den GTM-Consent-Signalen, einmal ein eigenes
`consent_update`-Custom-Event mit den rohen Shopify-Consent-Flags (booleans, keine
"granted"/"denied"-Strings — ältere Version dieser Doku hatte hier ein erfundenes,
zusammengefasstes `consent`-Objekt):

```js
gtag("consent", "update", {
  analytics_storage: userConsent.analytics ? "granted" : "denied",
  ad_storage: userConsent.marketing ? "granted" : "denied",
  ad_user_data: userConsent.marketing ? "granted" : "denied",
  ad_personalization: userConsent.marketing ? "granted" : "denied",
});

window.dataLayer.push({
  event: "consent_update",
  consent_preferences: userConsent.preferences,
  consent_analytics: userConsent.analytics,
  consent_marketing: userConsent.marketing,
});
```

---

## GDPR / Consent-Implementierung

### Shopify Customer Privacy API

Es wird nur **ein** Event abonniert — `visitorConsentUpdated` wird im Pixel nicht genutzt, und es
gibt keinen separaten `updateConsent()`-Helper (ältere Version dieser Doku war hier falsch, die
Logik liegt inline im Callback):

```js
// Im init-Event verfügbar:
api.customerPrivacy?.subscribe?.("visitorConsentCollected", (event) => {
  userConsent = {
    preferences: event?.customerPrivacy?.preferencesProcessingAllowed,
    analytics: event?.customerPrivacy?.analyticsProcessingAllowed,
    marketing: event?.customerPrivacy?.marketingAllowed,
  };
  // → gtag("consent", "update", {...}) + dataLayer.push({ event: "consent_update", ... })
});
```

### Consent-Kategorien → GTM Consent Mode Mapping

| Shopify Consent                | GTM Consent Signal                                 |
| -------------------------------- | -------------------------------------------------- |
| `analyticsProcessingAllowed`   | `analytics_storage`                                |
| `marketingAllowed`             | `ad_storage`, `ad_user_data`, `ad_personalization` |
| `preferencesProcessingAllowed` | als `consent_preferences` getrackt, gated aktuell aber keinen GTM-Tag (Trigger `ce - No Functional Consent` existiert, ist aber unbenutzt) |

### Checkout-Events ohne Consent

Shopify Best Practice: `purchase`-Events müssen immer gefeuert werden (auch ohne Consent),
da sie für Revenue-Reporting im Shopify Admin nötig sind. GA4 / Google Ads respektieren
Consent Mode intern und verwenden diese Events nur modeliert wenn kein Consent vorliegt.

---

## Sicherheit & Qualität

### Path-bezogene Checks

Im Pixel-Kontext gibt es keine Path Traversal Risiken — der Pixel hat keinen
Filesystem-Zugriff. Sicherheitsfokus liegt auf:

### Ecommerce-Validierung

Vor jedem dataLayer-Push prüft `validateEvent(eventName, params)` die pro Event definierten
Pflichtfelder aus `EVENT_REQUIRED_PARAMS` gegen die **flachen** Top-Level-Keys von `params`
(nicht gegen ein verschachteltes `eventData.ecommerce.*` — ältere Version dieser Doku hatte hier
eine fiktive `isValidEcommerceEvent()`-Funktion mit falscher Struktur). Bei `purchase` ist u. a.
`transaction_id` Pflicht. Bei einem Fehler wird kein Event gepusht, sondern stattdessen ein
`datalayer_error`-Event mit den Validierungsfehlern:

```js
function validateEvent(eventName, params) {
  const requiredParams = EVENT_REQUIRED_PARAMS[eventName]; // z. B. purchase: ["currency","value","transaction_id","items"]
  for (const param of requiredParams) {
    if (!(param in params) || params[param] == null) {
      // fehlt → Fehler sammeln
    }
    // optional: PARAM_VALUE_FORMAT[param] prüft das Format (z. B. currency = /^[A-Z]{3}$/)
  }
  // bei Fehlern: pushError(eventName, ...) statt des eigentlichen Events
}
```

### PII nie ungefiltert

E-Mail und Telefon werden **ausschließlich gehasht** in den dataLayer gepusht.
Klartextwerte werden nicht geloggt. Hashing passiert async vor dem dataLayer-Push.

### Keine externen Dependencies

Der Pixel-Code darf keine `import`/`require` Statements enthalten und keine
externen URLs laden außer GTM. SHA-256 läuft über die native `crypto.subtle.digest("SHA-256", ...)`
Web-Crypto-API — **keine** eigene Inline-Implementierung (ältere Version dieser Doku forderte hier
fälschlich eine Inline-Implementierung; siehe auch "Bekannte Limitierungen" unten).

---

## Produktversioning & Copyright

```
© 2026 datapip.de. All rights reserved.
Single-company license. Redistribution prohibited.
```

- Version im JSDoc-Kommentar-Header des JS: `* Version 1.0.0` (kein `v`-Präfix, kein `//`)
- Semantic Versioning: MAJOR.MINOR.PATCH
  - MAJOR: Breaking Changes (neue Shopify API, inkompatible GTM-Änderungen)
  - MINOR: Neue Features (neue Events, neue Consent-Signale)
  - PATCH: Bugfixes

---

## Bekannte Limitierungen

- **Shopify Checkout Events nur im Custom Pixel**: Standard Web Pixels haben
  keinen Zugriff auf Checkout-Events — nur Custom Pixels
- **Kein technischer Kopierschutz**: JS ist Klartext, Schutz nur rechtlich
- **GTM Container ID muss manuell eingetragen werden**: Keine automatische
  Verknüpfung zwischen Pixel und GTM Container
- **Consent-API-Timing**: `customerPrivacy` ist nur im `init`-Event verfügbar —
  danach nur noch über `subscribe`-Callbacks. Pixel muss consent state intern cachen.
- **SHA-256**: `crypto.subtle` ist verfügbar und wird direkt genutzt — keine Inline-Implementierung nötig
- **Google Ads User Data Tag pausiert**: Das "Google Ads User Data" (Enhanced Conversions) Tag ist seit 2026-07-13
  in GTM pausiert. `/test-purchase-flow`-Läufe prüfen den `ccm/s/collect`-Request-Body deshalb nicht mehr —
  erst wieder aktivieren, wenn der Tag reaktiviert wird.
- ~~`shipping_tier` leer~~ **behoben** (Commit `e660c61`, 2026-07-12): `checkout.delivery.selectedDeliveryOptions[0].type`
  lieferte oft `undefined`; Fallback auf `.title` ergänzt. `/test-purchase-flow`-Lauf vom 2026-07-25 bestätigt
  `ep.shipping_tier=Standard` im `add_shipping_info`-Request — kein bekannter Gap mehr.

---

## Pre-Release Checklist

Vor jeder Veröffentlichung (Gumroad-Upload) **zwingend** prüfen:

### PIIs & Test-IDs entfernen

| Was prüfen          | Wo              | Beispiele                                |
| ------------------- | --------------- | ---------------------------------------- |
| GTM Container IDs   | `.js` + `.json` | `GTM-K7Q2BTR2`, `GTM-P7DCPB6M`           |
| GA4 Measurement IDs | `.js` + `.json` | `G-PMPS13H1QZ`                           |
| Google Ads IDs      | `.js` + `.json` | Conversion ID, Remarketing ID            |
| Client-Domains      | `.js` + `.json` | `shop.schiesser.com`, `ds.schiesser.com` |
| Tagging Server URLs | `.json`         | `https://ds.schiesser.com`               |
| E-Mail-Adressen     | alle Dateien    | Käufer-, Test- oder Entwickler-Emails    |
| Namen / Adressen    | alle Dateien    | Aus Test-Bestellungen                    |
| Telefonnummern      | alle Dateien    | Aus Test-Checkout-Events                 |

**Grep-Befehl für schnellen Check:**

```powershell
# Im products/shopify-setup/ Verzeichnis ausführen:
Select-String -Path "*.js","*.json" -Pattern "GTM-[A-Z0-9]+|G-[A-Z0-9]+|AW-[0-9]+|schiesser|@.*\.com|shop\." -CaseSensitive:$false
```

### Platzhalter-Werte prüfen

Alle IDs im GTM Container müssen Platzhalter sein:

- GA4 Measurement ID Variable → `G-XXXXXXXXXX`
- GAds Conversion ID Variable → `AW-XXXXXXXXX`
- Tagging Server URL → leer oder Kommentar (nur für sGTM-Nutzer relevant)

### GTM Container Export prüfen

Nach dem JSON-Export aus GTM: Container-Account-ID und Property-Referenzen
im JSON-File prüfen — GTM exportiert manchmal interne Account-Metadaten mit.

---

## Referenz-Implementierung: Schiesser AG

`d:\Development\projects\digital synergies\shopify\shopify-custom-pixel-gtm.js`

**Unterschiede zum Produkt:**

- Client-spezifische Domains (`shop.schiesser.com`, `ds.schiesser.com`) → durch Settings ersetzen
- Schiesser-spezifische Emarsys-Integration → entfernen
- Microsoft Ads → optional / separate Erweiterung
- sGTM-spezifische Logik (Custom GTM URL) → Standard GTM URL als Default

**Was 1:1 übertragbar ist:**

- Event-Mapping Logik (Shopify → GA4)
- SHA-256 Hashing
- Pending Events Queue
- Ecommerce Validierung
- Consent State Management
- Item-Object Normalisierung
