---
name: test-page-view
description: Live browser test of the Shopify custom pixel's page_view tracking on the dev store — verifies GTM and GA4 fire correctly under both cookie-consent opt-in and opt-out. Manual only, run via /test-page-view.
disable-model-invocation: true
allowed-tools: mcp__playwright__browser_navigate mcp__playwright__browser_snapshot mcp__playwright__browser_click mcp__playwright__browser_network_requests mcp__playwright__browser_console_messages mcp__playwright__browser_tabs mcp__playwright__browser_evaluate mcp__playwright__browser_run_code_unsafe mcp__playwright__browser_wait_for mcp__playwright__browser_close Bash(mkdir -p ".playwright-mcp/test-page-view") Bash(rm -f *)
---

Runs a live end-to-end test of `shopify-custom-pixel.js`'s `page_view` event against the Shopify dev store, under both consent states. This is the first of a planned family of `/test-*` skills for this product (next: an ecommerce purchase-flow test) — keep this file's structure reusable for that.

## Target

- Admin pixel settings: `https://admin.shopify.com/store/dev-store-kcb1ukk9/settings/customer_events/pixels/custom/142311640`
- Named artifacts (network dumps, console logs) go under `.playwright-mcp/test-page-view/`, using **fixed filenames that get overwritten each run** (this is a repeatable regression check, not a log archive — don't timestamp them). Each `/test-*` skill gets its own subfolder named after itself (sibling: `/test-purchase-flow` uses `.playwright-mcp/test-purchase-flow/`). This directory is gitignored and won't exist on a fresh clone — run `mkdir -p ".playwright-mcp/test-page-view"` first (no-op if it already exists).
- Separately: every Playwright action *without* an explicit `filename` (navigate, click, snapshot, etc.) still auto-writes its own timestamped dump to the flat repo-root `.playwright-mcp/`, regardless of the above. Step 7 sweeps and deletes those — they're disposable per-action debug output, not tracked artifacts.

## Steps

### 1. Open the pixel admin page

Navigate to the admin URL above. Take a snapshot.

- If the page redirects to `accounts.shopify.com` (login page), use `AskUserQuestion` to ask the user to log in in the browser window, then re-navigate to the same admin URL once they confirm.
- Once on the pixel settings page, find the link with accessible name "Test" and click it. This opens the storefront in a new tab.

### 2. Switch to the storefront tab

Use `browser_tabs` (action: list) to find the new tab (URL contains `myshopify.com`, not `admin.shopify.com`), then select it.

### 3. Test case A — Opt-in (Accept)

1. Snapshot the page. If a cookie consent dialog with an "Accept" button is present, click it. If no dialog is present (consent was already decided in a prior run this session), click the "Cookie preferences" link in the footer (`/policies/#shopifyReshowConsentBanner`) to force the fuller preferences panel open, then click "Accept all" in it. Either way, confirm via console (see assertion below) that consent actually ended up granted before proceeding — don't just trust the click happened.
2. Wait ~1s (`browser_wait_for` with `time: 1`) for GTM/GA4 to fire.
3. Pull network requests filtered on `googletagmanager|google-analytics` (`static: true`), save to `.playwright-mcp/test-page-view/optin-network.txt` via the `filename` param.
4. Pull console messages (level: debug, all: false — just this navigation), save to `.playwright-mcp/test-page-view/optin-console.log` via `filename`.
5. Assert against the saved data:
   - A `GET .../gtm.js?id=GTM-...` request exists (200).
   - A GA4 collect request exists (`google-analytics.com/g/collect`, status 204) with `en=page_view` and `gcs=` indicating **granted** consent (the two digits after `G1` are both `1`, e.g. `gcs=G111`).
   - Console shows a `dataLayer.push - event: consent_update` log with `ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization` all `"granted"`.
   - Console shows a `dataLayer.push - event: page_view` log with non-empty `page_location` matching the current URL and non-empty `page_title`. If no customer is logged in, `user_*_hash` fields should be `null` (not throw or be missing).

### 4. Reset consent state between test cases

Use `browser_run_code_unsafe` to run exactly:

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

This clears exactly the storefront's three consent-category cookies (`_shopify_essential`, `_shopify_analytics`, `_shopify_marketing` — confirmed by diffing `page.context().cookies()` before/after) without touching anything on `admin.shopify.com`, `accounts.shopify.com`, or `.shopify.com`, so **the admin tab's login session survives** — no re-login needed between test cases. Do not broaden this to a bare `clearCookies()` with no filter — that clears the entire browser context (all domains sharing this browser), which logs the admin tab out too.

This is the only use of unsafe code execution in this skill — it exists solely to reset first-party consent cookies between test cases, which is not otherwise exposed by the sandboxed pixel APIs. Do not use `browser_run_code_unsafe` for anything else in this skill.

### 5. Get a fresh test session

Switch to the admin tab, take a snapshot, click "Test" again (the test URL is signed/time-limited — don't reuse the old one). Switch to the new storefront tab.

Note: the signed test URL also carries the storefront's password-bypass grant, which lives on the same `_shopify_essential` cookie cleared in step 4. Always get to the storefront via a fresh "Test" click, never by navigating directly to the bare storefront domain after a consent reset — the latter will hit the password wall.

### 6. Test case B — Opt-out (Decline)

1. Snapshot the page. If a cookie consent dialog with a "Decline" button is present, click it. If no dialog is present, use the same "Cookie preferences" fallback as step 3, but click "Decline all" in the preferences panel instead of "Accept all". Confirm via console that consent ended up denied before proceeding.
2. Wait ~1s.
3. Pull network requests filtered on `googletagmanager|google-analytics`, save to `.playwright-mcp/test-page-view/optout-network.txt`.
4. Pull console messages (debug level), save to `.playwright-mcp/test-page-view/optout-console.log`.
5. Assert:
   - **No** `gtm.js` request and **no** GA4 collect request appear at all (the pixel must not load GTM without consent — `config.loadGtmOnFollowingConsents` gates this).
   - Console shows `dataLayer.push - event: consent_update` with all four consent signals `"denied"`.
   - Console does **not** contain `"GTM snippet injeceted"` (the pixel's own load-confirmation log).

### 7. Clean up and report

Close the storefront tab (`browser_tabs`, action: close). Leave the admin tab open.

Sweep and delete stray auto-dumped files that leaked to the flat repo-root `.playwright-mcp/` during this run (see Target note above):

```
rm -f "d:\Development\products\.playwright-mcp"/*.log "d:\Development\products\.playwright-mcp"/*.yml
```

(No-ops harmlessly if the glob matches nothing — ignore "no matches" errors.)

Report a concise pass/fail summary in chat for both test cases (opt-in, opt-out), listing each assertion from steps 3.5 and 6.5 individually with ✅/❌, plus the paths to the four saved artifact files. Do not write a separate report file — the artifact files plus the chat summary are the deliverable.

If any assertion fails, quote the specific console line or network request (or its absence) that contradicts it — don't just say "failed".
