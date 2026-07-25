# Shopify GDPR-Ready GA4 & Google Ads Tracking — Setup Guide

Thank you for purchasing the Shopify Custom Pixel + GTM Container Template.

This document contains the step-by-step documentation to successfully import, configure, and integrate the template into your Shopify store and your Google Tag Manager Web Container.

---

## What you received

| File | Purpose |
| --- | --- |
| `shopify-custom-pixel.js` | The Custom Pixel — pasted into Shopify's Customer Events settings. This is the only file you edit inside Shopify. |
| `gtm-container.json` | An exportable GTM Web Container — import this into your own GTM account. It contains all GA4 and Google Ads tags, triggers, and variables, including Consent Mode v2. |
| This setup guide | Step-by-step instructions for both pieces above. |

---

## Step 1 — Import the GTM Container

1. Open your **Google Tag Manager** account and select (or create) the **Web Container** for your store's domain.
2. Go to **Admin → Import Container**.
3. Choose the file **`gtm-container.json`**.
4. Select **Workspace**: choose an existing workspace or create a new one.
5. Choose an import option:
   - **Merge** if your container already has tags you want to keep (recommended if unsure — review conflicts before confirming).
   - **Overwrite** only if this is a brand-new, empty container.
6. Click **Confirm**, then **Publish** the workspace once you've completed Step 2 below.

---

## Step 2 — Configure your GA4 & Google Ads IDs

All IDs are stored in **lookup table variables** so you can use different values for testing (`development`) and your live store (`production`). Under **Variables → User-Defined Variables**, open and edit each of the following:

- **`lookup - GA4 Measurement ID`** — enter your GA4 property's Measurement ID (`G-XXXXXXXXXX`) as the **Default Value** and for the `production` row. You can optionally use a separate test property for the `development` row.
- **`lookup - GAds Account ID`** — enter your Google Ads Conversion ID (`AW-XXXXXXXXX`) for the `production` row (and `development` row if you use a separate test account).
- **`lookup - GAds Conversion Label`** — enter the conversion label from your Google Ads **Purchase** conversion action for the `production` row.

Save each variable after editing.

> 💡 **Optional — Enhanced Conversions:** The tag **`GAds - Event - User Data (unpause, if allowed)`** ships **paused**. It sends hashed customer data (email, phone, name) to Google Ads for Enhanced Conversions. Only unpause it once you've confirmed your Google Ads account has Enhanced Conversions enabled and that your consent/legal basis covers this data use.

---

## Step 3 — Add the Custom Pixel to Shopify

1. In your Shopify Admin, go to **Settings → Customer events**.
2. Click **Add custom pixel**, give it a name (e.g. "GA4 & Google Ads Tracking"), and click **Add pixel**.
3. Under **Customer privacy**, set:
   - **Permission → Not required** ("The pixel will always run.") — this is required for the template to work as documented. The pixel's own internal logic (the `loadGtmOnFollowingConsents` setting below, plus Shopify's Customer Privacy API) decides whether GTM loads for a given visitor; if you set this to **Required** instead, Shopify will stop the pixel from running at all for non-consenting visitors, so it would never get the chance to check consent state or react to it.
   - **Data sale → Data collected does not qualify as data sale** ("The pixel will collect data when the customers opts out of their data being sold.") — the default this template ships with. Whether this classification is correct for your store is a legal determination under applicable data-sale/sharing laws (e.g. US state privacy laws) — confirm it matches your own situation before publishing; it's outside the scope of this template.
4. Delete the placeholder code and paste in the full contents of **`shopify-custom-pixel.js`**.
5. Edit the `config` object at the top of the file:

   | Setting | What to enter |
   | --- | --- |
   | `websiteDomain` | Your live storefront domain, e.g. `"shop.example.com"` or `"example.com"`. Used to detect production vs. testing. |
   | `gtmSnippet` | Your **live** GTM container snippet from **Admin → Install Google Tag Manager** in GTM. Copy the code between the `<script>` tags and paste it in here. |
   | `gtmSnippetDev` | *(Optional)* A snippet pointing to a preview/test environment, used automatically when the pixel is in development mode. Copy the code between the `<script>` tags the same way. |
   | `loadGtmOnFollowingConsents` | Which consent categories must be granted before GTM loads: any of `"preferences"`, `"analytics"`, `"marketing"`. Leave the array empty (`[]`) to load GTM immediately regardless of consent. |
   | `enableLogsInDev` / `enableLogsInProd` | Set to `true` to log every dataLayer push to the browser console — useful while testing, recommended `false` in `enableLogsInProd` once live. |
   | `pushHashedUserData` | Which customer fields to push as SHA-256 hashes (for Enhanced Conversions / GA4 user data): any of `"firstName"`, `"lastName"`, `"email"`, `"phone"`. |
   | `pushClearUserData` | Which fields to push in clear text (never email/phone/name): any of `"street"`, `"city"`, `"region"`, `"zip"`, `"country"`. |

