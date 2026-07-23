const certifiedRecipes = require("../data/certified-recipes");
const { requestHumi } = require("./request");

const GUEST_RUN_PREFIX = "humi:meal-run:guest:v1:";
const REMOTE_RUN_PREFIX = "humi:meal-run:remote:v1:";
const MERGED_RUN_PREFIX = "humi:meal-run:merged:v1:";
const ACTIVE_STATUSES = new Set(["planned", "cooking"]);
const RUN_STATUSES = new Set(["planned", "cooking", "completed", "abandoned"]);
const EFFORT_TIERS = new Set(["quick_15", "easy_30", "normal"]);
const recipesById = new Map(certifiedRecipes.map((recipe) => [recipe.id, recipe]));

async function createMealRun({
  bootstrap = {},
  recommendation,
  effortTier,
  dateKey = formatDinnerDateKey(),
  stateVersion = "",
} = {}) {
  const normalized = normalizeCreateInput({ bootstrap, recommendation, effortTier, dateKey });
  if (!normalized.householdId) return createGuestMealRun(normalized);
  if (!canReplaceHouseholdPlan(bootstrap, normalized.ownerUserId)) {
    throw codedError("forbidden");
  }
  const idempotencyKey = `recommendation:${normalized.recommendationId}`;
  const result = await requestHumi({
    path: "/meal-runs",
    method: "POST",
    data: {
      householdId: normalized.householdId,
      dateKey: normalized.dateKey,
      mealSlot: "dinner",
      effortTier: normalized.effortTier,
      recipeIds: normalized.recipeIds,
      idempotencyKey,
    },
    idempotencyKey,
    stateVersion,
    expectedUserId: normalized.ownerUserId,
  });
  const mealRun = normalizeMealRun(result?.mealRun);
  if (!mealRun) throw codedError("meal_run_response_invalid");
  writeRemoteMealRun(mealRun, normalized.ownerUserId);
  return mealRun;
}

async function loadCurrentMealRun({
  bootstrap = {},
  dateKey = formatDinnerDateKey(),
  allowCache = true,
} = {}) {
  const ownerUserId = bootstrapUserId(bootstrap);
  const householdId = clean(bootstrap.activeHouseholdId);
  if (!ownerUserId || !householdId) return readActiveGuestMealRun({ ownerUserId, dateKey });
  try {
    const result = await requestHumi({
      path: `/meal-runs/current?householdId=${encodeURIComponent(householdId)}&dateKey=${encodeURIComponent(dateKey)}&mealSlot=dinner`,
      expectedUserId: ownerUserId,
    });
    const mealRun = normalizeMealRun(result?.mealRun);
    if (mealRun) writeRemoteMealRun(mealRun, ownerUserId);
    else wx.removeStorageSync(remoteRunKey(ownerUserId, householdId, dateKey));
    return mealRun;
  } catch (error) {
    if (!allowCache || !isNetworkError(error)) throw error;
    const cached = normalizeMealRun(wx.getStorageSync(remoteRunKey(ownerUserId, householdId, dateKey)));
    return cached ? { ...cached, cacheState: "cached" } : null;
  }
}

async function mergeActiveGuestMealRun({
  bootstrap = {},
  dateKey = formatDinnerDateKey(),
} = {}) {
  const ownerUserId = bootstrapUserId(bootstrap);
  const householdId = clean(bootstrap.activeHouseholdId);
  if (!ownerUserId || !householdId) return { merged: false, reason: "no_household", mealRun: null, guestRun: null };
  const guestRun = readActiveGuestMealRun({ ownerUserId, dateKey });
  if (!guestRun || !ACTIVE_STATUSES.has(guestRun.status)) {
    return { merged: false, reason: "no_guest_run", mealRun: null, guestRun: null };
  }
  if (!canReplaceHouseholdPlan(bootstrap, ownerUserId)) {
    return { merged: false, reason: "owner_required", mealRun: bootstrap.currentMealRun || null, guestRun };
  }

  let remote;
  try {
    remote = await loadCurrentMealRun({ bootstrap, dateKey, allowCache: false });
  } catch (error) {
    if (isNetworkError(error)) return { merged: false, reason: "offline", mealRun: null, guestRun };
    throw error;
  }
  if (remote && ["cooking", "completed"].includes(remote.status)) {
    return { merged: false, reason: "remote_locked", mealRun: remote, guestRun };
  }

  const idempotencyKey = `guest-merge:${guestRun.id}`;
  try {
    const result = await requestHumi({
      path: "/meal-runs",
      method: "POST",
      data: {
        householdId,
        dateKey,
        mealSlot: "dinner",
        effortTier: guestRun.effortTier,
        recipeIds: guestRun.recipeIds,
        readyStaple: guestRun.readyStaple || "",
        syncedFromLocalId: guestRun.id,
        idempotencyKey,
      },
      idempotencyKey,
      expectedUserId: ownerUserId,
    });
    const mealRun = normalizeMealRun(result?.mealRun);
    if (!mealRun) throw codedError("meal_run_response_invalid");
    writeRemoteMealRun(mealRun, ownerUserId);
    archiveMergedGuestRun(guestRun, mealRun.id);
    wx.removeStorageSync(guestRunKey(ownerUserId, dateKey));
    return { merged: true, reason: "merged", mealRun, guestRun };
  } catch (error) {
    if (Number(error?.status) !== 409) throw error;
    const latest = await loadCurrentMealRun({ bootstrap, dateKey, allowCache: false });
    return {
      merged: false,
      reason: latest && ["cooking", "completed"].includes(latest.status) ? "remote_locked" : "state_conflict",
      mealRun: latest,
      guestRun,
    };
  }
}

