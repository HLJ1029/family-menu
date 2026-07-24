const CACHE_SCHEMA_VERSION = 1;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function householdCacheKey(householdId, userId = "") {
  const scope = String(userId || "");
  return scope
    ? `humi:household-cache:v${CACHE_SCHEMA_VERSION}:${scope}:${householdId}`
    : `humi:household-cache:v${CACHE_SCHEMA_VERSION}:${householdId}`;
}

function writeHouseholdCache(householdId, envelope, userId = "") {
  if (!householdId || !envelope?.stateVersion) return null;
  const cached = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    savedAt: Date.now(),
    stateVersion: envelope.stateVersion,
    envelope
  };
  wx.setStorageSync(householdCacheKey(householdId, userId), cached);
  return cached;
}

function readHouseholdCache(householdId, userId = "") {
  const key = householdCacheKey(householdId, userId);
  const cached = wx.getStorageSync(key);
  if (!cached || cached.schemaVersion !== CACHE_SCHEMA_VERSION || !cached.envelope || Date.now() - Number(cached.savedAt) > CACHE_TTL_MS) {
    if (cached) wx.removeStorageSync(key);
    return null;
  }
  return cached;
}

module.exports = { CACHE_SCHEMA_VERSION, CACHE_TTL_MS, householdCacheKey, writeHouseholdCache, readHouseholdCache };
