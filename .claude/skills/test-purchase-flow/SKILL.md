---
name: test-purchase-flow
description: Live browser test of the Shopify custom pixel's ecommerce events (view_item through purchase) on the dev store, opt-in consent only, verifying both GA4 and Google Ads tags fire per the GTM container. Completes a real test order via the Bogus Payment Gateway each run. Manual only, run via /test-purchase-flow.
disable-model-invocation: true
allowed-tools: mcp__playwright__browser_navigate mcp__playwright__browser_snapshot mcp__playwright__browser_click mcp__playwright__browser_type mcp__playwright__browser_network_requests mcp__playwright__browser_network_request mcp__playwright__browser_console_messages mcp__playwright__browser_tabs mcp__playwright__browser_wait_for mcp__playwright__browser_close Bash(mkdir -p ".playwright-mcp/test-purchase-flow") Bash(rm -f *)
---

Runs a live end-to-end test of `shopify-custom-pixel.js`'s ecommerce event chain — `view_item`, `add_to_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase` — against the Shopify dev store. **Opt-in consent only** (no opt-out branch — that's covered by `/test-page-view`). Sibling of `/test-page-view`; keep output conventions consistent with it.

**This completes a real purchase every run**, using the store's Bogus Payment Gateway (test card `1` = success), creating a genuine test order in the dev store admin. That was a deliberate choice (validating `purchase` — the highest-stakes event, with `transaction_id` and revenue data — outweighs the minor cleanup cost). Periodically archive/delete the accumulated test orders in admin; this skill does not do that itself.

## Test data

- Email: `pip@datapip.de`
- First/last name: `test` / `test`
- Address: `Hollywood Blvd`, Hollywood, Florida, `33081`, US
- Card: number `1`, expiry `01 / 29`, security code `123` (Bogus Gateway test values — "Name on card" auto-fills from the shipping name, leave it)

## Target

- Admin pixel settings: `https://admin.shopify.com/store/dev-store-kcb1ukk9/settings/customer_events/pixels/custom/142311640`
- Product under test: `https://dev-store-kcb1ukk9.myshopify.com/products/the-multi-location-snowboard`
- GTM container reference: `shopify-setup/GTM_Workspace.json` (the exported GTM container) determines which GA4/Google Ads tags fire for which event. Current dev-container IDs: GA4 Measurement ID `G-LL2RM9PHRK`, Google Ads Account ID `AW-12345678` (placeholder), Google Ads Conversion Label `AnExaMPleC0Nv3rS10nLaBel` (placeholder). Per the container: "GA4 Ecommerce Events" (tag id 52) covers `view_item`/`add_to_cart`/`begin_checkout`/`add_shipping_info`/`add_payment_info`/`purchase` (needs `analytics_storage`) — **no Google Ads tag maps directly to those events**, except two: "GAds Remarketing" (id 70) fires on the `page_view` trigger, which the product-page load in step 2 also emits (needs full marketing consent); and "GAds Conversion" (id 76) fires on `purchase` only (needs `ad_storage`+`ad_user_data`). "GAds User Data" (id 82, enhanced conversions) is wired to `add_shipping_info`/`add_payment_info`/`purchase`. Confirmed live on 2026-07-12: it does send its own request — a POST to `ad.doubleclick.net/ccm/s/collect` — but the hashed user data (`user.email_hash` etc.) rides in the POST **body**, not the URL, so it's invisible in a plain `network.txt` dump. Step 7 captures that body directly via `browser_network_request`.
- Artifacts go to `.playwright-mcp/test-purchase-flow/network.txt`, `.playwright-mcp/test-purchase-flow/console.log`, and `.playwright-mcp/test-purchase-flow/gads-user-data-body.txt` (repo root, fixed filenames, overwritten each run). The output directory is gitignored and won't exist on a fresh clone — run `mkdir -p ".playwright-mcp/test-purchase-flow"` first (no-op if it already exists).

## Steps

### 1. Get an opt-in storefront session

Same as `/test-page-view` steps 1–2: navigate to the admin URL (handle login via `AskUserQuestion` if redirected), click "Test", switch to the new storefront tab.

Then get to a granted consent state — **try both paths, since which one is needed varies by prior session state**:
1. Snapshot the page. If a cookie consent dialog with an "Accept" button is present, click it.
2. If no dialog is present (consent was already decided in a prior run this session, denied or otherwise), click the "Cookie preferences" link in the footer (`/policies/#shopifyReshowConsentBanner`) to force the fuller preferences panel open, then click "Accept all" in it.

Either way, don't proceed until you've confirmed consent is actually granted — pull console messages (debug level) and look for a `dataLayer.push - event: consent_update` entry with `analytics_storage`/`ad_storage`/etc. all `"granted"`. If you only see `"denied"`, the accept click didn't register — retry.

