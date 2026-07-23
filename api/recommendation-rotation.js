import { createHash } from "node:crypto";
import { createRequire } from "node:module";

export { formatBusinessDateKey } from "../src/lib/date.js";

const require = createRequire(import.meta.url);
const rawRecipes = require("../data/recipes.json");
const cookAssistEntries = require("../data/cook-assist.json");
const cookAssistById = new Map(cookAssistEntries.map((entry) => [entry.id, entry]));
const effortTiers = new Set(["quick_15", "easy_30", "normal"]);
const actions = new Set(["initial", "next", "reject"]);
const modes = new Set(["meal_execution", "legacy"]);
const signalAliases = new Map([
  ["海鲜", ["海鲜", "鱼", "虾", "贝", "蟹"]],
  ["太辣", ["辣"]],
  ["蛋类", ["鸡蛋", "蛋"]],
  ["豆制品", ["豆腐", "豆浆", "豆皮", "豆制品"]],
  ["坚果", ["坚果", "花生", "腰果"]],
  ["乳糖", ["乳糖", "牛奶", "奶酪", "奶"]],
]);

export const certifiedRecommendationCatalog = Object.freeze(
  rawRecipes
    .filter((recipe) => cookAssistById.has(recipe.id))
    .map((recipe) => normalizeCatalogRecipe(recipe, cookAssistById.get(recipe.id)))
    .sort((left, right) => left.id.localeCompare(right.id)),
);

export const legacyRecommendationCatalog = Object.freeze(
  rawRecipes
    .map((recipe) => normalizeCatalogRecipe(recipe, cookAssistById.get(recipe.id)))
    .sort((left, right) => left.id.localeCompare(right.id)),
);

export function buildRecommendationScope(input = {}) {
  const householdId = normalizeText(input.householdId || "guest", 100) || "guest";
  const dateKey = normalizeDateKey(input.dateKey);
  const mode = normalizeMode(input.mode);
  const effortTier = mode === "meal_execution"
    ? normalizeEffortTier(input.effortTier)
    : normalizeText(input.effortTier || "legacy", 24);
  const contextFingerprint = normalizeFingerprint(input.contextFingerprint);
  return [householdId, dateKey, mode, effortTier, contextFingerprint].join(":");
}

export function selectBalancedDinner(input = {}) {
  const scopeKey = buildRecommendationScope(input);
  const mode = normalizeMode(input.mode);
  const effortTier = mode === "meal_execution" ? normalizeEffortTier(input.effortTier) : "";
  const action = normalizeAction(input.action);
  const targetDishCount = normalizeDishCount(input.targetDishCount, mode, effortTier);
  const catalog = normalizeCatalog(input.catalog ?? (
    mode === "meal_execution" ? certifiedRecommendationCatalog : legacyRecommendationCatalog
  ));
  const constraints = { ...input, mode, effortTier, targetDishCount, catalog };
  const safeCandidates = catalog.filter((recipe) => matchesHardConstraints(recipe, constraints));
  if (safeCandidates.length < targetDishCount) {
    throw recommendationError("recommendation_candidates_exhausted", "Not enough recipes obey the dinner hard constraints.");
  }

  const rotation = normalizeRotation(input.rotation, {
    scopeKey,
    householdId: normalizeText(input.householdId || "guest", 100) || "guest",
  });
  if (action === "initial" && rotation.seenRecipeIds.length >= targetDishCount) {
    const currentIds = rotation.seenRecipeIds.slice(-targetDishCount);
    const current = buildGroup({
      recipeIds: currentIds,
      rotation,
      targetDishCount,
      reasonCode: "current_group",
      exhausted: false,
    });
    if (validateRecommendationGroup(current, constraints)) {
      return { group: current, rotation: structuredClone(rotation) };
    }
  }

  let cycle = rotation.cycle;
  let seenRecipeIds = [...rotation.seenRecipeIds];
  let exhausted = false;
  let selectable = safeCandidates.filter((recipe) => !seenRecipeIds.includes(recipe.id));
  const protectedGroupIds = rotation.recentGroupIds.slice(-2);
  const protectedRecipeIds = new Set(protectedGroupIds.flatMap(decodeGroupId));

  if (selectable.length < targetDishCount) {
    cycle += 1;
    exhausted = true;
    seenRecipeIds = [];
    selectable = safeCandidates.filter((recipe) => !protectedRecipeIds.has(recipe.id));
    if (selectable.length < targetDishCount) {
      throw recommendationError("recommendation_candidates_exhausted", "Recent-group protection leaves too few safe recipes.");
    }
  }

  const scored = selectable
    .map((recipe) => ({ recipe, score: scoreRecipe(recipe, constraints) }))
    .sort((left, right) => (
      right.score - left.score
      || stableRank(scopeKey, cycle, left.recipe.id) - stableRank(scopeKey, cycle, right.recipe.id)
      || left.recipe.id.localeCompare(right.recipe.id)
    ));
  const best = scored[0]?.score ?? 0;
  const highScoreWindow = scored.filter((item) => item.score >= best - 12);
  const chosen = chooseComplementaryGroup(
    highScoreWindow.length >= targetDishCount ? highScoreWindow : scored,
    targetDishCount,
  );
  const recipeIds = chosen.map((item) => item.recipe.id);
  const groupId = encodeGroupId(recipeIds);
  const nextRotation = {
    scopeKey,
    householdId: rotation.householdId,
    seenRecipeIds: [...seenRecipeIds, ...recipeIds],
    recentGroupIds: [...rotation.recentGroupIds, groupId].slice(-10),
    cycle,
    updatedAt: new Date().toISOString(),
  };
  const group = buildGroup({
    recipeIds,
    rotation: nextRotation,
    targetDishCount,
    reasonCode: exhausted ? "cycle_reset_recent_protected" : "balanced_unseen",
    exhausted,
  });
  return { group, rotation: nextRotation };
}

