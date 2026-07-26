## PRODUCT PAGE

A **Shopify Custom Pixel + Google Tag Manager (GTM) Web Container** for GDPR-ready **GA4 and Google Ads** tracking — full setup and full control, with no monthly tracking-app subscription and no black box: you own the data layer.

Rather than routing your entire event stream through a closed third-party app, this template runs through Shopify's own **Custom Pixel** sandbox using its analytics API, and a GTM container you own and can read line by line. Setup follows five clear steps — import the container, drop in your own GA4/Ads IDs, add the pixel to Shopify, confirm consent is wired up, test — and once it's running, it's yours: no black-box app logic to work around, and a solid base you can extend with your own events, tags, or destinations as your tracking setup grows.

**Early Bird Offer:** [Optional — add a limited-time discount code here, e.g. "First 5 buyers get €X off, code LAUNCH_X at checkout."]

### What it does

- **Event Coverage:** Tracks the Shopify customer journey — page views, collection & product views, cart actions, all checkout steps, purchases, and on-site search — mapped to standard GA4 ecommerce events.
- **Consent Mode v2, built in:** Sets Google Consent Mode v2 default/update signals from Shopify's native Customer Privacy API. A config setting controls whether GTM (and with it GA4/Ads) loads only after specific consent categories are granted, or immediately — the template ships with the consent-gated option, so nothing loads for a visitor until they've actually consented.
- **Google Ads Ready:** Includes a Conversion tag and a Remarketing tag out of the box, plus an Enhanced Conversions tag (using hashed customer data) that ships paused until you enable it.
- **GA4 User Data:** Optionally pushes SHA-256-hashed email, phone, and name for GA4/Enhanced Conversions — hashing happens client-side before the value reaches the dataLayer. A separate setting lets you also push selected fields in clear text (by default just address fields, not email/phone/name).
- **GA4 User-ID, off by default:** A config setting can send the Shopify customer ID to GA4 as `user_id`, enabling cross-device reporting for logged-in customers — ships disabled, since cross-device tracking needs its own legal basis to turn on.
- **Environment-Aware:** Separate GA4 / Google Ads IDs for test vs. live environments via lookup tables, plus an optional debug mode with dataLayer console logging.
- **No Extra App:** No app subscription or proxy service — a pixel and a GTM container you configure and own.
- **Built to Extend:** Both the pixel code and the GTM container are plain, editable files, not a locked-down app — a starting point for your analytics and marketing setup that you can add tags, events, or destinations to as your needs grow.

### What you get & Product State

This is a **one-time purchase** of the current development state ("as is"). You get:

- **`shopify-custom-pixel.js`** — paste directly into Shopify's Customer Events as a Custom Pixel.
- **`gtm-container.json`** — import into your own GTM Web Container.
- **Setup Guide:** A straightforward, step-by-step guide covering the GTM import, ID configuration, adding the pixel to Shopify, consent setup, and testing.
- **License:** Single-company license. The purchase grants usage rights exclusively to the purchasing company/entity for their own internal domains and containers.
- **Support:** Sold as-is. There is no guaranteed ongoing support or automated updates if Shopify, GA4, or Google Ads introduce breaking changes to their platforms in the future.

### Technical Requirements

- A Shopify store with access to **Customer Events / Custom Pixels** (available on current Shopify plans).
- A **Google Tag Manager** account with a Web Container.
- A **GA4** property and Measurement ID.
- _(Optional)_ A **Google Ads** account with a Purchase conversion action, if you want conversion tracking / remarketing.

### Legal Notice, License & Liability Disclaimer

**Notice:** Unofficial, independent integration. Not affiliated with or endorsed by Shopify Inc., Google LLC, Google Analytics, Google Ads, or Google Tag Manager. All product and company names are trademarks™ or registered® trademarks of their respective owners.

**License:** Single-company license. Sharing, redistribution, or resale outside of the purchasing entity is strictly prohibited.

**B2B Only:** This product is intended exclusively for commercial entities (B2B). By purchasing, you confirm that you are acting as a business, freelancer, or legal entity.

**Warranty & Liability:** Sold strictly "as-is" without guaranteed future API updates. Implementation and use are entirely at your own risk. The author assumes no liability for data loss, tracking disruptions, misconfigured consent settings, or financial damages.

---

## CONTENT PAGE

### Thank you for your purchase

Thank you for choosing the **GDPR-Ready Shopify GA4 & Google Ads Tracking Template** by datapip.de. Below you will find the two product files and the complete, step-by-step implementation guide.

**The files:**

- `shopify-custom-pixel.js`
- `gtm-container.json`
- Setup Guide (PDF)

### The documentation:

#### Step 1 — Import the GTM Container

In your Google Tag Manager account, go to **Admin → Import Container**, choose the downloaded **`gtm-container.json`**, select a workspace, and choose **Merge** (or **Overwrite** for a brand-new container). Confirm the import.

#### Step 2 — Configure your GA4 & Google Ads IDs

Under **Variables → User-Defined Variables**, edit the three lookup table variables:

- **`lookup - GA4 Measurement ID`** → your `G-XXXXXXXXXX`
- **`lookup - GAds Account ID`** → your `AW-XXXXXXXXX`
- **`lookup - GAds Conversion Label`** → your Purchase conversion's label

#### Step 3 — Add the Custom Pixel to Shopify

In Shopify Admin, go to **Settings → Customer events → Add custom pixel**, paste in the contents of `shopify-custom-pixel.js`, and fill in the `config` object at the top (your domain, your live GTM snippet, and which consent categories should gate GTM loading). Save, then set the pixel to **Connected** and grant the requested customer/checkout data permissions.

#### Step 4 — Consent

Make sure Shopify's native **Customer Privacy** settings (or a compatible CMP) are configured — this template reads consent from Shopify's `customerPrivacy` API rather than shipping its own banner.

#### Step 5 — Testing

Use GTM's **Preview** mode together with a live test checkout to confirm every event (`page_view`, `view_item`, `add_to_cart`, `begin_checkout`, `purchase`, etc.) fires with the correct data before publishing your workspace.

_(Full details, screenshots, and troubleshooting notes are in the attached PDF Setup Guide.)_

### License, Support & Conditions

**Notice:** Unofficial, independent integration. Not affiliated with or endorsed by Shopify Inc., Google LLC, Google Analytics, Google Ads, or Google Tag Manager. All product and company names are trademarks™ or registered® trademarks of their respective owners.

**License:** Single-company license. Sharing, redistribution, or resale outside of the purchasing entity is strictly prohibited.

**B2B Only:** This product is intended exclusively for commercial entities (B2B). By purchasing, you confirm that you are acting as a business, freelancer, or legal entity.

**Warranty & Liability:** Sold strictly "as-is" without guaranteed future API updates. Implementation and use are entirely at your own risk. The author assumes no liability for data loss, tracking disruptions, misconfigured consent settings, or financial damages.