function createGuestMealRun(input) {
  const now = new Date().toISOString();
  const mealRun = {
    id: `guest:${createUuid()}`,
    householdId: "guest",
    ownerUserId: input.ownerUserId,
    dateKey: input.dateKey,
    mealSlot: "dinner",
    effortTier: input.effortTier,
    recommendationId: input.recommendationId,
    recipeIds: [...input.recipeIds],
    recipeSnapshot: input.recipeIds.map((recipeId) => clone(recipesById.get(recipeId))),
    timelineVersion: 1,
    timeline: null,
    currentStepId: "",
    timerEndsAt: "",
    readyStaple: input.recipeIds.map((recipeId) => recipesById.get(recipeId)?.cookAssist?.readyStaple).find(Boolean) || "即食米饭",
    status: "planned",
    localOnly: true,
    createdBy: input.ownerUserId || "guest",
    createdAt: now,
    updatedAt: now,
    startedAt: "",
    completedAt: "",
  };
  wx.setStorageSync(guestRunKey(input.ownerUserId, input.dateKey), mealRun);
  return mealRun;
}

function readActiveGuestMealRun({ ownerUserId = "", dateKey = formatDinnerDateKey() } = {}) {
  if (!clean(ownerUserId) || !validDateKey(dateKey)) return null;
  const mealRun = normalizeMealRun(wx.getStorageSync(guestRunKey(ownerUserId, dateKey)));
  if (!mealRun || mealRun.ownerUserId !== clean(ownerUserId) || mealRun.dateKey !== dateKey || !mealRun.localOnly) return null;
  return mealRun;
}

function buildDinnerPlan(recommendation, bootstrap = {}) {
  const recipes = (recommendation?.recipeIds || []).map((recipeId) => recipesById.get(recipeId)).filter(Boolean);
  if (!recipes.length || recipes.length !== recommendation?.recipeIds?.length) throw codedError("recommendation_group_invalid");
  const pantry = new Set((bootstrap.householdState?.pantryItems || [])
    .map((item) => clean(item?.name || item).toLowerCase())
    .filter(Boolean));
  const requiredIngredients = recipes.flatMap((recipe) => (
    recipe.ingredients || []
  ).filter((ingredient) => ingredient.required !== false).map((ingredient) => clean(ingredient.name))).filter(Boolean);
  const missingIngredients = [...new Set(requiredIngredients.filter((name) => !pantry.has(name.toLowerCase())))];
  const cookware = [...new Set(recipes.flatMap((recipe) => recipe.cookAssist?.cookware || []))];
  const activeMinutes = recipes.reduce((total, recipe) => total + (Number(recipe.cookAssist?.activeMinutes) || 0), 0);
  const longestRecipeMinutes = Math.max(...recipes.map((recipe) => Number(recipe.cookAssist?.totalMinutes) || 0));
  return {
    recommendationId: clean(recommendation.recommendationId),
    recipes: recipes.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      thumbnailUrl: absoluteAssetUrl(recipe.thumbnailUrl),
      totalMinutes: Number(recipe.cookAssist.totalMinutes) || 0,
      activeMinutes: Number(recipe.cookAssist.activeMinutes) || 0,
    })),
    totalMinutes: Math.max(activeMinutes, longestRecipeMinutes),
    activeMinutes,
    cookwareCount: cookware.length,
    cookware,
    missingIngredients,
    missingIngredientsText: missingIngredients.length ? missingIngredients.slice(0, 4).join("、") : "家里现有食材基本够用",
  };
}

