const { getHumiH5Url } = require("./config");

const CONTENT_ROUTES = Object.freeze({
  recipe: ({ recipeId }) => `/recipe/${encodeURIComponent(recipeId)}`,
  stats: () => "/stats",
  history: () => "/history"
});

const CONTENT_PARAM_KEYS = Object.freeze({
  recipe: ["recipeId"],
  stats: [],
  history: []
});

function contentRouteError() {
  const error = new Error("content_route_invalid");
  error.code = "content_route_invalid";
  return error;
}

function buildAllowedContentUrl(route, params = {}) {
  if (typeof route !== "string" || !Object.prototype.hasOwnProperty.call(CONTENT_ROUTES, route)) {
    throw contentRouteError();
  }
  if (!params || typeof params !== "object" || Array.isArray(params)) throw contentRouteError();
  const allowedKeys = CONTENT_PARAM_KEYS[route];
  const keys = Object.keys(params);
  if (keys.some((key) => !allowedKeys.includes(key))) throw contentRouteError();
  if (route === "recipe") {
    const recipeId = String(params.recipeId || "");
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(recipeId)) throw contentRouteError();
    return CONTENT_ROUTES.recipe({ recipeId });
  }
  if (keys.length) throw contentRouteError();
  return CONTENT_ROUTES[route]({});
}

function buildTicketedH5ContentUrl(route, params, ticket) {
  buildAllowedContentUrl(route, params);
  const safeTicket = String(ticket || "");
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(safeTicket)) throw contentRouteError();
  const destination = parseTrustedH5Base(getHumiH5Url());
  const query = [
    ...destination.baseParams,
    ["contentRoute", route],
    ...(route === "recipe" ? [["recipeId", params.recipeId]] : []),
    ["humiTicket", safeTicket]
  ];
  return `${destination.origin}/?${query
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")}`;
}

function parseTrustedH5Base(value) {
  const source = String(value || "");
  if (source.includes("#")) throw contentRouteError();
  const match = /^https:\/\/www\.humi-home\.com(?::443)?\/?(?:\?([^#]*))?$/i.exec(source);
  if (!match) throw contentRouteError();
  const baseParams = [];
  const seen = new Set();
  for (const pair of String(match[1] || "").split("&")) {
    if (!pair) continue;
    const separator = pair.indexOf("=");
    const rawKey = separator >= 0 ? pair.slice(0, separator) : pair;
    const rawValue = separator >= 0 ? pair.slice(separator + 1) : "";
    let key;
    let decoded;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, " "));
      decoded = decodeURIComponent(rawValue.replace(/\+/g, " "));
    } catch (_) {
      throw contentRouteError();
    }
    if (seen.has(key)) continue;
    if (key === "channel" && /^[A-Za-z0-9_-]{1,40}$/.test(decoded)) {
      baseParams.push([key, decoded]);
      seen.add(key);
    } else if (key === "h5v" && /^[A-Za-z0-9._-]{1,32}$/.test(decoded)) {
      baseParams.push([key, decoded]);
      seen.add(key);
    }
  }
  return {
    origin: "https://www.humi-home.com",
    baseParams
  };
}

module.exports = {
  CONTENT_ROUTES,
  buildAllowedContentUrl,
  buildTicketedH5ContentUrl
};
