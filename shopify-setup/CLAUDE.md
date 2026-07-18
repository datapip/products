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
   alle Config-Werte über die Pixel-Settings (`pixel.settings.*`)
3. GTM Container in GTM UI pflegen, dann als `gtm-container.json` exportieren
4. Manuelle End-to-End-Tests im Shopify Development Store (Pixel Sandbox)
5. Setup-Anleitung in `.docx` aktualisieren → PDF exportieren

---

## Custom Pixel — Architektur

### Laufzeitumgebung (Shopify Pixel Sandbox)

Der Code läuft in einem **isolierten Browser-iframe** mit stark eingeschränktem API-Zugriff:

- Kein `document`, `window`, `localStorage` auf Parent-Webseite
- Kein direkter DOM-Zugriff auf Parent-Webseite
- Verfügbare APIs: `analytics.subscribe()`, `sessionStorage` (direkt, kein `browser.*` Wrapper nötig), `pixel.settings.*`, `init` event für Customer Privacy, `crypto.subtle` (verfügbar)

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
  ⚠️ Die `gtag("consent", ...)`-Aufrufe (Consent Default/Update, vor GTM-Load) nutzen aktuell
  weiterhin den direkten Push-Pfad (`window.gtag` → `window.dataLayer.push(arguments)`), NICHT
  `pushEvent()`. Falls das gleiche Verlust-Verhalten dort zutrifft, käme der initiale Consent-Status
  nie bei GTM an. Vor Release verifizieren, ob Consent-Updates zuverlässig ankommen — insbesondere
  nachdem `gtm_auth`/`gtm_preview` aus dem Snippet entfernt wurden (siehe Pre-Release Checklist),
  da das Preview/Debug-Verhalten von gtm.js sich vom Live-Container unterscheiden kann und die
  ursprüngliche Beobachtung ggf. damit zusammenhing statt mit der Sandbox selbst.

### dataLayer-Struktur

Jedes Event wird als Standard GA4-Event gepusht:

```js
window.dataLayer.push({ ecommerce: null }); // flush vorheriges ecommerce Objekt
window.dataLayer.push({
  event: 'purchase',            // GA4 Event Name
  ecommerce: { ... },           // GA4 Ecommerce Objekt
  user_data: { ... },           // Hashed user data für Ads
  page_data: { ... },           // Page metadata
});
```

---

## Event-Mapping: Shopify → GA4

| Shopify Event                      | GA4 Event           | Pflichtfelder                                                       |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------- |
| `page_viewed`                      | `page_view`         | `page_location`, `page_title`                                       |
| `collection_viewed`                | `view_item_list`    | `item_list_id`, `item_list_name`, `items[]`                         |
| `product_viewed`                   | `view_item`         | `currency`, `value`, `items[]`                                      |
| `product_added_to_cart`            | `add_to_cart`       | `currency`, `value`, `items[]`                                      |
| `product_removed_from_cart`        | `remove_from_cart`  | `currency`, `value`, `items[]`                                      |
| `cart_viewed`                      | `view_cart`         | `currency`, `value`, `items[]`                                      |
| `checkout_started`                 | `begin_checkout`    | `currency`, `value`, `items[]`, `coupon`                            |
| `checkout_shipping_info_submitted` | `add_shipping_info` | `currency`, `value`, `items[]`, `shipping_tier`                     |
| `payment_info_submitted`           | `add_payment_info`  | `currency`, `value`, `items[]`, `payment_type`                      |
| `checkout_completed`               | `purchase`          | `transaction_id`, `currency`, `value`, `tax`, `shipping`, `items[]` |
| `search_submitted`                 | `search`            | `search_term`                                                       |

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

- **E-Mail**: SHA-256, lowercase, trimmed → `user_data.email_address` (als Array)
- **Telefon**: SHA-256, E.164-Format normalisiert → `user_data.phone_number` (als Array)
- **Vorname / Nachname**: Lowercase, trimmed, SHA-256 gehasht → `first_name_hash` / `last_name_hash`
  im dataLayer, gemappt auf `sha256_first_name` / `sha256_last_name` im GTM Enhanced-Conversions-Payload
  (Google Ads erwartet diese Felder gehasht, nicht im Klartext — ältere Version dieser Doku war hier falsch)

Hash-Implementierung: `crypto.subtle` ist in der Shopify Pixel-Sandbox verfügbar und wird direkt genutzt.

---

## GTM Container — Struktur

### Tags

