const { householdCacheKey, readHouseholdCache, writeHouseholdCache } = require("./cache");
const { requestHumi } = require("./request");

const LAST_HOUSEHOLD_KEY_PREFIX = "humi:bootstrap:last-household:v1:";
const SHARE_TOKEN_TYPES = [
  ["crave", "crave"],
  ["grocery", "grocery"],
  ["groceryShare", "grocery"],
  ["menuShare", "today_menu"],
  ["wishShare", "wish"],
  ["invite", "invite"],
  ["mealTask", "meal_task"]
];
const SHARE_LANDING_TYPES = new Set(SHARE_TOKEN_TYPES.map(([, type]) => type));
const SAFE_LEGACY_VIEWS = new Set(["today", "user", "grocery"]);
const SAFE_LEGACY_SOURCES = new Set(["crave", "grocery", "today_menu", "wish", "invite", "meal_task"]);
const SAFE_LEGACY_FLAGS = ["humiLogout", "humiExpired", "humiResume"];
const SHARE_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

function resolveStartupRoute({ candidate, envelope }) {
  if (!candidate) return { route: "/pages/legacy/index", reason: "package_disabled" };
  if (!envelope?.capabilities?.nativeShellEnabled) return { route: "/pages/legacy/index", reason: "server_disabled" };
  if (!envelope?.capabilities?.mealExecutionEnabled) {
    return { route: "/pages/legacy/index?reason=meal_execution_disabled", reason: "meal_execution_disabled" };
  }
  if (envelope.user?.profileStatus !== "complete") return { route: "/pages/identity/index", reason: "identity_incomplete" };
  return { route: "/pages/tonight/index", reason: "native_enabled" };
}

function resolveKnownShareRoute(options = {}) {
  const matches = SHARE_TOKEN_TYPES.filter(([key]) => Object.prototype.hasOwnProperty.call(options, key) && options[key] !== undefined && options[key] !== null);
  if (matches.length !== 1) return null;
  const match = matches[0];
  const [key, type] = match;
  const landing = validateShareLandingOptions({ type, token: options[key] });
  if (!landing) return null;
  const query = [`type=${encodeURIComponent(landing.type)}`, `token=${encodeURIComponent(landing.token)}`, `shareSource=${encodeURIComponent(landing.type)}`];
  return `/pages/share/index?${query.join("&")}`;
}

function validateShareLandingOptions(options = {}) {
  const type = normalizeShareType(options.type);
  const token = normalizeShareToken(options.token);
  return type && token ? { type, token } : null;
}

function buildLegacyRoute(options = {}) {
  const safeOptions = extractLegacyOptions(options);
  const query = [];
  if (safeOptions.view) query.push(`view=${encodeURIComponent(safeOptions.view)}`);
  if (safeOptions.shareSource) query.push(`shareSource=${encodeURIComponent(safeOptions.shareSource)}`);
  SAFE_LEGACY_FLAGS.forEach((key) => {
    if (safeOptions[key]) query.push(`${key}=1`);
  });
  return query.length ? `/pages/legacy/index?${query.join("&")}` : "/pages/legacy/index";
}

function extractLegacyOptions(options = {}) {
  const safe = {};
  if (SAFE_LEGACY_VIEWS.has(options.view)) safe.view = options.view;
  if (SAFE_LEGACY_SOURCES.has(options.shareSource)) safe.shareSource = options.shareSource;
  SAFE_LEGACY_FLAGS.forEach((key) => {
    if (options[key] === true || options[key] === "1") safe[key] = true;
  });
  return safe;
}

async function loadBootstrap({ allowCache = false } = {}) {
  try {
    const envelope = await requestHumi({ path: "/bootstrap" });
    const householdId = getHouseholdId(envelope);
    const userId = getUserId(envelope);
    if (householdId && userId) {
      writeHouseholdCache(householdId, envelope, userId);
      wx.setStorageSync(lastHouseholdKey(userId), householdId);
    }
    return envelope;
  } catch (error) {
    if (!allowCache) throw error;
    if (!isCacheableNetworkError(error)) throw error;
    const activeUserId = getActiveUserId();
    const householdId = activeUserId ? wx.getStorageSync(lastHouseholdKey(activeUserId)) : "";
    const cached = householdId ? readHouseholdCache(householdId, activeUserId) : null;
    if (!cached?.envelope || getUserId(cached.envelope) !== activeUserId) throw error;
    return { ...cached.envelope, cacheState: "cached" };
  }
}

function getHouseholdId(envelope = {}) {
  if (Object.prototype.hasOwnProperty.call(envelope, "activeHouseholdId")) {
    return String(envelope.activeHouseholdId || "");
  }
  return String(envelope.activeHousehold?.id || envelope.currentHouseholdId || "");
}

function getUserId(envelope = {}) {
  return typeof envelope.user?.id === "string" ? envelope.user.id : "";
}

function getActiveUserId() {
  try {
    return typeof getApp === "function" ? String(getApp().globalData?.humiSession?.user?.id || "") : "";
  } catch (_) {
    return "";
  }
}

function lastHouseholdKey(userId) {
  return `${LAST_HOUSEHOLD_KEY_PREFIX}${userId}`;
}

function clearBootstrapCacheForUser(userId) {
  const normalizedUserId = String(userId || "");
  if (!normalizedUserId) return;
  const pointerKey = lastHouseholdKey(normalizedUserId);
  const householdId = wx.getStorageSync(pointerKey);
  wx.removeStorageSync(pointerKey);
  if (householdId) wx.removeStorageSync(householdCacheKey(householdId, normalizedUserId));
}

function isCacheableNetworkError(error = {}) {
  return error.status === 0 && error.retryable === true && (error.code === "network_error" || error.code === "request_timeout");
}

function normalizeShareToken(value) {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return SHARE_TOKEN.test(token) ? token : "";
}

function normalizeShareType(value) {
  if (typeof value !== "string") return "";
  const type = value.trim();
  return SHARE_LANDING_TYPES.has(type) ? type : "";
}

module.exports = { buildLegacyRoute, clearBootstrapCacheForUser, extractLegacyOptions, getHouseholdId, getUserId, isCacheableNetworkError, lastHouseholdKey, loadBootstrap, normalizeShareToken, validateShareLandingOptions, resolveKnownShareRoute, resolveStartupRoute };