### 2. Product page — verify `view_item`

Navigate to the product URL above. Wait ~1s. Pull network requests filtered `google-analytics|googleadservices|doubleclick` (`static: true`).

Assert:
- A request with `en=view_item` exists, with `cu=USD`, `epn.value=729.95`, and `pr1=` containing `id51714210300120` and `The Multi-location Snowboard`.
- A Google Ads request also fired here: the page load itself emits a `page_view` dataLayer event before `view_item`, and "GAds Remarketing" is wired to that same `page_view` trigger (see Target note above). Look for a hit to `googleadservices.com`, `doubleclick.net`, or `google-analytics.com/g/collect` with `tid=AW-12345678`. This is the first run checking Google Ads traffic in this skill — flag as a finding (not a failure) if it's absent or shaped differently, and describe what you actually observed.

### 3. Add to cart — verify `add_to_cart`

Snapshot, click the "Add to cart" button. Wait ~1s. Pull network requests again (same filter as step 2).

Assert: a request with `en=add_to_cart` exists, same item/value data as above. No Google Ads tag maps directly to `add_to_cart` per `GTM_Workspace.json` — don't expect or hunt for a separate Google Ads hit here. This opens a cart drawer with a "Check out" button.

### 4. Start checkout — verify `begin_checkout`

Click "Check out" in the cart drawer. This navigates the same tab to a Shopify-hosted checkout URL (`/checkouts/cn/...`). Wait ~1s, pull network requests (same filter as step 2).

Assert: a request with `en=begin_checkout` exists with the same item/value data. No Google Ads tag maps directly to `begin_checkout` either — same reasoning as step 3.

### 5. Fill contact + shipping — verify `add_shipping_info`

