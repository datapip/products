/**
 * Version 1.0.0
 *
 * © 2026 datapip.de - Philipp Jaeckle – Custom implementation.
 *
 * This implementation contains proprietary logic.
 * Third-party snippets (e.g. Google Tag Manager, Shopify APIs)
 * remain the property of their respective owners.
 */

/* ---------------------- Config ---------------------- */
const config = {
  // state the domain for your live website,
  // e.g. shop.example.com or example.com:
  websiteDomain: "",

  // select consent(s) to load GTM,
  // leave empty to load instantly:
  loadGtmOnFollowingConsents: ["preferences", "analytics", "marketing"],

  // define if debug info should be logged
  // to console in test environment:
  enableLogsInDev: true,

  // define if debug info should be logged
  // to console in live environment:
  enableLogsInProd: false,

  // select shopify user data to be pushed
  // in hashed format:
  pushHashedUserDataToDataLayer: ["email"],

  // select shopify user data to be pushed in
  // clear format:
  pushClearUserDataToDataLayer: ["email"],
};

/* ---------------------- Variables ---------------------- */
const environment = getEnvironment();
let gtmLoaded = false;

const userData = {
  id: init?.data?.customer?.id || null,
  ordersCount: init?.data?.customer?.ordersCount || null,
  firstName: (init?.data?.customer?.firstName || "").toLowerCase() || null,
  lastName: (init?.data?.customer?.lastName || "").toLowerCase() || null,
  email: (init?.data?.customer?.email || "").toLowerCase() || null,
  emailHash: null,
  phone: init?.data?.customer?.phone || null,
  phoneHash: null,
};

const userConsent = {
  preferences: false,
  analytics: false,
  marketing: false,
};

/* ---------------------- Hash user data ---------------------- */
const hashesReady = (async () => {
  userData.emailHash = userData.email ? await sha256(userData.email) : null;
  userData.phoneHash = userData.phone ? await sha256(userData.phone) : null;
})();

/* ---------------------- Initialize dataLayer ---------------------- */
window.dataLayer = window.dataLayer || [];

window.gtag = function () {
  window.dataLayer.push(arguments);
};

applyDebugLogging();

/* ---------------------- Handling initial consent ---------------------- */
gtag("consent", "default", {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
});

window.dataLayer.push({
  event: "consent_default",
  preferences: userConsent.preferences,
  analytics: userConsent.analytics,
  marketing: userConsent.marketing,
});

if (
  init?.customerPrivacy?.preferencesProcessingAllowed ||
  init?.customerPrivacy?.analyticsProcessingAllowed ||
  init?.customerPrivacy?.marketingAllowed
) {
  userConsent = {
    preferences: init?.customerPrivacy?.preferencesProcessingAllowed,
    analytics: init?.customerPrivacy?.analyticsProcessingAllowed,
    marketing: init?.customerPrivacy?.marketingAllowed,
  };

  gtag("consent", "update", {
    analytics_storage: userConsent.analytics ? "granted" : "denied",
    ad_storage: userConsent.marketing ? "granted" : "denied",
    ad_user_data: userConsent.marketing ? "granted" : "denied",
    ad_personalization: userConsent.marketing ? "granted" : "denied",
  });

  window.dataLayer.push({
    event: "consent_update",
    preferences: userConsent.preferences,
    analytics: userConsent.analytics,
    marketing: userConsent.marketing,
  });
}

if (shouldInitGTM()) initializeGTM();

/* ---------------------- Handling consent changes ---------------------- */
api.customerPrivacy?.subscribe?.("visitorConsentCollected", (event) => {
  userConsent = {
    preferences: event?.customerPrivacy?.preferencesProcessingAllowed,
    analytics: event?.customerPrivacy?.analyticsProcessingAllowed,
    marketing: event?.customerPrivacy?.marketingAllowed,
  };

  gtag("consent", "update", {
    analytics_storage: userConsent.analytics ? "granted" : "denied",
    ad_storage: userConsent.marketing ? "granted" : "denied",
    ad_user_data: userConsent.marketing ? "granted" : "denied",
    ad_personalization: userConsent.marketing ? "granted" : "denied",
  });

  window.dataLayer.push({
    event: "consent_update",
    preferences: userConsent.preferences,
    analytics: userConsent.analytics,
    marketing: userConsent.marketing,
  });

  if (shouldInitGTM()) initializeGTM();
});