function normalizeCreateInput({ bootstrap, recommendation, effortTier, dateKey }) {
  const recommendationId = clean(recommendation?.recommendationId);
  const recipeIds = [...new Set(Array.isArray(recommendation?.recipeIds) ? recommendation.recipeIds.map(clean).filter(Boolean) : [])];
  if (!recommendationId || !recipeIds.length || !recipeIds.every((recipeId) => recipesById.has(recipeId))) {
    throw codedError("recommendation_group_invalid");
  }
  if (!EFFORT_TIERS.has(effortTier)) throw codedError("effort_tier_invalid");
  if (!validDateKey(dateKey)) throw codedError("date_key_invalid");
  if (!recipeIds.every((recipeId) => recipesById.get(recipeId)?.cookAssist?.effortTier === effortTier)) {
    throw codedError("effort_tier_mismatch");
  }
  return {
    householdId: clean(bootstrap.activeHouseholdId),
    ownerUserId: bootstrapUserId(bootstrap),
    recommendationId,
    recipeIds,
    effortTier,
    dateKey,
  };
}

function canReplaceHouseholdPlan(bootstrap = {}, userId = bootstrapUserId(bootstrap)) {
  const householdId = clean(bootstrap.activeHouseholdId);
  if (!householdId) return true;
  const household = (bootstrap.households || []).find((item) => item.id === householdId);
  return Boolean(household && clean(household.ownerId) === clean(userId) && clean(userId));
}

function currentHouseholdRole(bootstrap = {}) {
  const household = (bootstrap.households || []).find((item) => item.id === bootstrap.activeHouseholdId);
  return household?.role === "owner" || household?.ownerId === bootstrapUserId(bootstrap) ? "owner" : household ? "member" : "guest";
}

function normalizeMealRun(value) {
  if (!value || typeof value !== "object" || !clean(value.id) || !RUN_STATUSES.has(value.status)) return null;
  if (!validDateKey(value.dateKey) || value.mealSlot !== "dinner") return null;
  return clone(value);
}

function writeRemoteMealRun(mealRun, userId) {
  if (!userId || !mealRun?.householdId || !mealRun?.dateKey) return;
  wx.setStorageSync(remoteRunKey(userId, mealRun.householdId, mealRun.dateKey), mealRun);
}

function archiveMergedGuestRun(guestRun, remoteMealRunId) {
  wx.setStorageSync(`${MERGED_RUN_PREFIX}${encodeKey(guestRun.ownerUserId)}:${encodeKey(guestRun.id)}`, {
    ...guestRun,
    mergeStatus: "merged",
    mergedIntoMealRunId: remoteMealRunId,
    mergedAt: new Date().toISOString(),
  });
}

function guestRunKey(ownerUserId, dateKey) {
  return `${GUEST_RUN_PREFIX}${encodeKey(ownerUserId)}:${dateKey}`;
}

function remoteRunKey(userId, householdId, dateKey) {
  return `${REMOTE_RUN_PREFIX}${encodeKey(userId)}:${encodeKey(householdId)}:${dateKey}`;
}

function encodeKey(value) {
  return encodeURIComponent(clean(value));
}

function bootstrapUserId(bootstrap = {}) {
  return clean(bootstrap.user?.id);
}

function formatDinnerDateKey(date = new Date()) {
  const instant = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(instant.getTime())) throw codedError("date_key_invalid");
  return new Date(instant.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function createUuid() {
  const bytes = new Uint8Array(16);
  if (typeof wx.getRandomValues === "function") wx.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function absoluteAssetUrl(value) {
  const url = clean(value);
  return url.startsWith("/") ? `https://www.humi-home.com${url}` : url;
}

function isNetworkError(error = {}) {
  return Number(error.status) === 0 || ["network_error", "request_timeout"].includes(error.code);
}

function clean(value) {
  return String(value || "").trim();
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = {
  buildDinnerPlan,
  canReplaceHouseholdPlan,
  createMealRun,
  currentHouseholdRole,
  formatDinnerDateKey,
  loadCurrentMealRun,
  mergeActiveGuestMealRun,
  readActiveGuestMealRun,
};
