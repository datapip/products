---
name: test-purchase-flow
description: Live browser test of the Shopify custom pixel's ecommerce events (view_item through purchase) on the dev store, opt-in consent only, verifying both GA4 and Google Ads tags fire per the GTM container. Completes a real test order via the Bogus Payment Gateway each run. Manual only, run via /test-purchase-flow.
disable-model-invocation: true
allowed-tools: mcp__playwright__browser_navigate mcp__playwright__browser_snapshot mcp__playwright__browser_click mcp__playwright__browser_type mcp__playwright__browser_network_requests mcp__playwright__browser_network_request mcp__playwright__browser_console_messages mcp__playwright__browser_tabs mcp__playwright__browser_wait_for mcp__playwright__browser_run_code_unsafe mcp__playwright__browser_close Bash(mkdir -p ".playwright-mcp/test-purchase-flow") Bash(rm -f *)
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
- GTM container reference: `shopify-setup/gtm-container.json` (the exported GTM container) determines which GA4/Google Ads tags fire for which event. As of the 2026-07-25 run, the dev-container's "development" environment lookup values are: GA4 Measurement ID `G-ABCDE67890`, Google Ads Account ID `AW-1011121314` (placeholder), Google Ads Conversion Label `ExampleConvLabel456` (placeholder). **These IDs drift**: the container gets edited and republished in GTM UI independently of this skill (new `containerId` each time), and the lookup values change with it — don't treat a mismatch against this doc as a failure. Confirm the values actually in play for a given run from the network hits themselves (`tid=` on `region1.google-analytics.com` requests, the account ID in the `googleadservices.com`/`doubleclick.net` URLs) rather than assuming these are current. Per the container: "GA4 Ecommerce Events" (tag id 52) covers `view_item`/`add_to_cart`/`begin_checkout`/`add_shipping_info`/`add_payment_info`/`purchase` (needs `analytics_storage`) — **no Google Ads tag maps directly to those events**, except two: "GAds Remarketing" (id 70) fires on the `page_view` trigger, which the product-page load in step 2 also emits (needs full marketing consent); and "GAds Conversion" (id 76) fires on `purchase` only (needs `ad_storage`+`ad_user_data`). "GAds User Data" (id 82, enhanced conversions) is wired to `add_shipping_info`/`add_payment_info`/`purchase`, but has been **paused in GTM since 2026-07-13** — don't expect or hunt for its `ad.doubleclick.net/ccm/s/collect` request; there is no step in this skill that captures it anymore. Re-enable that check if the tag is reactivated.
- Artifacts go to `.playwright-mcp/test-purchase-flow/network.txt` and `.playwright-mcp/test-purchase-flow/console.log` (repo root, fixed filenames, overwritten each run). The output directory is gitignored and won't exist on a fresh clone — run `mkdir -p ".playwright-mcp/test-purchase-flow"` first (no-op if it already exists).

## Steps

### 1. Get a fresh, opt-in storefront session

Same as `/test-page-view` steps 1–2: navigate to the admin URL (handle login via `AskUserQuestion` if redirected), click "Test", switch to the new storefront tab.

