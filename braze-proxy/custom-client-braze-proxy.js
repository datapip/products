/**
 * © 2026 datapip.de — https://datapip.gumroad.com/l/braze-sgtm-proxy
 * Unofficial community integration. Not affiliated with or endorsed by Braze, Inc.
 * Braze™ is a trademark of Braze, Inc.
 * Single-company license. Sharing, redistribution, or resale outside of the
 * purchasing entity is strictly prohibited.
 * Provided "as-is" without warranty. The author assumes no liability for data loss,
 * tracking disruptions, or damages.
 */

const claimRequest = require("claimRequest");
const getRequestPath = require("getRequestPath");
const getRequestMethod = require("getRequestMethod");
const getRequestQueryString = require("getRequestQueryString");
const getRequestBody = require("getRequestBody");
const getRequestHeader = require("getRequestHeader");
const getRemoteAddress = require("getRemoteAddress");
const sendHttpRequest = require("sendHttpRequest");
const returnResponse = require("returnResponse");
const setResponseHeader = require("setResponseHeader");
const setResponseBody = require("setResponseBody");
const setResponseStatus = require("setResponseStatus");
const makeString = require("makeString");
const makeNumber = require("makeNumber");
const log = require("logToConsole");
const JSON = require("JSON");

const CONFIG = {
  brazeCdnUrl: "https://js.appboycdn.com",
  brazeBaseUrl: normalizeBaseUrl(data.API_ENDPOINT),
  allowedOrigins: (data.ALLOWED_ORIGINS || [])
    .map((row) => makeString(row.ORIGIN || ""))
    .filter((o) => o !== ""),
  allowedApiKeys: (data.ALLOWED_API_KEYS || [])
    .map((row) => makeString(row.API_KEY || ""))
    .filter((a) => a !== ""),
  additionalHeaders: (data.ADDITIONAL_HEADERS || []).map((key) => key.HEADER),
  timeoutSdk: makeNumber(data.SDK_TIMEOUT || 5000),
  timeoutApi: makeNumber(data.API_TIMEOUT || 10000),
  standardHeaders: [
    "x-braze-sdk-version",
    "x-braze-request-id",
    "x-braze-sdk-flavor",
    "x-braze-api-key",
    "x-braze-datacenters",
    "x-braze-device-id",
    "x-braze-datarequest",
    "braze-sync-retry-count",
    "x-braze-last-req-ms-ago",
    "x-braze-req-attempt",
    "x-braze-triggersrequest",
    "x-requested-with",
    "x-ratelimit-limit",
    "x-braze-contentcardsrequest",
    "x-braze-req-tokens-remaining",
    "content-type",
    "user-agent",
    "origin",
    "referer",
  ],
  blockedResponseHeaders: [
    "content-length",
    "transfer-encoding",
    "connection",
    "content-encoding",
    "access-control-allow-origin",
    "access-control-allow-credentials",
  ],
};

// Logging
const previewHeader = getRequestHeader("x-gtm-server-preview");
const isPreview = !!previewHeader;
if (isPreview) log("Braze Proxy: config", CONFIG);

// Entry
const path = getRequestPath();
if (!path) return;

// Router
if (isSdkPath(path) && isSafePath(path)) {
  claimRequest();
  handleSdk(path);
} else if (path.indexOf("/api/v3/") === 0 && isSafePath(path)) {
  claimRequest();
  handleApi(path);
}

// Logic handlers
function handleSdk(path) {
  // Origin validation
  const referer = getRequestHeader("referer");

  if (!isAllowedReferer(referer)) {
    if (isPreview) log("Braze Proxy: referrer not allowed:", referer);
    return deny(403, "Forbidden");
  }

  const upstreamUrl = CONFIG.brazeCdnUrl + path;
  sendHttpRequest(upstreamUrl, { method: "GET", timeout: CONFIG.timeoutSdk })
    .then(handleSdkSuccess)
    .catch(handleFailure);
}

function handleApi(path) {
  // Get origin
  const origin = getRequestHeader("origin");

  // Origin validation
  if (!isAllowedOrigin(origin)) {
    if (isPreview) log("Braze Proxy: origin not allowed:", origin);
    return deny(403, "Forbidden");
  }

  // Set headers
  setHeaders(origin);

  // Handle preflight
  const method = getRequestMethod();
  if (method === "OPTIONS") {
    return handlePreflight();
  }

  // API key validation
  const apiKey = getRequestHeader("x-braze-api-key");
  if (!apiKey || !isValidApiKey(apiKey)) {
    if (isPreview) log("Braze Proxy: api key missing or not allowed");
    return deny(403, "Forbidden");
  }

  // Request preparation
  const requestBody = normalizeBody(getRequestBody());
  const targetUrl = buildTargetUrl(path, getRequestQueryString());
  const clientIp = getRemoteAddress();
  const headers = buildForwardHeaders(clientIp, method);

  // Forward request
  sendHttpRequest(
    targetUrl,
    { method: method, headers: headers, timeout: CONFIG.timeoutApi },
    requestBody,
  )
    .then(handleApiSuccess)
    .catch(handleFailure);
}