/**
 *
 *  CONTINUE REFACTORING BELOW
 *
 */

/* ---------------------- Validation functions ---------------------- */
function isValidEcommerce(event, ecommerce) {
  if (!event || !ecommerce) {
    pushError(event, "missing event or ecommerce payload");
    return false;
  }

  if (event === "view_item_list") {
    if (!ecommerce.items?.length || !hasValidItem(ecommerce.items)) {
      pushError(event, "missing required ecommerce data");
      return false;
    }
  }

  if (
    [
      "view_item",
      "add_to_cart",
      "remove_from_cart",
      "view_cart",
      "begin_checkout",
      "add_shipping_info",
      "add_payment_info",
    ].includes(event)
  ) {
    if (
      !ecommerce.currency ||
      ecommerce.value == null ||
      !ecommerce.items?.length ||
      !hasValidItem(ecommerce.items)
    ) {
      pushError(event, "missing required ecommerce data");
      return false;
    }
  }

  if (event === "purchase") {
    if (
      !ecommerce.currency ||
      ecommerce.value == null ||
      !ecommerce.transaction_id ||
      !ecommerce.items?.length ||
      !hasValidItem(ecommerce.items)
    ) {
      pushError(event, "missing required ecommerce data");
      return false;
    }
  }

  return true;
}

function hasValidItem(items) {
  if (!items) return false;

  return items?.some(
    (item) =>
      (typeof item.item_id === "string" && item.item_id.trim()) ||
      (typeof item.item_name === "string" && item.item_name.trim()),
  );
}

function pushError(event, message) {
  console.error("[error]", message);
  pushEvent({
    event: "datalayer_error",
    error_event: event,
    error_message: message,
  });
}

/* ---------------------- Page view ---------------------- */
analytics?.subscribe?.("page_viewed", async (event) => {
  await hashesReady;

  pushEvent({
    event: "page_view",
    page_referrer: event?.context?.document?.referrer,
    page_location: event?.context?.document?.location?.href,
    page_title: event?.context?.document?.title,
    page_type: pageType,
    shop_country: shopCountry,
    shop_language: shopLanguage,
    environment: env,
    user_id: userId,
    user_orders_count: userOrdersCount,
    user_email_hash: userEmailHash,
    user_phone_hash: userPhoneHash,
    __user_email: __userEmail,
    __user_phone: __userPhone,
  });
});

/* ---------------------- Collection view ---------------------- */
analytics?.subscribe?.("collection_viewed", (event) => {
  flushEcommerce();

  const ga4_event_name = "view_item_list";

  const collection = event?.data?.collection;

  if (!collection) {
    pushError(ga4_event_name, "missing analytics api data");
    return;
  }

  const ga4_ecommerce_object = {
    // currency: "",
    item_list_id: collection?.id,
    item_list_name: collection?.title,
    items: collection.productVariants
      ? collection.productVariants.map((variant, index) => ({
          item_id: variant?.sku || variant?.id || variant?.product?.id || "",
          item_name: variant?.product?.title || "",
          affiliation: "",
          coupon: "",
          discount: 0,
          index,
          item_brand: variant?.product?.vendor || "",
          item_category: variant?.product?.type || "",
          item_category2: "",
          item_category3: "",
          item_category4: "",
          item_category5: "",
          item_list_id: collection?.id,
          item_list_name: collection?.title,
          item_variant: variant?.title || "",
          location_id: "",
          price: Number(variant?.price?.amount || 0),
          quantity: 1,
        }))
      : [],
  };

  if (!isValidEcommerce(ga4_event_name, ga4_ecommerce_object)) {
    return;
  }

  pushEvent({
    event: ga4_event_name,
    ecommerce: ga4_ecommerce_object,
  });
});

/* ---------------------- Product viewed ---------------------- */
analytics?.subscribe?.("product_viewed", (event) => {
  flushEcommerce();

  const ga4_event_name = "view_item";

  const variant = event?.data?.productVariant;

  if (!variant) {
    pushError(ga4_event_name, "missing analytics api data");
    return;
  }

  const ga4_ecommerce_object = {
    currency: variant?.price?.currencyCode,
    value: Number(variant?.price?.amount || 0),
    items: [
      {
        item_id: variant?.sku || variant?.id || variant?.product?.id || "",
        item_name: variant.product?.title || "",
        affiliation: "",
        coupon: "",
        discount: 0,
        index: 0,
        item_brand: variant.product?.vendor || "",
        item_category: variant.product?.type || "",
        item_category2: "",
        item_category3: "",
        item_category4: "",
        item_category5: "",
        item_list_id: "",
        item_list_name: "",
        item_variant: variant?.title || "",
        location_id: "",
        price: Number(variant?.price?.amount || 0),
        quantity: 1,
      },
    ],
  };

  if (!isValidEcommerce(ga4_event_name, ga4_ecommerce_object)) {
    return;
  }

  pushEvent({
    event: ga4_event_name,
    ecommerce: ga4_ecommerce_object,
  });
});

