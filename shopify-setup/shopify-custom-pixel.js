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

  // state the endpoint for your live GTM
  // container ID (e.g. GTM-ABCD1234):
  gtmSnippet: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl+ '&gtm_auth=AIx1Q7TX0FU-y5mdVjE_Dg&gtm_preview=env-66&gtm_cookies_win=x';f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-K84QTPLJ');`,

  // Optional: state the endpoint for your
  // development GTM container ID:
  gtmSnippetDev: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl+ '&gtm_auth=AIx1Q7TX0FU-y5mdVjE_Dg&gtm_preview=env-66&gtm_cookies_win=x';f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-K84QTPLJ');`,

  // select consent(s) to load GTM,
  // leave empty to load instantly.
  // Available consent categories:
  // "preferences", "analytics", "marketing"
  loadGtmOnFollowingConsents: ["analytics", "marketing"],

  // Optional: define if debug info should be
  // logged to console in test environment:
  enableLogsInDev: true,

  // Optional: define if debug info should be
  // logged to console in live environment:
  enableLogsInProd: false,

  // select shopify user data to be
  // pushed in hashed format.
  // Available user data:
  // "firstName", "lastName", "email", "phone"
  pushHashedUserData: ["firstName", "lastName", "email", "phone"],

  // select shopify user data to be
  // pushed in clear format.
  // Available user data:
  // "firstName", "lastName", "email", "phone", "street", "city", "region", "zip", "country"
  pushClearUserData: ["street", "city", "region", "zip", "country"],
};

/* ------------------------ Check ------------------------ */
checkConfig();

/* ---------------------- Variables ---------------------- */
const environment = getEnvironment();
let gtmLoaded = false;
let pendingEvents = [];

let userData = {
  userId: init?.data?.customer?.id || null,
  userOrdersCount: init?.data?.customer?.ordersCount || null,
  firstName:
    (init?.data?.customer?.firstName || "").trim().toLowerCase() || null,
  firstNameHash: null,
  lastName: (init?.data?.customer?.lastName || "").trim().toLowerCase() || null,
  lastNameHash: null,
  email: (init?.data?.customer?.email || "").trim().toLowerCase() || null,
  emailHash: null,
  phone: (init?.data?.customer?.phone || "").trim() || null,
  phoneHash: null,
  street: null,
  city: null,
  region: null,
  zip: null,
  country: null,
};

let userConsent = {
  preferences: false,
  analytics: false,
  marketing: false,
};

/* ---------------------- Hash user data ---------------------- */
const hashesReady = (async () => {
  userData.firstNameHash =
    userData.firstName ? await sha256(userData.firstName) : null;
  userData.lastNameHash =
    userData.lastName ? await sha256(userData.lastName) : null;
  userData.emailHash = userData.email ? await sha256(userData.email) : null;
  userData.phoneHash = userData.phone ? await sha256(userData.phone) : null;
})();

/* ---------------------- Initialize dataLayer ---------------------- */
window.dataLayer = window.dataLayer || [];

window.gtag = function () {
  window.dataLayer.push(arguments);
};

initializeDebugLogs();

/* ---------------------- Handling initial consent ---------------------- */
gtag("consent", "default", {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
});

window.dataLayer.push({
  event: "consent_default",
  consent_preferences: userConsent.preferences,
  consent_analytics: userConsent.analytics,
  consent_marketing: userConsent.marketing,
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
    consent_preferences: userConsent.preferences,
    consent_analytics: userConsent.analytics,
    consent_marketing: userConsent.marketing,
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
    consent_preferences: userConsent.preferences,
    consent_analytics: userConsent.analytics,
    consent_marketing: userConsent.marketing,
  });

  if (shouldInitGTM()) initializeGTM();
});

/* ---------------------- Page view ---------------------- */
analytics?.subscribe?.("page_viewed", async (event) => {
  await hashesReady;

  const ga4EventName = "page_view";

  const pageViewObject = {
    page_referrer: event?.context?.document?.referrer,
    page_location: event?.context?.document?.location?.href,
    page_hash: event?.context?.document?.location?.hash,
    page_search: event?.context?.document?.location?.search,
    page_title: event?.context?.document?.title,
    environment: environment,
  };

  const userDataObject = getUserData();
  userDataObject.id = userData.userId;
  userDataObject.orders_count = userData.userOrdersCount;

  if (validateEvent("page_view", { event: ga4EventName, ...pageViewObject })) {
    pushEvent({ event: ga4EventName, ...pageViewObject, user: userDataObject });
  }
});

