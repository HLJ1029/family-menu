const certifiedRecipes = require("../data/certified-recipes");

const storagePrefix = "humi:recommendation:v1:";

function buildRecommendationScope(input = {}) {
  const householdId = clean(input.householdId || "guest") || "guest";
  const dateKey = clean(input.dateKey);
  const mode = input.mode === "legacy" ? "legacy" : "meal_execution";
  const effortTier = mode === "meal_execution" ? clean(input.effortTier) : clean(input.effortTier || "legacy");
  const contextFingerprint = clean(input.contextFingerprint);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw codedError("date_key_invalid");
  if (mode === "meal_execution" && !["quick_15", "easy_30", "normal"].includes(effortTier)) {
    throw codedError("effort_tier_invalid");
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(contextFingerprint)) throw codedError("context_fingerprint_invalid");
  return [householdId, dateKey, mode, effortTier, contextFingerprint].join(":");
}

function rotateGuestDinner(input = {}) {
  const scopeKey = buildRecommendationScope(input);
  const storage = input.storage || wx;
  const storageKey = `${storagePrefix}${scopeKey}`;
  const stored = normalizeRotation(storage.getStorageSync(storageKey), scopeKey, input.householdId || "guest");
  const targetDishCount = Number(input.targetDishCount) || (input.effortTier === "quick_15" ? 1 : 2);
  const safe = (input.catalog || certifiedRecipes).filter((recipe) => matches(recipe, input));
  if (safe.length < targetDishCount) throw codedError("recommendation_candidates_exhausted");
  if ((input.action || "initial") === "initial" && stored.seenRecipeIds.length >= targetDishCount) {
    return toGroup(stored.seenRecipeIds.slice(-targetDishCount), stored, targetDishCount, false, "current_group");
  }

  let cycle = stored.cycle;
  let seen = [...stored.seenRecipeIds];
  let exhausted = false;
  let choices = safe.filter((recipe) => !seen.includes(recipe.id));
  if (choices.length < targetDishCount) {
    cycle += 1;
    exhausted = true;
    seen = [];
    const protectedIds = new Set(stored.recentGroupIds.slice(-2).flatMap((groupId) => groupId.split("+")));
    choices = safe.filter((recipe) => !protectedIds.has(recipe.id));
  }
  const feedback = Array.isArray(input.recommendationFeedback) ? input.recommendationFeedback : [];
  choices.sort((left, right) => (
    score(right, feedback) - score(left, feedback)
    || hash(`${scopeKey}:${cycle}:${left.id}`) - hash(`${scopeKey}:${cycle}:${right.id}`)
    || left.id.localeCompare(right.id)
  ));
  const recipeIds = choices.slice(0, targetDishCount).map((recipe) => recipe.id);
  const next = {
    scopeKey,
    householdId: clean(input.householdId || "guest") || "guest",
    seenRecipeIds: [...seen, ...recipeIds],
    recentGroupIds: [...stored.recentGroupIds, [...recipeIds].sort().join("+")].slice(-10),
    cycle,
    updatedAt: new Date().toISOString(),
  };
  storage.setStorageSync(storageKey, next);
  return toGroup(recipeIds, next, targetDishCount, exhausted, exhausted ? "cycle_reset_recent_protected" : "balanced_unseen");
}

function validateRecommendationGroup(group, input = {}) {
  if (!Array.isArray(group?.recipeIds) || new Set(group.recipeIds).size !== group.recipeIds.length) return false;
  const targetDishCount = Number(input.targetDishCount) || group.recipeIds.length;
  if (group.recipeIds.length !== targetDishCount) return false;
  const catalog = input.catalog || certifiedRecipes;
  return group.recipeIds.every((id) => {
    const recipe = catalog.find((candidate) => candidate.id === id);
    return Boolean(recipe && matches(recipe, input));
  });
}

function matches(recipe, input) {
  const mode = input.mode === "legacy" ? "legacy" : "meal_execution";
  if (mode === "meal_execution" && (
    recipe.cookAssist?.status !== "certified"
    || recipe.cookAssist.effortTier !== input.effortTier
  )) return false;
  if ((input.dislikedRecipeIds || []).includes(recipe.id)) return false;
  const signals = [
    ...(input.familyProfile?.allergies || []),
    ...(input.familyProfile?.dislikes || []),
    ...(input.allergySignals || []),
    ...(input.dislikeSignals || []),
  ].map((value) => clean(value).toLowerCase()).filter(Boolean);
  const expanded = signals.flatMap((signal) => signal === "海鲜" ? ["鱼", "虾", "贝", "蟹", "海鲜"] : signal === "太辣" ? ["辣"] : [signal]);
  return !expanded.some((signal) => String(recipe.searchText || "").includes(signal));
}

function score(recipe, feedback) {
  return feedback.reduce((total, item) => {
    const ids = [item?.recipeId, ...(Array.isArray(item?.recipeIds) ? item.recipeIds : [])];
    if (!ids.includes(recipe.id)) return total;
    if (item.value === "want_again") return total + 12;
    if (item.value === "change_next_time") return total - 7;
    if (item.value === "too_much_effort") return total - 12;
    return total;
  }, 100);
}

function toGroup(recipeIds, rotation, targetDishCount, exhausted, reasonCode) {
  return {
    recommendationId: pseudoUuid(`${rotation.scopeKey}:${rotation.cycle}:${recipeIds.join("+")}`),
    recipeIds,
    cycle: rotation.cycle,
    groupIndex: Math.max(0, Math.floor(rotation.seenRecipeIds.length / targetDishCount) - 1),
    exhausted,
    reasonCode,
    stateVersion: String(hash(JSON.stringify(rotation))),
  };
}

function normalizeRotation(value, scopeKey, householdId) {
  if (!value || value.scopeKey !== scopeKey) {
    return { scopeKey, householdId: clean(householdId || "guest"), seenRecipeIds: [], recentGroupIds: [], cycle: 0, updatedAt: "" };
  }
  return {
    scopeKey,
    householdId: clean(value.householdId || householdId || "guest"),
    seenRecipeIds: [...new Set(Array.isArray(value.seenRecipeIds) ? value.seenRecipeIds.map(clean).filter(Boolean) : [])],
    recentGroupIds: [...new Set(Array.isArray(value.recentGroupIds) ? value.recentGroupIds.map(clean).filter(Boolean) : [])].slice(-10),
    cycle: Math.max(0, Number(value.cycle) || 0),
    updatedAt: clean(value.updatedAt),
  };
}

function clean(value) {
  return String(value || "").trim();
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function pseudoUuid(value) {
  const hex = [0, 1, 2, 3].map((index) => hash(`${index}:${value}`).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = {
  buildRecommendationScope,
  rotateGuestDinner,
  validateRecommendationGroup
};