// Helpers
function normalizeBaseUrl(url) {
  const string = makeString(url || "");
  return string.slice(-1) === "/" ? string.slice(0, -1) : string;
}

function isSafePath(path) {
  return path.indexOf("..") === -1 && path.indexOf("//") === -1;
}

function isSdkPath(path) {
  return (
    path.indexOf("/web-sdk/") === 0 &&
    (path.slice(-7) === ".min.js" || path.slice(-11) === ".min.js.map")
  );
}

function isAllowedOrigin(origin) {
  if (isPreview) log("Braze Proxy: check origin:", origin);
  if (!CONFIG.allowedOrigins.length) return true;
  const normalized = makeString(origin || "").toLowerCase();
  for (let i = 0; i < CONFIG.allowedOrigins.length; i++) {
    if (CONFIG.allowedOrigins[i] === normalized) return true;
  }
  return false;
}

function isAllowedReferer(referer) {
  if (isPreview) log("Braze Proxy: check referer:", referer);
  if (!CONFIG.allowedOrigins.length) return true;
  if (!referer) return false;
  const normalized = makeString(referer).toLowerCase();
  for (let i = 0; i < CONFIG.allowedOrigins.length; i++) {
    const origin = CONFIG.allowedOrigins[i];
    if (normalized.indexOf(origin) === 0) {
      const after = normalized.slice(origin.length);
      if (
        after === "" ||
        after[0] === "/" ||
        after[0] === "?" ||
        after[0] === "#"
      )
        return true;
    }
  }
  return false;
}

function isValidApiKey(apiKey) {
  if (!CONFIG.allowedApiKeys.length) return true;
  for (let i = 0; i < CONFIG.allowedApiKeys.length; i++) {
    if (CONFIG.allowedApiKeys[i] === apiKey) return true;
  }
  if (isPreview) log("Braze Proxy: no valid api key");
  return false;
}

function setHeaders(origin) {
  const requestedHeaders = getRequestHeader("access-control-request-headers");
  if (requestedHeaders) {
    setResponseHeader("access-control-allow-headers", requestedHeaders);
  }
  setResponseHeader("access-control-allow-origin", origin);
  setResponseHeader("access-control-max-age", "86400");
  setResponseHeader("access-control-allow-credentials", "true");
  setResponseHeader("access-control-allow-methods", "POST,GET,OPTIONS");
  setResponseHeader("vary", "origin");
}

function handlePreflight() {
  setResponseStatus(204);
  returnResponse();
}

function normalizeBody(body) {
  if (!body) return "";
  if (typeof body === "object") {
    return JSON.stringify(body);
  }
  return body;
}

function buildTargetUrl(path, queryString) {
  return CONFIG.brazeBaseUrl + path + (queryString ? "?" + queryString : "");
}

function buildForwardHeaders(clientIp, method) {
  const headers = {};
  const forwardHeaders = [].concat(
    CONFIG.standardHeaders,
    CONFIG.additionalHeaders,
  );
  forwardHeaders.forEach((header) => {
    const value = getRequestHeader(header);
    if (value) headers[header] = value;
  });

  if (method === "POST" && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  if (clientIp) {
    headers["x-forwarded-for"] = clientIp;
  }

  return headers;
}

function handleSdkSuccess(result) {
  if (result.statusCode >= 400) {
    return handleFailure("CDN returned: " + result.statusCode);
  }
  const origin = getRequestHeader("origin");
  if (origin) {
    setResponseHeader("access-control-allow-origin", origin);
    setResponseHeader("vary", "origin");
  }
  setResponseHeader("cache-control", "public, max-age=14400");
  setResponseHeader("content-type", "application/javascript");
  setResponseStatus(result.statusCode);
  setResponseBody(result.body);
  returnResponse();
}

function handleApiSuccess(result) {
  setResponseStatus(result.statusCode);
  if (result.headers) {
    for (const key in result.headers) {
      const lowerKey = key.toLowerCase();
      if (CONFIG.blockedResponseHeaders.indexOf(lowerKey) === -1) {
        setResponseHeader(key, result.headers[key]);
      }
    }
  }
  setResponseBody(result.body || "");
  returnResponse();
}

function handleFailure(error) {
  if (error && isPreview) log("Braze Proxy: error", error);
  setResponseStatus(502);
  setResponseBody("Upstream service error");
  returnResponse();
}

function deny(status, message) {
  setResponseStatus(status);
  setResponseBody(message);
  returnResponse();
}
