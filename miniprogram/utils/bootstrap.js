const { readHouseholdCache, writeHouseholdCache } = require("./cache");
const { requestHumi } = require("./request");

const LAST_HOUSEHOLD_KEY = "humi:bootstrap:last-household:v1";
const SHARE_TOKEN_TYPES = [
  ["crave", "crave"],
  ["grocery", "grocery"],
  ["groceryShare", "grocery"],
  ["menuShare", "today_menu"],
  ["wishShare", "wish"],
  ["invite", "invite"],
  ["mealTask", "meal_task"]
];

function resolveStartupRoute({ candidate, envelope }) {
  if (!candidate) return { route: "/pages/legacy/index", reason: "package_disabled" };
  if (!envelope?.capabilities?.nativeShellEnabled) return { route: "/pages/legacy/index", reason: "server_disabled" };
  if (envelope.user?.profileStatus !== "complete") return { route: "/pages/identity/index", reason: "identity_incomplete" };
  return { route: "/pages/tonight/index", reason: "native_enabled" };
}

function resolveKnownShareRoute(options = {}) {
  const match = SHARE_TOKEN_TYPES.find(([key]) => normalizeOption(options[key]));
  if (!match) return null;
  const [key, type] = match;
  const token = normalizeOption(options[key]);
  const shareSource = normalizeOption(options.shareSource);
  const query = [`type=${encodeURIComponent(type)}`, `token=${encodeURIComponent(token)}`];
  if (shareSource) query.push(`shareSource=${encodeURIComponent(shareSource)}`);
  return `/pages/share/index?${query.join("&")}`;
}

async function loadBootstrap({ allowCache = false } = {}) {
  try {
    const envelope = await requestHumi({ path: "/bootstrap" });
    const householdId = getHouseholdId(envelope);
    if (householdId) {
      writeHouseholdCache(householdId, envelope);
      wx.setStorageSync(LAST_HOUSEHOLD_KEY, householdId);
    }
    return envelope;
  } catch (error) {
    if (!allowCache) throw error;
    const householdId = wx.getStorageSync(LAST_HOUSEHOLD_KEY);
    const cached = householdId ? readHouseholdCache(householdId) : null;
    if (!cached?.envelope) throw error;
    return { ...cached.envelope, cacheState: "cached" };
  }
}

function getHouseholdId(envelope = {}) {
  return String(envelope.activeHousehold?.id || envelope.currentHouseholdId || "");
}

function normalizeOption(value) {
  return String(value || "").slice(0, 120);
}

module.exports = { getHouseholdId, loadBootstrap, resolveKnownShareRoute, resolveStartupRoute };