| Tag                    | Typ                    | Trigger                        |
| ---------------------- | ---------------------- | ------------------------------ |
| GA4 Configuration      | GA4 Config             | All Pages (consent-aware)      |
| GA4 Ecommerce Events   | GA4 Event              | Ecommerce Events Trigger       |
| GA4 Page View          | GA4 Event              | Page View Trigger              |
| GA4 Search             | GA4 Event              | search Event                   |
| Google Ads Conversion  | Google Ads             | purchase Event                 |
| Google Ads Remarketing | Google Ads Remarketing | All Pages                      |
| Google Ads User Data (Enhanced Conversions) | Google Ads | add_shipping_info / add_payment_info / purchase — **paused** seit 2026-07-13 |
| Consent Mode Default   | Consent Initialization | Consent Initialization Trigger |

### Variablen (DLV = dataLayer Variable)

| Variable              | Typ      | dataLayer-Key                     |
| --------------------- | -------- | --------------------------------- |
| DLV - Ecommerce       | DLV      | `ecommerce`                       |
| DLV - Event           | DLV      | `event`                           |
| DLV - Page Location   | DLV      | `page_data.page_location`         |
| DLV - Page Title      | DLV      | `page_data.page_title`            |
| DLV - Page Type       | DLV      | `page_data.page_type`             |
| DLV - User ID         | DLV      | `page_data.user_id`               |
| DLV - User Data       | DLV      | `user_data`                       |
| DLV - Shop Country    | DLV      | `page_data.shop_country`          |
| GA4 Measurement ID    | Constant | `G-XXXXXXXXXX` (Käufer trägt ein) |
| GAds Conversion ID    | Constant | `AW-XXXXXXXXX` (Käufer trägt ein) |
| GAds Conversion Label | Constant | (Käufer trägt ein)                |

### Triggers

| Trigger                | Typ                    | Bedingung                                                                                                                                            |
| ---------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| All Pages              | Page View              | —                                                                                                                                                    |
| Ecommerce Events       | Custom Event           | `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase`, `view_item_list` |
| Page View Event        | Custom Event           | `page_view`                                                                                                                                          |
| Purchase Event         | Custom Event           | `purchase`                                                                                                                                           |
| Search Event           | Custom Event           | `search`                                                                                                                                             |
| Consent Initialization | Consent Initialization | —                                                                                                                                                    |

### Consent Mode v2

Der GTM Container setzt Consent Mode Default-Werte bei Initialisierung:

```js
gtag("consent", "default", {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  wait_for_update: 500,
});
```

Das Custom Pixel sendet Consent-Updates via dataLayer:

```js
window.dataLayer.push({
  event: "consent_update",
  consent: {
    ad_storage: "granted", // wenn marketing consent
    analytics_storage: "granted", // wenn analytics consent
    ad_user_data: "granted",
    ad_personalization: "granted",
  },
});
```

---

## GDPR / Consent-Implementierung

### Shopify Customer Privacy API

```js
// Im init-Event verfügbar:
api.customerPrivacy.subscribe('visitorConsentCollected', (consent) => {
  // consent.analyticsProcessingAllowed
  // consent.marketingAllowed
  // consent.saleOfDataAllowed (US)
  updateConsent(consent);
});
api.customerPrivacy.subscribe('visitorConsentUpdated', (consent) => { ... });
```

### Consent-Kategorien → GTM Consent Mode Mapping

| Shopify Consent              | GTM Consent Signal                                 |
| ---------------------------- | -------------------------------------------------- |
| `analyticsProcessingAllowed` | `analytics_storage`                                |
| `marketingAllowed`           | `ad_storage`, `ad_user_data`, `ad_personalization` |

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

Vor jedem dataLayer-Push wird geprüft:

- `items[]` Array vorhanden und nicht leer
- `currency` vorhanden
- `value` ist eine Zahl
- Bei `purchase`: `transaction_id` vorhanden

```js
function isValidEcommerceEvent(eventData) {
  if (!eventData.ecommerce || !Array.isArray(eventData.ecommerce.items))
    return false;
  if (!eventData.ecommerce.currency) return false;
  // ...
  return true;
}
```

### PII nie ungefiltert

E-Mail und Telefon werden **ausschließlich gehasht** in den dataLayer gepusht.
Klartextwerte werden nicht geloggt. Hashing passiert async vor dem dataLayer-Push.

### Keine externen Dependencies

Der Pixel-Code darf keine `import`/`require` Statements enthalten und keine
externen URLs laden außer GTM und `crypto` (falls verfügbar). SHA-256 muss
inline implementiert sein.

---

## Produktversioning & Copyright

```
© 2026 datapip.de. All rights reserved.
Single-company license. Redistribution prohibited.
```

- Version im Kommentar-Header des JS: `// v1.0.0`
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