/* ---------------------- Cart actions ---------------------- */
analytics?.subscribe?.("product_added_to_cart", (event) => {
  flushEcommerce();

  const ga4_event_name = "add_to_cart";

  const cartLine = event?.data?.cartLine;

  if (!cartLine) {
    pushError(ga4_event_name, "missing analytics api data");
    return;
  }

  const ga4_ecommerce_object = {
    currency: cartLine?.merchandise?.price?.currencyCode,
    value: Number(cartLine?.cost?.totalAmount?.amount || 0),
    items: [
      {
        item_id:
          cartLine?.merchandise?.sku ||
          cartLine?.merchandise?.id ||
          cartLine?.merchandise?.product?.id ||
          "",
        item_name: cartLine?.merchandise?.product?.title || "",
        affiliation: "",
        coupon: "",
        discount: 0,
        index: 0,
        item_brand: cartLine?.merchandise?.product?.vendor || "",
        item_category: cartLine?.merchandise?.product?.type || "",
        item_category2: "",
        item_category3: "",
        item_category4: "",
        item_category5: "",
        item_list_id: "",
        item_list_name: "",
        item_variant: cartLine?.merchandise?.title || "",
        location_id: "",
        price: Number(cartLine?.merchandise?.price?.amount || 0),
        quantity: Number(cartLine?.quantity || 1),
      },
    ],
  };

  if (!isValidEcommerce(ga4_event_name, ga4_ecommerce_object)) {
    return;
  }

  pushEvent({
    event: ga4_event_name,
    ecommerce: ga4_ecommerce_object,
  });
});

analytics?.subscribe?.("product_removed_from_cart", (event) => {
  flushEcommerce();

  const ga4_event_name = "remove_from_cart";

  const cartLine = event?.data?.cartLine;

  if (!cartLine) {
    pushError(ga4_event_name, "missing analytics api data");
    return;
  }

  const ga4_ecommerce_object = {
    currency: cartLine?.merchandise?.price?.currencyCode,
    value: Number(cartLine?.cost?.totalAmount?.amount || 0),
    items: [
      {
        item_id:
          cartLine?.merchandise?.sku ||
          cartLine?.merchandise?.id ||
          cartLine?.merchandise?.product?.id ||
          "",
        item_name: cartLine?.merchandise?.product?.title || "",
        affiliation: "",
        coupon: "",
        discount: 0,
        index: 0,
        item_brand: cartLine?.merchandise?.product?.vendor || "",
        item_category: cartLine?.merchandise?.product?.type || "",
        item_category2: "",
        item_category3: "",
        item_category4: "",
        item_category5: "",
        item_list_id: "",
        item_list_name: "",
        item_variant: cartLine?.merchandise?.title || "",
        location_id: "",
        price: Number(cartLine?.merchandise?.price?.amount || 0),
        quantity: Number(cartLine?.quantity || 1),
      },
    ],
  };

  if (!isValidEcommerce(ga4_event_name, ga4_ecommerce_object)) {
    return;
  }

  pushEvent({
    event: ga4_event_name,
    ecommerce: ga4_ecommerce_object,
  });
});

analytics?.subscribe?.("cart_viewed", (event) => {
  flushEcommerce();

  const ga4_event_name = "view_cart";

  const cart = event?.data?.cart;

  if (!cart) {
    pushError(ga4_event_name, "missing analytics api data");
    return;
  }

  const ga4_ecommerce_object = {
    currency: cart?.cost?.totalAmount?.currencyCode,
    value: Number(cart?.cost?.totalAmount?.amount || 0),
    items: cart.lines
      ? cart.lines.map((line, index) => ({
          item_id:
            line.merchandise?.sku ||
            line.merchandise?.id ||
            line.merchandise?.product?.id ||
            "",
          item_name: line.merchandise?.product?.title || "",
          affiliation: "",
          coupon: "",
          discount: 0,
          index,
          item_brand: line.merchandise?.product?.vendor || "",
          item_category: line.merchandise?.product?.type || "",
          item_category2: "",
          item_category3: "",
          item_category4: "",
          item_category5: "",
          item_list_id: "",
          item_list_name: "",
          item_variant: line.merchandise?.title || "",
          location_id: "",
          price: Number(line.merchandise?.price?.amount || 0),
          quantity: Number(line?.quantity || 1),
        }))
      : [],
  };

  if (!isValidEcommerce(ga4_event_name, ga4_ecommerce_object)) {
    return;
  }

  pushEvent({
    event: ga4_event_name,
    ecommerce: ga4_ecommerce_object,
  });
});