export function validateRecommendationGroup(group, constraints = {}) {
  if (!group || !Array.isArray(group.recipeIds)) return false;
  const mode = normalizeModeSafe(constraints.mode);
  const effortTier = mode === "meal_execution" ? normalizeEffortTierSafe(constraints.effortTier) : "";
  if (!mode || (mode === "meal_execution" && !effortTier)) return false;
  const targetDishCount = normalizeDishCount(
    constraints.targetDishCount ?? group.recipeIds.length,
    mode,
    effortTier,
  );
  const recipeIds = group.recipeIds.map((id) => normalizeText(id, 100)).filter(Boolean);
  if (recipeIds.length !== targetDishCount || new Set(recipeIds).size !== recipeIds.length) return false;
  const catalog = normalizeCatalog(constraints.catalog ?? (
    mode === "meal_execution" ? certifiedRecommendationCatalog : legacyRecommendationCatalog
  ));
  const byId = new Map(catalog.map((recipe) => [recipe.id, recipe]));
  return recipeIds.every((id) => {
    const recipe = byId.get(id);
    return Boolean(recipe && matchesHardConstraints(recipe, {
      ...constraints,
      mode,
      effortTier,
      targetDishCount,
      catalog,
    }));
  });
}

export function recommendationStateVersion(rotation) {
  return createHash("sha256").update(stableStringify(normalizePersistedRotation(rotation))).digest("base64url");
}

export function normalizeRecommendationFeedbackValue(value) {
  if (value === "want_again") return "want_again";
  if (["change_it", "change_next_time", "family_dislikes", "hard_to_buy", "wrong_taste", "not_dinner"].includes(value)) {
    return "change_it";
  }
  if (["too_hard", "too_much_effort", "too_much_work"].includes(value)) return "too_hard";
  return "";
}

function buildGroup({ recipeIds, rotation, targetDishCount, reasonCode, exhausted }) {
  const groupIndex = Math.max(0, Math.floor(rotation.seenRecipeIds.length / targetDishCount) - 1);
  const recommendationId = uuidFrom([
    rotation.scopeKey,
    rotation.cycle,
    groupIndex,
    recipeIds.join("+"),
  ].join("|"));
  return {
    recommendationId,
    recipeIds: [...recipeIds],
    cycle: rotation.cycle,
    groupIndex,
    exhausted: Boolean(exhausted),
    reasonCode,
    stateVersion: recommendationStateVersion(rotation),
  };
}

function matchesHardConstraints(recipe, input) {
  if (input.mode === "meal_execution") {
    if (recipe.cookAssist?.status !== "certified") return false;
    if (recipe.cookAssist.effortTier !== input.effortTier) return false;
  }
  if ((input.dislikedRecipeIds ?? []).map(String).includes(recipe.id)) return false;
  const hardSignals = collectHardSignals(input);
  return !hardSignals.some((signal) => recipe.searchText.includes(signal));
}

