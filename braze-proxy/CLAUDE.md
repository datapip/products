# Braze sGTM Proxy Client — Entwicklungsdokumentation

## Projektübersicht

Kommerzielles Server-Side GTM (sGTM) Custom Client Template, das Braze-Traffic
über eine First-Party-Domain leitet. Verkauft auf Gumroad unter:
https://datapip.gumroad.com/l/braze-sgtm-proxy

**Zwei Funktionen:**
1. Web SDK Delivery — liefert `braze.min.js` (und `.min.js.map`) vom eigenen sGTM-Container statt von `js.appboycdn.com`
2. API Proxy — leitet alle `/api/v3/` Tracking-Requests an den Braze SDK Endpoint weiter

---

## Dateistruktur

| Datei | Zweck |
|---|---|
| `custom-client-braze-proxy.js` | Entwicklungsdatei — enthält nur den Sandboxed JS Code. Hier werden Änderungen entwickelt. |
| `custom-client-braze-proxy.tpl` | Produktionsdatei — vollständiges GTM Template (INFO + PARAMETERS + JS + PERMISSIONS + TESTS + NOTES). Dies ist die Datei, die verkauft wird. |
| `custom-client-braze-proxy-setup-guide.pdf` | Setup-Anleitung für Käufer (aus `.docx` generiert) |
| `custom-client-braze-proxy-setup-guide.docx` | Editierbare Quelldatei der Setup-Anleitung |

**Workflow bei Änderungen:**
1. Logik in `custom-client-braze-proxy.js` entwickeln und testen
2. JS-Code in den `___SANDBOXED_JS_FOR_SERVER___` Abschnitt von `custom-client-braze-proxy.tpl` übertragen
3. Tests im `___TESTS___` Abschnitt der `.tpl` aktualisieren
4. `.tpl` in GTM importieren, Preview-Tests ausführen

---

## TPL-Dateiformat

GTM Template-Dateien bestehen aus fest benannten Abschnitten, getrennt durch `___SECTION_NAME___`:

```
___INFO___          JSON-Metadaten (Typ, Name, Beschreibung, Brand, Icon)
___TEMPLATE_PARAMETERS___   JSON-Array der Konfigurationsfelder
___SANDBOXED_JS_FOR_SERVER___  Der eigentliche JavaScript-Code
___SERVER_PERMISSIONS___    JSON-Array der benötigten sGTM-Permissions
___TESTS___         YAML-Liste der Testszenarien
___NOTES___         Freitext-Dokumentation (Markdown)
```

**Wichtig:** JSON in der `.tpl` verwendet `>` für `>`. Beim direkten Bearbeiten
der Datei mit PowerShell/Regex muss darauf geachtet werden.

---

## Template-Parameter

| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `API_ENDPOINT` | TEXT | Ja (NON_EMPTY) | Braze SDK Endpoint, z.B. `https://sdk.iad-05.braze.com` |
| `ALLOWED_API_KEYS` | SIMPLE_TABLE | Nein | Whitelist für `x-braze-api-key` Header. Leer = alle erlaubt |
| `ALLOWED_ORIGINS` | SIMPLE_TABLE | Nein | Whitelist für Origin/Referer. Leer = alle erlaubt. REGEX-Validator verhindert Trailing Slash |
| `SDK_TIMEOUT` | TEXT | Nein | Timeout für CDN-Requests in ms (Default: 5000) |
| `API_TIMEOUT` | TEXT | Nein | Timeout für API-Requests in ms (Default: 10000) |
| `ADDITIONAL_HEADERS` | SIMPLE_TABLE | Nein | Zusätzliche Braze-Header, falls neu eingeführt |

---

## Architektur & Router-Logik