/* ---------------------- Checkout ---------------------- */
analytics?.subscribe?.("checkout_started", (event) => {
  flushEcommerce();

  const ga4_event_name = "begin_checkout";

  const checkout = event?.data?.checkout;

  if (!checkout) {
    pushError(ga4_event_name, "missing analytics api data");
    return;
  }

  const ga4_ecommerce_object = {
    currency: checkout?.totalPrice?.currencyCode || checkout?.currencyCode,
    value: Number(checkout?.totalPrice?.amount || 0),
    coupon: checkout?.discountApplications?.[0]?.title || "",
    items: checkout?.lineItems
      ? checkout.lineItems.map((line, index) => ({
          item_id:
            line.variant?.sku ||
            line.variant?.id ||
            line.variant?.product?.id ||
            "",
          item_name: line.variant?.product?.title || "",
          affiliation: "",
          coupon: "",
          discount: 0,
          index,
          item_brand: line.variant?.product?.vendor || "",
          item_category: line.variant?.product?.type || "",
          item_category2: "",
          item_category3: "",
          item_category4: "",
          item_category5: "",
          item_list_id: "",
          item_list_name: "",
          item_variant: line.variant?.title || "",
          location_id: "",
          price: Number(line.variant?.price?.amount || 0),
          quantity: Number(line.quantity || 1),
        }))
      : [],
  };

  if (!isValidEcommerce(ga4_event_name, ga4_ecommerce_object)) {
    return;
  }

  pushEvent({
    event: ga4_event_name,
    ecommerce: ga4_ecommerce_object,
  });
});

analytics?.subscribe?.("checkout_address_info_submitted", async (event) => {
  flushEcommerce();

  const ga4_event_name = "add_shipping_info";

  const checkout = event?.data?.checkout;

  if (!checkout) {
    pushError(ga4_event_name, "missing analytics api data");
    return;
  }

  if (checkout.email) {
    __userEmail = (checkout.email || "").toLowerCase() || null;
    userEmailHash = await sha256(__userEmail);
  }

  const ga4_ecommerce_object = {
    currency: checkout?.totalPrice?.currencyCode || checkout?.currencyCode,
    value: Number(checkout?.totalPrice?.amount || 0),
    coupon: checkout?.discountApplications?.[0]?.title || "",
    shipping_tier: checkout?.delivery?.selectedDeliveryOptions?.type,
    items: checkout?.lineItems
      ? checkout.lineItems.map((line, index) => ({
          item_id:
            line.variant?.sku ||
            line.variant?.id ||
            line.variant?.product?.id ||
            "",
          item_name: line.variant?.product?.title || "",
          affiliation: "",
          coupon:
            line.discountAllocations?.[0]?.discountApplication?.title || "",
          discount: Number(line.discountAllocations?.[0]?.amount?.amount || 0),
          index,
          item_brand: line.variant?.product?.vendor || "",
          item_category: line.variant?.product?.type || "",
          item_category2: "",
          item_category3: "",
          item_category4: "",
          item_category5: "",
          item_list_id: "",
          item_list_name: "",
          item_variant: line.variant?.title || "",
          location_id: "",
          price: Number(line.variant?.price?.amount || 0),
          quantity: Number(line.quantity || 1),
        }))
      : [],
  };

  if (!isValidEcommerce(ga4_event_name, ga4_ecommerce_object)) {
    return;
  }

  pushEvent({
    event: ga4_event_name,
    ecommerce: ga4_ecommerce_object,
    user_email_hash: userEmailHash,
    __user_email: __userEmail,
  });
});