function collectHardSignals(input) {
  const profileSignals = [
    ...(input.familyProfile?.allergies ?? []),
    ...(input.familyProfile?.dislikes ?? []),
    ...(input.allergySignals ?? []),
    ...(input.dislikeSignals ?? []),
  ];
  for (const member of input.familyMembers ?? []) {
    profileSignals.push(...(member?.preference?.allergies ?? []), ...(member?.preference?.dislikes ?? []));
  }
  return [...new Set(profileSignals
    .map((value) => normalizeText(value, 40).toLowerCase())
    .filter(Boolean)
    .flatMap(expandHardSignal))];
}

function expandHardSignal(signal) {
  const normalized = normalizeText(signal, 80)
    .toLowerCase()
    .replace(/[，。,.；;、\s]/g, "");
  if (!normalized) return [];
  const expanded = [];
  for (const [canonical, aliases] of signalAliases) {
    if (normalized.includes(canonical) || aliases.some((alias) => normalized.includes(alias))) {
      expanded.push(...aliases);
    }
  }
  if (expanded.length > 0) return [...new Set(expanded)];
  const stripped = normalized
    .replace(/^(?:我|本人|孩子|小孩|宝宝)?对/, "")
    .replace(/(?:严重)?(?:过敏|不耐受|不能吃|吃不了|忌口|不吃)$/g, "");
  return stripped ? [stripped] : [];
}

function scoreRecipe(recipe, input) {
  let score = 100;
  const feedback = Array.isArray(input.recommendationFeedback) ? input.recommendationFeedback : [];
  for (const item of feedback) {
    const recipeIds = [
      item?.recipeId,
      ...(Array.isArray(item?.recipeIds) ? item.recipeIds : []),
    ].filter(Boolean);
    if (!recipeIds.includes(recipe.id)) continue;
    score += feedbackScoreDelta(item.value || item.reasonId);
  }
  const pantryNames = new Set((input.pantryItems ?? []).map((item) => normalizeText(item?.name || item, 40).toLowerCase()));
  score += recipe.ingredients.filter((ingredient) => pantryNames.has(normalizeText(ingredient.name, 40).toLowerCase())).length * 3;
  const wanted = (input.wantToEatItems ?? []).map((item) => normalizeText(item?.name || item?.title || item, 40).toLowerCase());
  if (wanted.some((signal) => signal && recipe.searchText.includes(signal))) score += 8;
  if (recipe.cookAssist?.cleanupLevel === "low") score += input.effortTier === "quick_15" ? 4 : 1;
  return score;
}

function feedbackScoreDelta(value) {
  const normalized = normalizeRecommendationFeedbackValue(value);
  if (normalized === "want_again") return 12;
  if (normalized === "change_it") return -7;
  if (normalized === "too_hard") return -12;
  return 0;
}

function chooseComplementaryGroup(scored, targetDishCount) {
  const chosen = [];
  const usedPrimaryCategories = new Set();
  for (const item of scored) {
    if (chosen.length >= targetDishCount) break;
    const primaryCategory = item.recipe.categories?.[0] || "";
    if (chosen.length > 0 && primaryCategory && usedPrimaryCategories.has(primaryCategory)) continue;
    chosen.push(item);
    if (primaryCategory) usedPrimaryCategories.add(primaryCategory);
  }
  if (chosen.length < targetDishCount) {
    for (const item of scored) {
      if (chosen.length >= targetDishCount) break;
      if (!chosen.some((entry) => entry.recipe.id === item.recipe.id)) chosen.push(item);
    }
  }
  return chosen;
}

function normalizeRotation(rotation, { scopeKey, householdId }) {
  if (!rotation || rotation.scopeKey !== scopeKey || rotation.householdId !== householdId) {
    return { scopeKey, householdId, seenRecipeIds: [], recentGroupIds: [], cycle: 0, updatedAt: "" };
  }
  return {
    scopeKey,
    householdId,
    seenRecipeIds: uniqueTextList(rotation.seenRecipeIds, 200),
    recentGroupIds: uniqueTextList(rotation.recentGroupIds, 10),
    cycle: Math.max(0, Number.parseInt(rotation.cycle, 10) || 0),
    updatedAt: normalizeText(rotation.updatedAt, 40),
  };
}