```
Request eingehend
    │
    ├─ /web-sdk/*.min.js oder *.min.js.map  → isSdkPath() + isSafePath()
    │       │
    │       ├─ Referer nicht in Allowlist → 403
    │       └─ Upstream: https://js.appboycdn.com + Pfad
    │               → handleSdkSuccess() oder handleFailure()
    │
    └─ /api/v3/*  → isSafePath()
            │
            ├─ Origin nicht in Allowlist → 403
            ├─ OPTIONS (Preflight) → 204 + CORS-Headers
            ├─ x-braze-api-key fehlt oder ungültig → 403
            └─ Forward an CONFIG.brazeBaseUrl + Pfad
                    → handleApiSuccess() oder handleFailure()
```

---

## Sicherheitsimplementierungen

### Path Traversal (`isSafePath`)
Blockiert Pfade mit `..` oder `//`. Verhindert Directory Traversal Angriffe.

### Referer-Prefix-Bypass-Fix (`isAllowedReferer`)
Einfaches `indexOf() === 0` würde `https://example.com.attacker.com` durchlassen,
wenn `https://example.com` in der Allowlist steht. Fix: Nach dem Origin-Präfix wird
geprüft, ob das nächste Zeichen `/`, `?`, `#` oder End-of-String ist.

```js
const after = normalized.slice(origin.length);
if (after === "" || after[0] === "/" || after[0] === "?" || after[0] === "#")
  return true;
```

### X-Forwarded-For
Eingehender `x-forwarded-for` Header vom Client wird **nicht weitergeleitet** —
nur `getRemoteAddress()` (die verifizierte Server-IP) wird gesetzt. Verhindert
IP-Spoofing.

### Allowlist-Open-by-Default (bewusstes Design)
Wenn `ALLOWED_ORIGINS` oder `ALLOWED_API_KEYS` leer sind, werden alle Requests
durchgelassen. Dies ist gewollt für einfaches Onboarding, sollte aber in der
Dokumentation klar kommuniziert werden.

### API-Key Logging
Der `x-braze-api-key` Wert wird **nie** geloggt — nur "no valid api key" als
Fehlermeldung im Preview-Modus.

---

## CORS-Verhalten

- **SDK-Pfad**: Setzt `access-control-allow-origin` nur wenn ein `origin`-Header
  vorhanden ist (für `<script crossorigin>` und fetch()-Aufrufe)
- **API-Pfad**: Setzt vollständige CORS-Header vor dem Preflight-Check, inkl.
  `access-control-allow-credentials: true` für Cookie-basierte Sessions
- **Blockierte Response-Headers**: `content-length`, `transfer-encoding`,
  `connection`, `content-encoding`, `access-control-allow-origin`,
  `access-control-allow-credentials` werden nicht vom Upstream durchgeleitet
  (Hop-by-Hop-Headers)

---

## Standard-Braze-Headers (`CONFIG.standardHeaders`)

Diese Liste ist **zwingend erforderlich**. In sGTMs Sandbox gibt es keine Möglichkeit,
alle Headers pauschal weiterzuleiten — jeder Header muss explizit per
`getRequestHeader(name)` gelesen werden. Die Liste enthält alle bekannten
Braze-SDK-Headers (Stand SDK v6.x):

- `x-braze-sdk-version`, `x-braze-request-id`, `x-braze-sdk-flavor`
- `x-braze-api-key`, `x-braze-datacenters`, `x-braze-device-id`
- `x-braze-datarequest`, `braze-sync-retry-count`, `x-braze-last-req-ms-ago`
- `x-braze-req-attempt`, `x-braze-triggersrequest`, `x-requested-with`
- `x-ratelimit-limit`, `x-braze-contentcardsrequest`, `x-braze-req-tokens-remaining`
- `content-type`, `user-agent`, `origin`, `referer`

Falls Braze neue Headers einführt → `ADDITIONAL_HEADERS` Parameter nutzen.

---

## sGTM-Sandbox-Einschränkungen