analytics?.subscribe?.("payment_info_submitted", (event) => {
  flushEcommerce();

  const ga4_event_name = "add_payment_info";

  const checkout = event?.data?.checkout;

  if (!checkout) {
    pushError(ga4_event_name, "missing analytics api data");
    return;
  }

  const ga4_ecommerce_object = {
    currency: checkout?.totalPrice?.currencyCode || checkout?.currencyCode,
    value: Number(checkout?.totalPrice?.amount || 0),
    coupon: checkout?.discountApplications?.[0]?.title || "",
    payment_type: String(checkout?.paymentMethod || ""),
    items: checkout?.lineItems
      ? checkout.lineItems.map((line, index) => ({
          item_id:
            line.variant?.sku ||
            line.variant?.id ||
            line.variant?.product?.id ||
            "",
          item_name: line.variant?.product?.title || "",
          affiliation: "",
          coupon:
            line.discountAllocations?.[0]?.discountApplication?.title || "",
          discount: Number(line.discountAllocations?.[0]?.amount?.amount || 0),
          index,
          item_brand: line.variant?.product?.vendor || "",
          item_category: line.variant?.product?.type || "",
          item_category2: "",
          item_category3: "",
          item_category4: "",
          item_category5: "",
          item_list_id: "",
          item_list_name: "",
          item_variant: line.variant?.title || "",
          location_id: "",
          price: Number(line.variant?.price?.amount || 0),
          quantity: Number(line.quantity || 1),
        }))
      : [],
  };

  if (!isValidEcommerce(ga4_event_name, ga4_ecommerce_object)) {
    return;
  }

  pushEvent({
    event: ga4_event_name,
    ecommerce: ga4_ecommerce_object,
  });
});

analytics?.subscribe?.("checkout_completed", async (event) => {
  flushEcommerce();

  const ga4_event_name = "purchase";

  const checkout = event?.data?.checkout;

  if (!checkout) {
    pushError(ga4_event_name, "missing analytics api data");
    return;
  }

  if (checkout.email) {
    __userEmail = (checkout.email || "").toLowerCase() || null;
    userEmailHash = await sha256(__userEmail);
  }

  const ga4_ecommerce_object = {
    currency: checkout?.totalPrice?.currencyCode || checkout?.currencyCode,
    value: Number(checkout?.totalPrice?.amount || 0),
    new_customer: checkout?.order?.customer?.isFirstOrder === true,
    customer_type:
      checkout?.order?.customer?.isFirstOrder === false ? "returning" : "new",
    transaction_id: checkout?.order?.id || checkout?.token,
    coupon: checkout?.discountApplications?.[0]?.title || "",
    shipping: Number(checkout?.shippingLine?.price?.amount || 0),
    tax: Number(checkout?.totalTax?.amount || 0),
    items: checkout?.lineItems
      ? checkout.lineItems.map((line, index) => ({
          item_id:
            line.variant?.sku ||
            line.variant?.id ||
            line.variant?.product?.id ||
            "",
          item_name: line.variant?.product?.title || "",
          affiliation: "",
          coupon:
            line.discountAllocations?.[0]?.discountApplication?.title || "",
          discount: Number(line.discountAllocations?.[0]?.amount?.amount || 0),
          index,
          item_brand: line.variant?.product?.vendor || "",
          item_category: line.variant?.product?.type || "",
          item_category2: "",
          item_category3: "",
          item_category4: "",
          item_category5: "",
          item_list_id: "",
          item_list_name: "",
          item_variant: line.variant?.title || "",
          location_id: "",
          price: Number(line.variant?.price?.amount || 0),
          quantity: Number(line.quantity || 1),
        }))
      : [],
  };

  if (!isValidEcommerce(ga4_event_name, ga4_ecommerce_object)) {
    return;
  }

  pushEvent({
    event: ga4_event_name,
    ecommerce: ga4_ecommerce_object,
    user_email_hash: userEmailHash,
    __user_email: __userEmail,
  });
});

/* ---------------------- Search ---------------------- */
analytics?.subscribe?.("search_submitted", (event) => {
  pushEvent({
    event: "search",
    search_term: event?.data?.searchResult?.query || "",
  });
});

/* ---------------------- shopify alerts ---------------------- */
analytics?.subscribe?.("alert_displayed", (event) => {
  pushEvent({
    event: "alert_displayed",
    alert_message: event?.data?.alert?.message,
    alert_target: event?.data?.alert?.target,
    alert_type: event?.data?.alert?.type,
    alert_value: event?.data?.alert?.value,
  });
});