/* ---------------------- Collection view ---------------------- */
analytics?.subscribe?.("collection_viewed", (event) => {
  const ga4EventName = "view_item_list";

  const collection = event?.data?.collection;

  if (!collection) {
    pushError(ga4EventName, "missing analytics api data");
    return;
  }

  const ga4EcommerceObject = {
    item_list_id: collection?.id,
    item_list_name: collection?.title,
    items:
      collection.productVariants ?
        collection.productVariants.map((variant, index) => ({
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

  if (validateEvent(ga4EventName, ga4EcommerceObject)) {
    flushEcommerce();
    pushEvent({ event: ga4EventName, ecommerce: ga4EcommerceObject });
  }
});

/* ---------------------- Product viewed ---------------------- */
analytics?.subscribe?.("product_viewed", (event) => {
  const ga4EventName = "view_item";

  const variant = event?.data?.productVariant;

  if (!variant) {
    pushError(ga4EventName, "missing analytics api data");
    return;
  }

  const ga4EcommerceObject = {
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

  if (validateEvent(ga4EventName, ga4EcommerceObject)) {
    flushEcommerce();
    pushEvent({ event: ga4EventName, ecommerce: ga4EcommerceObject });
  }
});

/* ---------------------- Cart actions ---------------------- */
analytics?.subscribe?.("product_added_to_cart", (event) => {
  const ga4EventName = "add_to_cart";

  const cartLine = event?.data?.cartLine;

  if (!cartLine) {
    pushError(ga4EventName, "missing analytics api data");
    return;
  }

  const ga4EcommerceObject = {
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

  if (validateEvent(ga4EventName, ga4EcommerceObject)) {
    flushEcommerce();
    pushEvent({ event: ga4EventName, ecommerce: ga4EcommerceObject });
  }
});

analytics?.subscribe?.("product_removed_from_cart", (event) => {
  const ga4EventName = "remove_from_cart";

  const cartLine = event?.data?.cartLine;

  if (!cartLine) {
    pushError(ga4EventName, "missing analytics api data");
    return;
  }

  const ga4EcommerceObject = {
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

  if (validateEvent(ga4EventName, ga4EcommerceObject)) {
    flushEcommerce();
    pushEvent({ event: ga4EventName, ecommerce: ga4EcommerceObject });
  }
});

analytics?.subscribe?.("cart_viewed", (event) => {
  const ga4EventName = "view_cart";

  const cart = event?.data?.cart;

  if (!cart) {
    pushError(ga4EventName, "missing analytics api data");
    return;
  }

  const ga4EcommerceObject = {
    currency: cart?.cost?.totalAmount?.currencyCode,
    value: Number(cart?.cost?.totalAmount?.amount || 0),
    items:
      cart.lines ?
        cart.lines.map((line, index) => ({
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

  if (validateEvent(ga4EventName, ga4EcommerceObject)) {
    flushEcommerce();
    pushEvent({ event: ga4EventName, ecommerce: ga4EcommerceObject });
  }
});

/* ---------------------- Checkout ---------------------- */
analytics?.subscribe?.("checkout_started", (event) => {
  const ga4EventName = "begin_checkout";

  const checkout = event?.data?.checkout;

  if (!checkout) {
    pushError(ga4EventName, "missing analytics api data");
    return;
  }

  const ga4EcommerceObject = {
    currency: checkout?.totalPrice?.currencyCode || checkout?.currencyCode,
    value: Number(checkout?.totalPrice?.amount || 0),
    coupon: checkout?.discountApplications?.[0]?.title || "",
    items:
      checkout?.lineItems ?
        checkout.lineItems.map((line, index) => ({
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

  if (validateEvent(ga4EventName, ga4EcommerceObject)) {
    flushEcommerce();
    pushEvent({ event: ga4EventName, ecommerce: ga4EcommerceObject });
  }
});

analytics?.subscribe?.("checkout_address_info_submitted", async (event) => {
  const checkout = event?.data?.checkout;

  if (!checkout) {
    return;
  }

  await updateUserData(checkout);
  const userDataObject = getUserData();

  window.dataLayer.push({
    event: "user_update",
    user: userDataObject,
  });
});

analytics?.subscribe?.("checkout_shipping_info_submitted", async (event) => {
  const ga4EventName = "add_shipping_info";

  const checkout = event?.data?.checkout;

  if (!checkout) {
    pushError(ga4EventName, "missing analytics api data");
    return;
  }

  await updateUserData(checkout);

  const ga4EcommerceObject = {
    currency: checkout?.totalPrice?.currencyCode || checkout?.currencyCode,
    value: Number(checkout?.totalPrice?.amount || 0),
    coupon: checkout?.discountApplications?.[0]?.title || "",
    shipping_tier:
      checkout?.delivery?.selectedDeliveryOptions?.[0]?.title ||
      checkout?.delivery?.selectedDeliveryOptions?.[0]?.type ||
      "",
    items:
      checkout?.lineItems ?
        checkout.lineItems.map((line, index) => ({
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

  const userDataObject = getUserData();

  if (validateEvent(ga4EventName, ga4EcommerceObject)) {
    flushEcommerce();
    pushEvent({
      event: ga4EventName,
      ecommerce: ga4EcommerceObject,
      user: userDataObject,
    });
  }
});

analytics?.subscribe?.("payment_info_submitted", async (event) => {
  const ga4EventName = "add_payment_info";

  const checkout = event?.data?.checkout;

  if (!checkout) {
    pushError(ga4EventName, "missing analytics api data");
    return;
  }

  await updateUserData(checkout);

  const ga4EcommerceObject = {
    currency: checkout?.totalPrice?.currencyCode || checkout?.currencyCode,
    value: Number(checkout?.totalPrice?.amount || 0),
    coupon: checkout?.discountApplications?.[0]?.title || "",
    payment_type:
      checkout?.transactions?.[0]?.paymentMethod?.name ||
      checkout?.transactions?.[0]?.paymentMethod?.type ||
      "",
    items:
      checkout?.lineItems ?
        checkout.lineItems.map((line, index) => ({
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

  const userDataObject = getUserData();

  if (validateEvent(ga4EventName, ga4EcommerceObject)) {
    flushEcommerce();
    pushEvent({
      event: ga4EventName,
      ecommerce: ga4EcommerceObject,
      user: userDataObject,
    });
  }
});

analytics?.subscribe?.("checkout_completed", async (event) => {
  const ga4EventName = "purchase";

  const checkout = event?.data?.checkout;

  if (!checkout) {
    pushError(ga4EventName, "missing analytics api data");
    return;
  }

  await updateUserData(checkout);

  const isNewCustomer = checkout?.order?.customer?.isFirstOrder ?? null;
  const customerType =
    checkout?.order?.customer?.isFirstOrder === true ? "new"
    : checkout?.order?.customer?.isFirstOrder === false ? "returning"
    : null;

  const ga4EcommerceObject = {
    currency: checkout?.totalPrice?.currencyCode || checkout?.currencyCode,
    value: Number(checkout?.totalPrice?.amount || 0),
    transaction_id: checkout?.order?.id || checkout?.token,
    coupon: checkout?.discountApplications?.[0]?.title || "",
    shipping: Number(checkout?.shippingLine?.price?.amount || 0),
    tax: Number(checkout?.totalTax?.amount || 0),
    items:
      checkout?.lineItems ?
        checkout.lineItems.map((line, index) => ({
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

  const userDataObject = getUserData();

  if (validateEvent(ga4EventName, ga4EcommerceObject)) {
    flushEcommerce();
    pushEvent({
      event: ga4EventName,
      new_customer: isNewCustomer,
      customer_type: customerType,
      ecommerce: ga4EcommerceObject,
      user: userDataObject,
    });
  }
});

/* ---------------------- Search ---------------------- */
analytics?.subscribe?.("search_submitted", (event) => {
  const ga4EventName = "search";

  const ga4SearchTerm = event?.data?.searchResult?.query || "";

  if (!ga4SearchTerm) {
    pushError(ga4EventName, "missing analytics api data");
    return;
  }

  if (validateEvent(ga4EventName, { search_term: ga4SearchTerm })) {
    pushEvent({
      event: ga4EventName,
      search_term: ga4SearchTerm,
    });
  }
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

/* ---------------------- Validation functions ---------------------- */
function checkConfig() {
  const warnings = [];

  if (!config.websiteDomain) {
    warnings.push(
      'config.websiteDomain is not set — environment detection defaults to "production".',
    );
  }

  if (!config.gtmSnippet) {
    warnings.push(
      "config.gtmSnippet is not set — Google Tag Manager will not load.",
    );
  }

  if (warnings.length > 0) {
    console.warn(
      "[Shopify Custom Pixel] Setup incomplete:\n" +
        warnings.map((w) => `  • ${w}`).join("\n"),
    );
  }
}

const EVENT_REQUIRED_PARAMS = {
  page_view: ["page_location"],
  view_item_list: ["items"],
  view_item: ["currency", "value", "items"],
  add_to_cart: ["currency", "value", "items"],
  remove_from_cart: ["currency", "value", "items"],
  view_cart: ["currency", "value"],
  begin_checkout: ["currency", "value", "items"],
  add_shipping_info: ["currency", "value", "shipping_tier", "items"],
  add_payment_info: ["currency", "value", "payment_type", "items"],
  purchase: ["currency", "value", "transaction_id", "items"],
  search: ["search_term"],
};

const PARAM_VALUE_FORMAT = {
  page_location: (input) => {
    try {
      new URL(input);
      return true;
    } catch (err) {
      return false;
    }
  },
  currency: (input) => {
    return /^[A-Z]{3}$/.test(input);
  },
  value: (input) => {
    return typeof input === "number";
  },
  shipping_tier: (input) => {
    return typeof input === "string";
  },
  payment_type: (input) => {
    return typeof input === "string";
  },
  transaction_id: (input) => {
    return typeof input === "string";
  },
  items: (input) => {
    return (
      input.length > 0 &&
      input.length ===
        input.filter(
          (item) =>
            typeof item.item_id === "string" &&
            typeof item.item_name === "string",
        ).length
    );
  },
  search_term: (input) => {
    return typeof input === "string";
  },
};

function validateEvent(eventName, params) {
  const requiredParams = EVENT_REQUIRED_PARAMS[eventName];

  if (!requiredParams) {
    console.warn(`[debug] unknown event: "${eventName}"`);
    return false;
  }

  const errors = [];

  for (const param of requiredParams) {
    if (
      !(param in params) ||
      params[param] === null ||
      params[param] === undefined
    ) {
      errors.push(`"${param}" is missing`);
      continue;
    }

    // Check format if a validator exists
    const formatValidator = PARAM_VALUE_FORMAT[param];
    if (formatValidator && !formatValidator(params[param])) {
      errors.push(
        `"${param}" has an invalid value: ${JSON.stringify(params[param])}`,
      );
    }
  }

  if (errors.length > 0) {
    console.groupCollapsed(`[debug] warning - ${eventName} incorrect`);
    console.log(errors);
    console.groupEnd();

    pushError(eventName, errors.join(" | "));
    return false;
  }

  return true;
}

/* ---------------------- Utility functions ---------------------- */
function getEnvironment() {
  const hostname = init?.context?.document?.location?.hostname;
  const isProdHostname =
    config.websiteDomain ? [config.websiteDomain].includes(hostname) : true;
  const isTestingEnvironment = !!sessionStorage.getItem("webPixelDebug");
  const isProd = isProdHostname && !isTestingEnvironment;
  return isProd ? "production" : "development";
}

function shouldInitGTM() {
  if (gtmLoaded) return false;

  if (config.loadGtmOnFollowingConsents.length > 0) {
    return config.loadGtmOnFollowingConsents.some(
      (category) => userConsent[category],
    );
  }

  return true;
}

function initializeGTM() {
  const isProd = environment === "production";
  const gtmSnippet =
    config.gtmSnippetDev ?
      isProd ? config.gtmSnippet
      : config.gtmSnippetDev
    : config.gtmSnippet;

  if (!gtmSnippet) {
    console.warn(
      "[debug] GTM snippet is missing - add under 'config.gtmSnippet'.",
    );
    return;
  }

  const scriptElement = document.createElement("script");
  scriptElement.text = gtmSnippet;
  document.head.appendChild(scriptElement);

  console.log("[debug] GTM snippet injeceted");

  gtmLoaded = true;

  pendingEvents.forEach((data) => window.dataLayer.push(data));
  pendingEvents = [];
}

function initializeDebugLogs() {
  if (!config.enableLogsInDev && !config.enableLogsInProd) return;

  const isProd = environment === "production";

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

function flushEcommerce() {
  pushEvent({ ecommerce: null });
}

function pushEvent(data) {
  if (gtmLoaded) {
    window.dataLayer.push(data);
  } else {
    pendingEvents.push(data);
  }
}

function pushError(event, message) {
  pushEvent({
    event: "datalayer_error",
    error_event: event,
    error_message: message,
  });
}

function getUserData() {
  return {
    first_name_hash:
      config.pushHashedUserData.includes("firstName") ?
        userData.firstNameHash
      : null,
    last_name_hash:
      config.pushHashedUserData.includes("lastName") ?
        userData.lastNameHash
      : null,
    email_hash:
      config.pushHashedUserData.includes("email") ? userData.emailHash : null,
    phone_hash:
      config.pushHashedUserData.includes("phone") ? userData.phoneHash : null,
    __first_name:
      config.pushClearUserData.includes("firstName") ?
        userData.firstName
      : null,
    __last_name:
      config.pushClearUserData.includes("lastName") ? userData.lastName : null,
    __email: config.pushClearUserData.includes("email") ? userData.email : null,
    __phone: config.pushClearUserData.includes("phone") ? userData.phone : null,
    street:
      config.pushClearUserData.includes("street") ? userData.street : null,
    city: config.pushClearUserData.includes("city") ? userData.city : null,
    region:
      config.pushClearUserData.includes("region") ? userData.region : null,
    zip: config.pushClearUserData.includes("zip") ? userData.zip : null,
    country:
      config.pushClearUserData.includes("country") ? userData.country : null,
  };
}

async function updateUserData(checkout) {
  const newEmail = checkout.email?.toLowerCase().trim();
  if (newEmail && newEmail !== userData.email) {
    userData.email = newEmail;
    userData.emailHash = await sha256(newEmail);
  }

  const newPhone = checkout.phone?.toLowerCase().trim();
  if (newPhone && newPhone !== userData.phone) {
    userData.phone = newPhone;
    userData.phoneHash = await sha256(newPhone);
  }

  const newFirstName = checkout.billingAddress?.firstName?.toLowerCase().trim();
  if (newFirstName && newFirstName !== userData.firstName) {
    userData.firstName = newFirstName;
    userData.firstNameHash = await sha256(newFirstName);
  }

  const newLastName = checkout.billingAddress?.lastName?.toLowerCase().trim();
  if (newLastName && newLastName !== userData.lastName) {
    userData.lastName = newLastName;
    userData.lastNameHash = await sha256(newLastName);
  }

  const newStreet = checkout.billingAddress?.address1?.toLowerCase().trim();
  if (newStreet && newStreet !== userData.street) {
    userData.street = newStreet;
  }

  const newCity = checkout.billingAddress?.city?.toLowerCase().trim();
  if (newCity && newCity !== userData.city) {
    userData.city = newCity;
  }

  const newRegion = checkout.billingAddress?.province?.toLowerCase().trim();
  if (newRegion && newRegion !== userData.region) {
    userData.region = newRegion;
  }

  const newZip = checkout.billingAddress?.zip?.toLowerCase().trim();
  if (newZip && newZip !== userData.zip) {
    userData.zip = newZip;
  }

  const newCountry = checkout.billingAddress?.countryCode?.toLowerCase().trim();
  if (newCountry && newCountry !== userData.country) {
    userData.country = newCountry;
  }
}

async function sha256(text) {
  if (!text) return null;
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