6. Click **Save**, then set the pixel's status to **Connected**.
7. **Grant data access:** because this pixel reads checkout and customer data (email, phone, billing address) to power Enhanced Conversions, Shopify will prompt you to grant additional permissions the first time you save it. Under the pixel's **Permissions** tab, approve access to customer and checkout data — without this, the checkout-related fields will arrive as empty/`null`.

---

## Step 4 — Consent (GDPR)

This template reads consent state from Shopify's native **Customer Privacy API** — it does **not** ship its own cookie banner. Make sure one of the following is in place before going live:

- Shopify's built-in **Customer Privacy** settings (**Settings → Customer privacy**) with a consent banner enabled, or
- A third-party Consent Management Platform (CMP) that is integrated with Shopify's `customerPrivacy` API (so `analyticsProcessingAllowed` / `marketingAllowed` reflect real visitor choices).

Without a working consent source, all visitors are treated as **not consented** by default (`ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization` all `denied`).

What actually happens for a non-consenting visitor depends on the `loadGtmOnFollowingConsents` setting from Step 3: if it requires consent categories the visitor hasn't granted, GTM never loads for them, and nothing — not even modeled or anonymous data — reaches GA4 or Google Ads. If you leave that setting empty so GTM loads unconditionally, Google's own Consent Mode v2 behavior takes over for denied visitors (cookieless, modeled data); confirming that matches your legal basis is on you, not this template.

Shopify still fires its underlying `checkout_completed` pixel event regardless of consent state — that's how Shopify's Customer Events system works, independent of this template — so the pixel always attempts to push a `purchase` event to the dataLayer. Whether it actually reaches GTM/GA4/Google Ads depends on whether GTM has loaded per the rule above.

---

## Step 5 — Testing

1. In GTM, click **Preview** and connect it to your storefront (append `?gtm_debug=x` or use the Preview panel's URL field).
2. On your store, trigger a few events: view a product, add to cart, start checkout, complete a test order.
3. In the GTM Preview panel, confirm each event fires (`page_view`, `view_item`, `add_to_cart`, `begin_checkout`, `purchase`, etc.) with the expected `ecommerce` and `user` data.
4. To see raw dataLayer pushes in your browser console, temporarily add this line near the top of the pixel code, then remove it again before publishing live:
   ```js
   sessionStorage.setItem('webPixelDebug', '1');
   ```
   This flag lives inside the pixel's own sandboxed storage (it is **not** shared with your storefront page), and forces the pixel into development mode — using `gtmSnippetDev` if set, and enabling console logs if `enableLogsInDev` is `true`.
5. In Google Ads, use **Tag Diagnostics** (Tools → Conversions → your conversion action) to confirm the Conversion and Remarketing tags are firing correctly.
6. Once everything checks out, publish your GTM workspace and confirm the pixel is **Connected** in Shopify.

---

## License, Warranty & Liability Disclaimer

**Notice:** Unofficial, independent integration. Not affiliated with or endorsed by Shopify Inc., Google LLC, Google Analytics, Google Ads, or Google Tag Manager. All product and company names are trademarks™ or registered® trademarks of their respective owners.

**License:** Single-company license. Sharing, redistribution, or resale outside of the purchasing entity is strictly prohibited.

**B2B Only:** This product is intended exclusively for commercial entities (B2B). By purchasing, you confirm that you are acting as a business, freelancer, or legal entity.

**Warranty & Liability:** Sold strictly "as-is" without guaranteed future API updates. Implementation and use are entirely at your own risk. The author assumes no liability for data loss, tracking disruptions, misconfigured consent settings, or financial damages.