/* ---------------------- shopify errors ---------------------- */
analytics?.subscribe?.("ui_extension_errored", (event) => {
  pushEvent({
    event: "ui_extension_errored",
    error_app_id: event?.data?.error?.appId,
    error_app_name: event?.data?.error?.appName,
    error_app_version: event?.data?.error?.appVersion,
    error_extension_name: event?.data?.error?.extensionName,
    error_extension_target: event?.data?.error?.extensionTarget,
    error_message: event?.data?.error?.message,
    error_type: event?.data?.error?.type,
  });
});

/* ---------------------- Utility functions ---------------------- */
function getEnvironment() {
  const hostname = init?.context?.document?.location?.hostname;
  const isProdHostname = config.websiteDomain
    ? [config.websiteDomain].includes(hostname)
    : true;
  const isTestingEnvironment = !!sessionStorage.getItem("webPixelDebug");
  const isProd = isProdHostname && !isTestingEnvironment;
  return isProd ? "production" : "development";
}

function shouldInitGTM() {
  if (gtmLoaded) return false;

  if (config.loadGtmOnFollowingConsents.length > 0) {
    if (
      config.loadGtmOnFollowingConsents.filter(
        (category) => userConsent[category],
      ).length > 0
    ) {
      return true;
    } else {
      return false;
    }
  } else {
    return true;
  }
}

function initializeGTM() {
  (function (w, d, s, l, i) {
    w[l] = w[l] || [];
    w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
    var f = d.getElementsByTagName(s)[0],
      j = d.createElement(s),
      dl = l != "dataLayer" ? "&l=" + l : "";
    j.async = true;
    j.src =
      "https://" +
      (customEndpointGTM ? customEndpointGTM : "www.googletagmanager.com") +
      "/gtm.js?id=" +
      i +
      dl +
      (isProd
        ? ""
        : "&gtm_auth=QKY8WHHpfGJxmAMhJP4-Wg&gtm_preview=env-3&gtm_cookies_win=x");
    f?.parentNode?.insertBefore(j, f);
  })(window, document, "script", "dataLayer", "GTM-K7Q2BTR2");
  gtmLoaded = true;
}

function applyDebugLogs() {
  if (!config.enableLogsInDev && !config.enableLogsInProd) return;

  const isProd = getEnvironment() === "production";

  if (isProd && !config.enableLogsInProd) return;

  if (!isProd && !config.enableLogsInDev) return;

  const originalPush = window.dataLayer.push.bind(window.dataLayer);

  window.dataLayer.push = function (...args) {
    console.groupCollapsed(
      "[debug] dataLayer.push - event:",
      args[0]?.event || "unknown",
    );
    console.log(JSON.stringify(...args, null, 2));
    console.groupEnd();
    return originalPush(...args);
  };

  console.groupCollapsed("[debug] init - event");
  console.log(JSON.stringify(init, null, 2));
  console.groupEnd();
}

function isLocalePrefix(string) {
  return /^[a-z]{2}-[a-z]{2}$/.test(string);
}

function getLocaleFromPathname(pathname) {
  if (!pathname || pathname === "/") return null;
  const segments = pathname.split("/").filter(Boolean);
  for (const segment of segments) {
    if (isLocalePrefix(segment)) return segment;
  }
  return null;
}

function getLanguageFromPathname(pathname) {
  const locale = getLocaleFromPathname(pathname);
  return locale ? locale.split("-")[0] : defaultShopLanguage;
}

function getCountryFromPathname(pathname) {
  const locale = getLocaleFromPathname(pathname);
  if (!locale || !locale.includes("-")) return defaultShopCountry;
  return locale.split("-")[1];
}

function getTypeFromPathname(pathname) {
  if (!pathname || pathname === "/") {
    return "home";
  }

  const lookup = {
    pages: "page",
    collections: "collection",
    products: "product",
    checkout: "checkout",
    checkouts: "checkout",
    blogs: "blog",
    articles: "article",
    search: "search",
    cart: "cart",
    account: "account",
  };

  const segments = pathname.split("/").filter(Boolean);

  // Skip locale prefix wherever it appears — first segment or mid-path
  const typeSegment = segments.find((s) => !isLocalePrefix(s));

  return lookup[typeSegment] || "other";
}

function flushEcommerce() {
  pushEvent({ ecommerce: null });
}

function pushEvent(data) {
  dataLayer.push(data);
}

async function sha256(text) {
  if (!text) return null;
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
