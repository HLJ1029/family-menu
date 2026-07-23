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
  const destination = new URL(getHumiH5Url());
  if (destination.protocol !== "https:" || destination.hash) throw contentRouteError();
  destination.pathname = "/";
  for (const key of [...destination.searchParams.keys()]) {
    if (!["channel", "h5v"].includes(key)) destination.searchParams.delete(key);
  }
  destination.searchParams.set("contentRoute", route);
  if (route === "recipe") destination.searchParams.set("recipeId", params.recipeId);
  destination.searchParams.set("humiTicket", safeTicket);
  destination.hash = "";
  return destination.toString();
}

module.exports = {
  CONTENT_ROUTES,
  buildAllowedContentUrl,
  buildTicketedH5ContentUrl
};
