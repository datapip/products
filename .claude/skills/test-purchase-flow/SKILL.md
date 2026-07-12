---
name: test-purchase-flow
description: Live browser test of the Shopify custom pixel's ecommerce events (view_item through purchase) on the dev store, opt-in consent only. Completes a real test order via the Bogus Payment Gateway each run. Manual only, run via /test-purchase-flow.
disable-model-invocation: true
allowed-tools: mcp__playwright__browser_navigate mcp__playwright__browser_snapshot mcp__playwright__browser_click mcp__playwright__browser_type mcp__playwright__browser_network_requests mcp__playwright__browser_console_messages mcp__playwright__browser_tabs mcp__playwright__browser_wait_for mcp__playwright__browser_close Bash(mkdir -p ".playwright-mcp/test-purchase-flow") Bash(rm -f *)
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
- Artifacts go to `.playwright-mcp/test-purchase-flow/network.txt` and `.playwright-mcp/test-purchase-flow/console.log` (repo root, fixed filenames, overwritten each run). The output directory is gitignored and won't exist on a fresh clone — run `mkdir -p ".playwright-mcp/test-purchase-flow"` first (no-op if it already exists).

## Steps

### 1. Get an opt-in storefront session

Same as `/test-page-view` steps 1–2: navigate to the admin URL (handle login via `AskUserQuestion` if redirected), click "Test", switch to the new storefront tab.

Then get to a granted consent state — **try both paths, since which one is needed varies by prior session state**:
1. Snapshot the page. If a cookie consent dialog with an "Accept" button is present, click it.
2. If no dialog is present (consent was already decided in a prior run this session, denied or otherwise), click the "Cookie preferences" link in the footer (`/policies/#shopifyReshowConsentBanner`) to force the fuller preferences panel open, then click "Accept all" in it.

Either way, don't proceed until you've confirmed consent is actually granted — pull console messages (debug level) and look for a `dataLayer.push - event: consent_update` entry with `analytics_storage`/`ad_storage`/etc. all `"granted"`. If you only see `"denied"`, the accept click didn't register — retry.

### 2. Product page — verify `view_item`

Navigate to the product URL above. Wait ~1s. Pull network requests filtered `google-analytics` (`static: true`).

Assert: a request with `en=view_item` exists, with `cu=USD`, `epn.value=729.95`, and `pr1=` containing `id51714210300120` and `The Multi-location Snowboard`.

### 3. Add to cart — verify `add_to_cart`

Snapshot, click the "Add to cart" button. Wait ~1s. Pull network requests again.

Assert: a request with `en=add_to_cart` exists, same item/value data as above. This opens a cart drawer with a "Check out" button.

### 4. Start checkout — verify `begin_checkout`

Click "Check out" in the cart drawer. This navigates the same tab to a Shopify-hosted checkout URL (`/checkouts/cn/...`). Wait ~1s, pull network requests.

Assert: a request with `en=begin_checkout` exists with the same item/value data.

### 5. Fill contact + shipping — verify `add_shipping_info`

This is a single-page checkout (Contact, Delivery, Payment all visible at once — no "Continue to shipping" step). Snapshot to get current field refs (they're regenerated each run), then:

1. Fill "Email" → `pip@datapip.de`
2. Fill "First name" → `test`, "Last name" → `test`
3. Type `Hollywood Blvd` into the "Address" combobox. It shows an autocomplete suggestions listbox — snapshot again and pick the option whose text is exactly `Hollywood Blvd, Hollywood FL 33081, United States` (there will be several similarly-named streets in other cities; match on the FL 33081 one). Selecting it auto-fills City, State, and ZIP correctly — verify via snapshot (City: Hollywood, State: Florida selected, ZIP: 33081). If no such exact suggestion appears, fall back to filling City/State/ZIP manually via the visible fields.
4. A "Shipping method" section and radio group appears automatically once the address is complete (usually auto-selects "Standard"). Leave it as-is.

Wait ~1s, pull network requests.

Assert: a request with `en=add_shipping_info` exists. Note: in past runs, `ep.shipping_tier=` has come back **empty** in this request even though the shipping method radio shows "Standard" selected — this is a known data-quality gap in the pixel (`checkout.delivery.selectedDeliveryOptions[0].type` isn't resolving), not a step-execution failure. Report it as a flagged finding, not an assertion failure — don't retry the flow because of it.

### 6. Fill payment — verify `add_payment_info`

The card fields live in separate iframes (Card number / Expiration / Security code / Name on card each in their own iframe, with dynamic iframe names that change every run — always snapshot first and find the current refs by role+accessible name, never hardcode iframe names).

1. Fill "Card number" → `1`
2. Fill "Expiration date (MM / YY)" → `01 / 29`
3. Fill "Security code" → `123`
4. Leave "Name on card" as its auto-filled value (from shipping name) and "Use shipping address as billing address" checked (default).

`add_payment_info` does not appear to fire automatically on field completion here (unlike the address step) — it fires together with `purchase` after clicking "Pay now" in step 7. Don't wait for it separately; verify both in step 7's network pull.

### 7. Complete purchase — verify `add_payment_info` and `purchase`

Click "Pay now". Wait for navigation to the `/thank-you` order confirmation page (poll with `browser_wait_for` on time, a few seconds — order processing takes a moment). Pull network requests filtered `google-analytics` once on the thank-you page.

Assert:
- A request with `en=add_payment_info` exists (same known-empty-`payment_type` caveat as shipping_tier above — flag, don't fail).
- A request with `en=purchase` exists with a non-empty `ep.transaction_id`, `epn.value=729.95`, `cu=USD`, and `epn.shipping`/`epn.tax` present (values will vary; just confirm the keys are there with numeric values, not missing).

### 8. Save artifacts and report

Pull network requests (filtered `google-analytics`, `static: true`) once, from the thank-you page — network request history persists across page navigations within a tab, so this one pull captures **all six events from `view_item` onward**. Save to `.playwright-mcp/test-purchase-flow/network.txt` via `filename`.

Console message history does **not** persist across a hard page navigation (`all: false` scopes to "since last navigation") — and "Check out" → the checkout page is one. So a single console pull from the thank-you page only covers `begin_checkout` onward, missing `view_item`/`add_to_cart` (those happened on the product page, before that navigation boundary). Save that pull anyway to `.playwright-mcp/test-purchase-flow/console.log` via `filename` — it's still useful supplementary detail for the later events (e.g. the shipping_tier/payment_type payload contents) — but treat `network.txt` as the authoritative source for all six event assertions, not console.log.

Close the checkout tab (`browser_tabs`, action: close). Leave the admin tab open.

Every `browser_navigate`/`click`/`snapshot` call without an explicit `filename` still auto-writes its own timestamped snapshot/console dump to the flat repo-root `.playwright-mcp/` — regardless of where the named saves above went. Sweep and delete those stray files (they're disposable per-action debug dumps, not the tracked artifacts):

```
rm -f "d:\Development\products\.playwright-mcp"/*.log "d:\Development\products\.playwright-mcp"/*.yml
```

(No-ops harmlessly if the shell glob matches nothing — ignore "no matches" errors.)

Report a concise pass/fail summary per event (view_item, add_to_cart, begin_checkout, add_shipping_info, add_payment_info, purchase) with ✅/❌, the order's `transaction_id`, and the two known-empty-field notes (shipping_tier, payment_type) called out separately as flagged findings rather than failures. Link the two artifact files. Don't write a separate report file.

If any assertion genuinely fails (event missing entirely, wrong item/value data, missing transaction_id), quote the specific network request or console line that contradicts it.