This is a single-page checkout (Contact, Delivery, Payment all visible at once — no "Continue to shipping" step). Snapshot to get current field refs (they're regenerated each run), then:

1. Fill "Email" → `pip@datapip.de`
2. Fill "First name" → `test`, "Last name" → `test`
3. Type `Hollywood Blvd` into the "Address" combobox. It shows an autocomplete suggestions listbox — snapshot again and pick the option whose text is exactly `Hollywood Blvd, Hollywood FL 33081, United States` (there will be several similarly-named streets in other cities; match on the FL 33081 one). Selecting it auto-fills City, State, and ZIP correctly — verify via snapshot (City: Hollywood, State: Florida selected, ZIP: 33081). If no such exact suggestion appears, fall back to filling City/State/ZIP manually via the visible fields.
4. A "Shipping method" section and radio group appears automatically once the address is complete (usually auto-selects "Standard"). Leave it as-is.

Wait ~1s, pull network requests (same filter as step 2).

Assert: a request with `en=add_shipping_info` exists. Note: in past runs, `ep.shipping_tier=` has come back **empty** in this request even though the shipping method radio shows "Standard" selected — this is a known data-quality gap in the pixel (`checkout.delivery.selectedDeliveryOptions[0].type` isn't resolving), not a step-execution failure. Report it as a flagged finding, not an assertion failure — don't retry the flow because of it. "GAds User Data" (enhanced conversions) is also wired to this event per the container, but as noted in Target above, don't hunt for a standalone Google Ads request tied to it — it's expected to annotate a later hit rather than send its own.

### 6. Fill payment — verify `add_payment_info`

The card fields live in separate iframes (Card number / Expiration / Security code / Name on card each in their own iframe, with dynamic iframe names that change every run — always snapshot first and find the current refs by role+accessible name, never hardcode iframe names).

1. Fill "Card number" → `1`
2. Fill "Expiration date (MM / YY)" → `01 / 29`
3. Fill "Security code" → `123`
4. Leave "Name on card" as its auto-filled value (from shipping name) and "Use shipping address as billing address" checked (default).

`add_payment_info` does not appear to fire automatically on field completion here (unlike the address step) — it fires together with `purchase` after clicking "Pay now" in step 7. Don't wait for it separately; verify both in step 7's network pull.

### 7. Complete purchase — verify `add_payment_info` and `purchase`

Click "Pay now". Wait for navigation to the `/thank-you` order confirmation page (poll with `browser_wait_for` on time, a few seconds — order processing takes a moment). Pull network requests filtered `google-analytics|googleadservices|doubleclick` once on the thank-you page.

Assert:
- A request with `en=add_payment_info` exists (same known-empty-`payment_type` caveat as shipping_tier above — flag, don't fail).
- A request with `en=purchase` exists with a non-empty `ep.transaction_id`, `epn.value=729.95`, `cu=USD`, and `epn.shipping`/`epn.tax` present (values will vary; just confirm the keys are there with numeric values, not missing).
- A Google Ads conversion request also fired: "GAds Conversion" (tag id 76, type `awct`) is wired to the `purchase` trigger, gated on `ad_storage`+`ad_user_data` consent (both granted under "Accept all"). Look for a hit to `googleadservices.com`, `doubleclick.net`, or `google-analytics.com/g/collect` carrying `tid=AW-12345678` (or the `AnExaMPleC0Nv3rS10nLaBel` placeholder conversion label), ideally with an order/value/currency lining up with the GA4 purchase hit's `ep.transaction_id`/`epn.value`/`cu`. This is the first run asserting Google Ads conversion traffic — if the parameter names don't match this description, don't force-fail: save what's actually there and describe it plainly in the report.

"GAds User Data" (tag id 82, enhanced conversions) sends its hashed user data in a POST **body**, not the URL — invisible in the `network.txt` dump above, which only records method/URL/status. Capture it directly:
1. In the network pull's numbered list, find the POST(s) to `ad.doubleclick.net/ccm/s/collect` (Google's Enhanced Conversions / Consent Mode collect endpoint). If there's more than one, prefer the one positioned closest to the `add_payment_info`/`purchase` hits.
2. Call `browser_network_request` with that entry's `index` and `part: "request-body"`, saving to `.playwright-mcp/test-purchase-flow/gads-user-data-body.txt` via `filename`.
3. Cross-reference the body against console.log: the pixel exposes a hashed email as `user.email_hash` in the `user_update`/`add_shipping_info`/`add_payment_info`/`purchase` dataLayer pushes (a 64-char hex string) once the checkout email is known. If that hash — or another hashed-looking value — appears in the captured body, that's positive confirmation enhanced-conversions data is reaching Google Ads; report it as a pass. If the `ccm/s/collect` POST is missing, or its body doesn't contain the hash, report that plainly as a finding (not a failure) — this skill hasn't fully reverse-engineered the enhanced-conversions wire format, so an absence here is something to investigate, not an assumed bug.

### 8. Save artifacts and report

Pull network requests (filtered `google-analytics|googleadservices|doubleclick`, `static: true`) once, from the thank-you page — network request history persists across page navigations within a tab, so this one pull captures **all six events from `view_item` onward**, plus any Google Ads hits. Save to `.playwright-mcp/test-purchase-flow/network.txt` via `filename`.

Console message history does **not** persist across a hard page navigation (`all: false` scopes to "since last navigation") — and "Check out" → the checkout page is one. So a single console pull from the thank-you page only covers `begin_checkout` onward, missing `view_item`/`add_to_cart` (those happened on the product page, before that navigation boundary). Save that pull anyway to `.playwright-mcp/test-purchase-flow/console.log` via `filename` — it's still useful supplementary detail for the later events (e.g. the shipping_tier/payment_type payload contents, and the `user.email_hash` values referenced in step 7) — but treat `network.txt` as the authoritative source for all six event assertions, not console.log.

The `gads-user-data-body.txt` captured in step 7 is the third artifact — it's the only one of the three that shows a request *body* rather than just the URL/status line.

Close the checkout tab (`browser_tabs`, action: close). Leave the admin tab open.

Every `browser_navigate`/`click`/`snapshot` call without an explicit `filename` still auto-writes its own timestamped snapshot/console dump to the flat repo-root `.playwright-mcp/` — regardless of where the named saves above went. Sweep and delete those stray files (they're disposable per-action debug dumps, not the tracked artifacts):

```
rm -f "d:\Development\products\.playwright-mcp"/*.log "d:\Development\products\.playwright-mcp"/*.yml
```

(No-ops harmlessly if the shell glob matches nothing — ignore "no matches" errors.)

Report a concise pass/fail summary per event (view_item, add_to_cart, begin_checkout, add_shipping_info, add_payment_info, purchase) with ✅/❌ for the GA4 hit, plus a separate ✅/❌/— line for Google Ads where a tag is actually wired to that event per `GTM_Workspace.json` (Remarketing hit near view_item; Conversion hit on purchase; use "—" for add_to_cart/begin_checkout/add_shipping_info/add_payment_info, which have no directly-mapped Google Ads tag). Add one more line for the enhanced-conversions body check from step 7 (✅ if the email hash appears in `gads-user-data-body.txt`, otherwise report what was actually found as a finding, not a failure). Include the order's `transaction_id`, and flag findings (not failures) for: the two known-empty GA4 fields (shipping_tier, payment_type), and anything about the Google Ads requests that doesn't match the expected shape described in steps 2 and 7 — since this is the first run validating Google Ads traffic, treat surprises there as calibration data, not bugs. Link all three artifact files. Don't write a separate report file.

If any assertion genuinely fails (event missing entirely, wrong item/value data, missing transaction_id), quote the specific network request or console line that contradicts it.
