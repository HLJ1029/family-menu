const CONTENT_ENTRY_KEYS = new Set([
  "channel",
  "h5v",
  "humiTicket",
  "contentRoute",
  "recipeId",
]);

export function parseH5ContentEntry(search = "") {
  const params = new URLSearchParams(String(search || ""));
  const route = params.get("contentRoute");
  if (!["recipe", "stats", "history"].includes(route)) return null;
  if ([...params.keys()].some((key) => !CONTENT_ENTRY_KEYS.has(key))) return null;
  if (
    params.getAll("contentRoute").length !== 1
    || params.getAll("humiTicket").length > 1
    || params.getAll("recipeId").length > 1
  ) return null;
  if (route === "recipe") {
    const recipeId = params.get("recipeId") || "";
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(recipeId)) return null;
    return { route, initialView: "library", recipeId };
  }
  if (params.has("recipeId")) return null;
  return { route, initialView: "stats", recipeId: null };
}