function normalizePersistedRotation(rotation = {}) {
  return {
    scopeKey: normalizeText(rotation.scopeKey, 400),
    householdId: normalizeText(rotation.householdId, 100),
    seenRecipeIds: uniqueTextList(rotation.seenRecipeIds, 200),
    recentGroupIds: uniqueTextList(rotation.recentGroupIds, 10),
    cycle: Math.max(0, Number.parseInt(rotation.cycle, 10) || 0),
    updatedAt: normalizeText(rotation.updatedAt, 40),
  };
}

function normalizeCatalog(catalog) {
  return (Array.isArray(catalog) ? catalog : [])
    .filter((recipe) => recipe?.id)
    .map((recipe) => ({
      ...recipe,
      id: normalizeText(recipe.id, 100),
      title: normalizeText(recipe.title || recipe.name, 80),
      categories: Array.isArray(recipe.categories) ? recipe.categories.map(String) : [],
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      searchText: normalizeText(recipe.searchText || buildSearchText(recipe), "", 4000).toLowerCase(),
    }));
}

function normalizeCatalogRecipe(recipe, assist) {
  return {
    id: recipe.id,
    title: recipe.name,
    name: recipe.name,
    description: recipe.description || "",
    categories: [...(recipe.categories ?? [])],
    tags: [...(recipe.tags ?? [])],
    ingredients: structuredClone(recipe.ingredients ?? []),
    servings: Number(recipe.servings || 2),
    timeMinutes: Number(recipe.timeMinutes || assist?.totalMinutes || 0),
    thumbnailUrl: `/assets/dishes/thumbs/${recipe.id}.webp`,
    searchText: buildSearchText(recipe).toLowerCase(),
    cookAssist: assist ? {
      status: "certified",
      effortTier: assist.effortTier,
      activeMinutes: assist.activeMinutes,
      totalMinutes: assist.totalMinutes,
      cookware: [...assist.cookware],
      cleanupLevel: assist.cleanupLevel,
    } : null,
  };
}

function buildSearchText(recipe) {
  return [
    recipe.title,
    recipe.name,
    recipe.description,
    ...(recipe.categories ?? []),
    ...(recipe.tags ?? []),
    ...(recipe.ingredients ?? []).map((item) => item?.name),
    ...(recipe.seasonings ?? []).map((item) => item?.name),
  ].filter(Boolean).join(" ");
}

function normalizeDishCount(value, mode, effortTier) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) return Math.max(1, Math.min(4, parsed));
  if (mode === "meal_execution" && effortTier === "quick_15") return 1;
  return 2;
}

function normalizeMode(value) {
  if (modes.has(value)) return value;
  throw recommendationError("recommendation_mode_invalid", "Unsupported recommendation mode.");
}

function normalizeModeSafe(value) {
  return modes.has(value) ? value : "";
}

function normalizeAction(value) {
  const action = value || "initial";
  if (actions.has(action)) return action;
  throw recommendationError("recommendation_action_invalid", "Unsupported recommendation action.");
}

function normalizeEffortTier(value) {
  if (effortTiers.has(value)) return value;
  throw recommendationError("effort_tier_invalid", "Unsupported effort tier.");
}

function normalizeEffortTierSafe(value) {
  return effortTiers.has(value) ? value : "";
}

function normalizeDateKey(value) {
  const dateKey = normalizeText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw recommendationError("date_key_invalid", "dateKey must use YYYY-MM-DD.");
  }
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateKey) {
    throw recommendationError("date_key_invalid", "dateKey must be a real calendar date.");
  }
  return dateKey;
}

function normalizeFingerprint(value) {
  const fingerprint = normalizeText(value, 128);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(fingerprint)) {
    throw recommendationError("context_fingerprint_invalid", "contextFingerprint must be base64url.");
  }
  return fingerprint;
}

function normalizeText(value, fallbackOrMax = 80, maxMaybe) {
  const fallback = typeof fallbackOrMax === "string" ? fallbackOrMax : "";
  const maxLength = typeof fallbackOrMax === "number" ? fallbackOrMax : maxMaybe;
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return (text || fallback).slice(0, maxLength || 80);
}

function uniqueTextList(value, limit) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => normalizeText(item, 400)).filter(Boolean))].slice(-limit);
}

function encodeGroupId(recipeIds) {
  return [...recipeIds].sort().join("+");
}

function decodeGroupId(groupId) {
  return normalizeText(groupId, 500).split("+").filter(Boolean);
}

function stableRank(scopeKey, cycle, recipeId) {
  return createHash("sha256").update(`${scopeKey}:${cycle}:${recipeId}`).digest().readUInt32BE(0);
}

function uuidFrom(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function recommendationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
