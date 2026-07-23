const CACHE_SCHEMA_VERSION = 1;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function householdCacheKey(householdId) {
  return `humi:household-cache:v${CACHE_SCHEMA_VERSION}:${householdId}`;
}

function writeHouseholdCache(householdId, envelope) {
  if (!householdId || !envelope?.stateVersion) return null;
  const cached = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    savedAt: Date.now(),
    stateVersion: envelope.stateVersion,
    envelope
  };
  wx.setStorageSync(householdCacheKey(householdId), cached);
  return cached;
}

function readHouseholdCache(householdId) {
  const key = householdCacheKey(householdId);
  const cached = wx.getStorageSync(key);
  if (!cached || cached.schemaVersion !== CACHE_SCHEMA_VERSION || !cached.envelope || Date.now() - Number(cached.savedAt) > CACHE_TTL_MS) {
    if (cached) wx.removeStorageSync(key);
    return null;
  }
  return cached;
}

module.exports = { CACHE_SCHEMA_VERSION, CACHE_TTL_MS, householdCacheKey, writeHouseholdCache, readHouseholdCache };