Then reset consent state to simulate a fresh browser, exactly as `/test-page-view` does before its first test case (don't skip this just because this skill only tests one consent state — a run that inherits granted-or-denied consent from an earlier run in the same browser session isn't actually testing the opt-in path, it's just confirming whatever state was already there):

1. Use `browser_run_code_unsafe` to run exactly:

```js
async (page) => {
  await page.context().clearCookies({
    domain: 'dev-store-kcb1ukk9.myshopify.com',
    name: /^_shopify_/,
  });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  return "cleared";
};
```

   This clears exactly the storefront's three consent-category cookies (`_shopify_essential`, `_shopify_analytics`, `_shopify_marketing`) without touching `admin.shopify.com`, `accounts.shopify.com`, or `.shopify.com`, so the admin tab's login session survives. Do not broaden this to a bare `clearCookies()` with no filter — that logs the admin tab out too. This is the only use of unsafe code execution in this skill.
2. The reset also clears the password-bypass grant that lived on `_shopify_essential` (it rides the signed "Test" URL). Switch to the admin tab, click "Test" again for a fresh signed URL, switch to the new storefront tab, and close the now-stale one — never navigate directly to the bare storefront domain after a reset, it'll hit the password wall.
3. Snapshot the page. Since consent was just reset, a "Cookie consent" dialog with a direct "Accept" button should be showing — click it. If no dialog is present (unexpected this early), fall back to the "Cookie preferences" link in the footer (`/policies/#shopifyReshowConsentBanner`) to force the fuller preferences panel open, then click "Accept all" in it.

Either way, don't proceed until you've confirmed consent is actually granted — pull console messages (debug level) and look for a `dataLayer.push - event: consent_update` entry with `analytics_storage`/`ad_storage`/etc. all `"granted"`. If you only see `"denied"`, the accept click didn't register — retry.

### 2. Product page — verify `view_item`

Navigate to the product URL above. Wait ~1s. Pull network requests filtered `google-analytics|googleadservices|doubleclick` (`static: true`).

Assert:
- A request with `en=view_item` exists, with `cu=USD`, `epn.value=729.95`, and `pr1=` containing `id51714210300120` and `The Multi-location Snowboard`.
- A Google Ads request also fired here: the page load itself emits a `page_view` dataLayer event before `view_item`, and "GAds Remarketing" is wired to that same `page_view` trigger (see Target note above). Look for a hit to `googleadservices.com`, `doubleclick.net`, or `google-analytics.com/g/collect` carrying the current Google Ads account ID (see Target note — don't hardcode the ID, it drifts). Flag as a finding (not a failure) if it's absent or shaped differently, and describe what you actually observed.

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

Assert: a request with `en=add_shipping_info` exists, with a non-empty `ep.shipping_tier` matching the selected shipping method (e.g. `Standard`). This was a known data-quality gap (`checkout.delivery.selectedDeliveryOptions[0].type` resolving to `undefined`) — fixed in commit `e660c61` (2026-07-12) via a `.title` fallback, confirmed populated in the 2026-07-25 run. If it comes back empty again, treat that as a regression worth flagging, not an expected gap.

### 6. Fill payment — verify `add_payment_info`

The card fields live in separate iframes (Card number / Expiration / Security code / Name on card each in their own iframe, with dynamic iframe names that change every run — always snapshot first and find the current refs by role+accessible name, never hardcode iframe names).

1. Fill "Card number" → `1`
2. Fill "Expiration date (MM / YY)" → `01 / 29`
3. Fill "Security code" → `123`
4. Leave "Name on card" as its auto-filled value (from shipping name) and "Use shipping address as billing address" checked (default).

`add_payment_info` does not appear to fire automatically on field completion here (unlike the address step) — it fires together with `purchase` after clicking "Pay now" in step 7. Don't wait for it separately; verify both in step 7's network pull.

### 7. Complete purchase — verify `add_payment_info` and `purchase`

Click "Pay now". Wait for navigation to the `/thank-you` order confirmation page (poll with `browser_wait_for` on time, a few seconds — order processing takes a moment). Pull network requests filtered `google-analytics|googleadservices|doubleclick` once on the thank-you page.

**Batching quirk**: `add_payment_info` and `purchase` fire back-to-back and GA4 sometimes batches them into a single POST to `region1.google-analytics.com/g/collect`, where the URL itself carries no `en=` (or only the last event's params) and the earlier event's `en=`/`ep.*`/`epn.*` data instead lives in the **POST body**, one event per line. If a `region1.google-analytics.com/g/collect` hit appears in the URL list around this point with a suspiciously bare query string (no `en=`), don't treat the event as missing — call `browser_network_request` with `index` and `part: "request-body"` on that request and check there before concluding anything failed.

Assert:
- A request (or a batched body line, per the quirk above) with `en=add_payment_info` exists. Note: `ep.payment_type=` has come back **empty** in past runs even though a card was entered — a known data-quality gap, still unresolved as of 2026-07-25 (unlike the shipping_tier gap above, which was fixed). Report it as a flagged finding, not an assertion failure — don't retry the flow because of it.
- A request (or batched body line) with `en=purchase` exists with a non-empty `ep.transaction_id`, `epn.value=729.95`, `cu=USD`, and `epn.shipping`/`epn.tax` present (values will vary; just confirm the keys are there with numeric values, not missing).
- A Google Ads conversion request also fired: "GAds Conversion" (tag id 76, type `awct`) is wired to the `purchase` trigger, gated on `ad_storage`+`ad_user_data` consent (both granted under "Accept all"). Look for a hit to `googleadservices.com` or `doubleclick.net` with `en=conversion`, `bttype=purchase`, carrying the current Google Ads account ID and conversion label (see Target note — these drift, don't hardcode), ideally with an order/value/currency lining up with the GA4 purchase hit's `ep.transaction_id`/`epn.value`/`cu`. If the parameter names don't match this description, don't force-fail: save what's actually there and describe it plainly in the report.

Don't check for a `ccm/s/collect` request ("GAds User Data" / enhanced conversions, tag id 82) — that tag is paused in GTM as of 2026-07-13 (see Target above).

### 8. Save artifacts and report

Pull network requests (filtered `google-analytics|googleadservices|doubleclick`, `static: true`) once, from the thank-you page — network request history persists across page navigations within a tab, so this one pull captures **all six events from `view_item` onward**, plus any Google Ads hits. Save to `.playwright-mcp/test-purchase-flow/network.txt` via `filename`. Note this dump only shows URLs — if the batching quirk from step 7 applied, the batched event's `en=`/`ep.*`/`epn.*` data won't be in `network.txt` at all (it was in a request body you inspected separately); quote that body content directly in the chat report since it isn't otherwise saved anywhere.

Console message history does **not** persist across a hard page navigation (`all: false` scopes to "since last navigation") — and "Check out" → the checkout page is one. So a single console pull from the thank-you page only covers `begin_checkout` onward, missing `view_item`/`add_to_cart` (those happened on the product page, before that navigation boundary). Save that pull anyway to `.playwright-mcp/test-purchase-flow/console.log` via `filename` — it's still useful supplementary detail for the later events (e.g. the shipping_tier/payment_type payload contents) — but treat `network.txt` as the authoritative source for all six event assertions, not console.log.

Close the checkout tab (`browser_tabs`, action: close). Leave the admin tab open.

Every `browser_navigate`/`click`/`snapshot` call without an explicit `filename` still auto-writes its own timestamped snapshot/console dump to the flat repo-root `.playwright-mcp/` — regardless of where the named saves above went. Sweep and delete those stray files (they're disposable per-action debug dumps, not the tracked artifacts):

```
rm -f "d:\Development\products\.playwright-mcp"/*.log "d:\Development\products\.playwright-mcp"/*.yml
```

(No-ops harmlessly if the shell glob matches nothing — ignore "no matches" errors.)

Report a concise pass/fail summary per event (view_item, add_to_cart, begin_checkout, add_shipping_info, add_payment_info, purchase) with ✅/❌ for the GA4 hit, plus a separate ✅/❌/— line for Google Ads where a tag is actually wired to that event per `GTM_Workspace.json` (Remarketing hit near view_item; Conversion hit on purchase; use "—" for add_to_cart/begin_checkout/add_shipping_info/add_payment_info, which have no directly-mapped Google Ads tag). Include the order's `transaction_id`, and flag findings (not failures) for: the known-empty GA4 `payment_type` field (and a regression flag if `shipping_tier` comes back empty again — see step 5), and anything about the Google Ads requests that doesn't match the expected shape described in steps 2 and 7 — since this is the first run validating Google Ads traffic, treat surprises there as calibration data, not bugs. Link both artifact files. Don't write a separate report file.

If any assertion genuinely fails (event missing entirely, wrong item/value data, missing transaction_id), quote the specific network request or console line that contradicts it.