- **Kein `Promise`** — `sendHttpRequest` gibt ein Thenable-Objekt zurück.
  In Tests muss ein manuelles Thenable gemockt werden:
  ```js
  mock('sendHttpRequest', (url, options) => ({
    then: (fn) => { fn({ statusCode: 200, headers: {}, body: '' }); return { catch: () => {} }; }
  }));
  ```
- **Kein `fetch`, kein `XMLHttpRequest`** — nur `sendHttpRequest`
- **Kein `console.log`** — nur `logToConsole` (via `require`)
- **Kein nativer `JSON`** — muss per `require("JSON")` importiert werden
- **`makeString` und `makeNumber`** sind sGTM-eigene Hilfsfunktionen für
  sichere Typkonvertierung

---

## Tests (sGTM Test-Tab)

Tests laufen in einer Sandbox, die die sGTM APIs mockt. Permissions werden in
Tests **nicht** erzwungen — nur Deployment testet echte Permissions.

Aktuelle Testszenarien:
1. **WebSDK fetch - no allowlist** — Kein Origin konfiguriert, Request wird durchgelassen
2. **WebSDK fetch - referer in allowlist** — Gültiger Referer, SDK wird ausgeliefert
3. **WebSDK fetch - referer not in allowlist** — Ungültiger Referer → 403

Fehlende Tests (mögliche Erweiterungen):
- API-Pfad Erfolg (POST mit gültigem API-Key)
- API-Pfad geblockt (ungültiger API-Key)
- OPTIONS Preflight → 204
- CDN-Fehler → 502
- Path Traversal geblockt

---

## Permissions

| Permission | Einstellung | Begründung |
|---|---|---|
| `read_request` | any | Liest Pfad, Headers, Body, Query |
| `return_response` | — | Response zurückgeben |
| `access_response` | writeResponseAccess: any | Status, Body und Headers setzen |
| `send_http` | allowedUrls: any | Dynamische URLs (CDN + konfigurierbarer Endpoint) |
| `logging` | debug only | Logs nur im Preview-Modus |

**Hinweis zu `writeHeaderAccess: "specific"`:** In der exportierten `.tpl` steht
`writeHeaderAccess: "specific"` ohne gelistete Headers. Da `writeResponseAccess: "any"`
gesetzt ist, werden Headers trotzdem geschrieben — in der GTM-UI ist nur
"Allowed Response Access: Any" sichtbar und relevant.

---

## Copyright & Lizenz

```
© 2026 datapip.de. All rights reserved.
Single-company license. Redistribution prohibited.
```

Lizenztext steht in:
- Erster Zeile des JS-Codes (Kommentar)
- Anfang des `___NOTES___` Abschnitts

---

## Bekannte Limitierungen

- **Kein technischer Kopierschutz** — `.tpl` ist Klartext, jeder der die Datei
  hat kann den Code lesen. Schutz erfolgt nur rechtlich über Copyright.
- **Kein automatisches Update** — bei Breaking Changes in der Braze API muss
  der Käufer manuell aktualisieren
- **`send_http` allowedUrls: any** — kann nicht eingeschränkt werden, da der
  Braze Endpoint zur Laufzeit konfigurierbar ist
- **Braze SDK Version** — getestet mit v5.x und v6.x. Bei Major-Versionssprüngen
  können neue Headers nötig werden

---

## Braze-spezifisches Wissen

- **SDK Endpoint** findet man in Braze unter: Settings > App Settings > SDK Endpoint
- **API Key (Identifier)** findet man unter: Settings > App Settings > Identifier
- **CDN URL**: `https://js.appboycdn.com` — fest verdrahtet, ändert sich selten
- **SDK Dateipfad**: `/web-sdk/{version}/braze.min.js` — Version wird vom Client
  im Pfad mitgegeben, der Proxy leitet blind weiter
- **`baseUrl` in `braze.initialize()`** steuert nur API-Calls (`/api/v3/...`),
  **nicht** wo das JS-File geladen wird — das steuert der `<script src>` Tag
