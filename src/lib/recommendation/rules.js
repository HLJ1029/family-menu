import { nutritionFor, recipes } from "../recipes.js";
import { getPlanningMode } from "../profile.js";

const dislikedSignals = ["鸡爪", "肥肠"];

export function buildTodayRecommendation({
  pantryItems = [],
  weekPlan = {},
  mealLogs = {},
  groceryItems = [],
  todayRecipes = [],
  familyMembers = [],
  familyProfile = {},
  wantToEatItems = [],
  craveVotes = [],
  excludedRecipeIds = [],
}) {
  const recentRecipeIds = collectRecentRecipeIds({ weekPlan, mealLogs, todayRecipes });
  const mealHistoryTaste = collectMealHistoryTaste(mealLogs);
  const pantryState = buildPantryState(pantryItems);
  const familyPreference = collectFamilyPreference(familyMembers, familyProfile);
  const wantSignals = collectWantSignals(wantToEatItems);
  const feelingSignals = collectFeelingSignals(craveVotes);
  const hardAvoidSignals = buildHardAvoidSignals(familyPreference);
  const planningMode = getPlanningMode(familyProfile.planningMode);
  const excludedIds = new Set(excludedRecipeIds);
  const scored = recipes
    .filter(
      (recipe) =>
        !excludedIds.has(recipe.id) &&
        !todayRecipes.some((item) => item.id === recipe.id) &&
        !recipeViolatesHardAvoid(recipe, { hardAvoidSignals }),
    )
    .map((recipe) => {
      const ingredientNames = recipe.ingredients.map((item) => normalize(item.name));
      const usablePantryMatches = ingredientNames.filter((name) => pantryState.usableNames.has(name)).length;
      const expiringPantryMatches = ingredientNames.filter((name) => pantryState.expiringNames.has(name)).length;
      const missingRequired = recipe.ingredients.filter(
        (item) => item.required !== false && !pantryState.usableNames.has(normalize(item.name)),
      );
      const nutrition = nutritionFor(recipe);
      const quickBonus = recipe.timeMinutes <= 25 ? 18 : 0;
      const balanceBonus = balancedCategoryScore(recipe);
      const pantryBonus = usablePantryMatches * 14 + expiringPantryMatches * 18;
      const shoppingGapPenalty = Math.min(missingRequired.length, 4) * 5;
      const nutritionBonus = nutrition.proteinG >= 15 ? 10 : 0;
      const repeatedPenalty = recentRecipeIds.has(recipe.id) ? 22 : 0;
      const dislikedPenalty = dislikedSignals.some((signal) => recipe.name.includes(signal)) ? 16 : 0;
      const preferenceScore = scorePreference(recipe, familyPreference);
      const wantScore = scoreWantSignals(recipe, wantSignals);
      const feelingScore = scoreFeelingSignals(recipe, feelingSignals);
      const mealHistoryScore = scoreMealHistoryTaste(recipe, mealHistoryTaste);
      const modeScore = scorePlanningMode(recipe, planningMode.id);
      const score =
        quickBonus +
        balanceBonus +
        pantryBonus +
        nutritionBonus +
        modeScore +
        wantScore.bonus +
        feelingScore.bonus +
        mealHistoryScore.bonus +
        preferenceScore.bonus -
        repeatedPenalty -
        dislikedPenalty -
        preferenceScore.penalty -
        shoppingGapPenalty;
      return {
        recipe,
        score,
        usablePantryMatches,
        expiringPantryMatches,
        missingRequired,
        preferenceScore,
        wantScore,
        feelingScore,
        mealHistoryScore,
      };
    })
    .sort((a, b) => b.score - a.score);

  const fallbackRecipes = recipes.filter((recipe) => !recipeViolatesHardAvoid(recipe, { hardAvoidSignals }));
  const familySize = normalizeFamilySize(familyProfile.familySize);
  const targetDishCount = getTargetDishCount(familySize);
  const primary = scored[0]?.recipe ?? fallbackRecipes[0] ?? recipes[0];
  const selected = selectDinnerSet({
    primary,
    scored,
    fallbackRecipes,
    hardAvoidSignals,
    targetDishCount,
  });
  const recommendationItems = buildRecommendationItems(selected, familySize);
  const selectedIds = new Set(selected.map((recipe) => recipe.id));
  const selectedMissing = scored
    .filter(({ recipe }) => selectedIds.has(recipe.id))
    .flatMap(({ missingRequired }) => missingRequired)
    .slice(0, 5);
  const inventoryHits = scored
    .filter(({ recipe }) => selectedIds.has(recipe.id))
    .reduce((total, item) => total + item.usablePantryMatches, 0);
  const expiringHits = scored
    .filter(({ recipe }) => selectedIds.has(recipe.id))
    .reduce((total, item) => total + item.expiringPantryMatches, 0);
  const preferenceHits = scored
    .filter(({ recipe }) => selectedIds.has(recipe.id))
    .reduce((total, item) => total + item.preferenceScore.hits, 0);
  const wantIntentHits = scored
    .filter(({ recipe }) => selectedIds.has(recipe.id))
    .reduce((total, item) => total + item.wantScore.hits, 0);
  const feelingHits = scored
    .filter(({ recipe }) => selectedIds.has(recipe.id))
    .reduce((total, item) => total + item.feelingScore.hits, 0);
  const mealHistoryHits = scored
    .filter(({ recipe }) => selectedIds.has(recipe.id))
    .reduce((total, item) => total + item.mealHistoryScore.hits, 0);
  const calories = recommendationItems.reduce(
    (total, item) => total + nutritionFor(item.recipe).caloriesKcal * item.quantity,
    0,
  );
  const protein = recommendationItems.reduce(
    (total, item) => total + nutritionFor(item.recipe).proteinG * item.quantity,
    0,
  );
  const matchedPantryItems = collectMatchedPantryItems(selected, pantryState);

  return {
    recipes: selected,
    items: recommendationItems,
    familySize,
    targetDishCount,
    title: selected.map((recipe) => recipe.name).join(" + "),
    reason: buildReason({
      selected,
      inventoryHits,
      expiringHits,
      groceryItems,
      selectedMissing,
      preferenceHits,
      wantIntentHits,
      feelingHits,
      mealHistoryHits,
    }),
    inventoryHits,
    expiringHits,
    matchedPantryItems,
    preferenceHits,
    wantIntentHits,
    feelingHits,
    mealHistoryHits,
    mealHistorySampleCount: mealHistoryTaste.sampleCount,
    missingItems: dedupeItems(selectedMissing),
    explanation: {
      pantry: buildPantryExplanation({ inventoryHits, expiringHits, matchedPantryItems }),
      preference: buildPreferenceExplanation(preferenceHits),
      want: buildWantExplanation(wantIntentHits),
      feeling: buildFeelingExplanation(feelingHits),
      history: buildMealHistoryExplanation(mealHistoryHits, mealHistoryTaste),
      grocery: buildGroceryExplanation(selectedMissing),
    },
    nutrition: {
      caloriesKcal: calories,
      proteinG: protein,
    },
  };
}

function collectRecentRecipeIds({ weekPlan = {}, mealLogs = {}, todayRecipes = [] }) {
  const ids = new Set(Object.values(weekPlan).flat().filter(Boolean).slice(-14));
  todayRecipes.forEach((recipe) => {
    if (recipe?.id) ids.add(recipe.id);
  });
  Object.entries(mealLogs)
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, 14)
    .forEach(([, log]) => {
      const entries = [
        ...(log?.consumedEntries ?? []),
        ...(log?.plannedEntries ?? []),
        ...Object.values(log?.meals ?? {}).flatMap((meal) => [
          ...(meal?.consumedEntries ?? []),
          ...(meal?.plannedEntries ?? []),
        ]),
      ];
      entries.forEach((entry) => {
        if (entry?.recipeId) ids.add(entry.recipeId);
      });
    });
  return ids;
}

function collectMealHistoryTaste(mealLogs = {}) {
  const categoryCounts = new Map();
  let sampleCount = 0;
  let quickCount = 0;
  Object.entries(mealLogs)
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, 28)
    .forEach(([, log]) => {
      const entries = [
        ...(log?.consumedEntries ?? []),
        ...Object.values(log?.meals ?? {}).flatMap((meal) => meal?.consumedEntries ?? []),
      ];
      entries.forEach((entry) => {
        const recipe = recipes.find((item) => item.id === entry?.recipeId);
        if (!recipe) return;
        sampleCount += 1;
        if (recipe.timeMinutes <= 25) quickCount += 1;
        recipe.categories.forEach((category) => {
          categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
        });
      });
    });
  const preferredCategories = sampleCount >= 2
    ? [...categoryCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
        .map(([category]) => category)
    : [];
  return {
    sampleCount,
    preferredCategories: new Set(preferredCategories),
    prefersQuick: sampleCount >= 2 && quickCount / sampleCount >= 0.5,
  };
}

export function buildRecommendationItems(selectedRecipes = [], familySize = 2) {
  const normalizedFamilySize = normalizeFamilySize(familySize);
  const items = selectedRecipes.map((recipe) => ({ recipe, quantity: 1 }));
  if (items.length === 0) return items;

  const targetCoverage = Math.max(normalizedFamilySize, Math.ceil(normalizedFamilySize * 1.35));
  const getCoverage = () =>
    items.reduce((total, item) => total + (Number(item.recipe.servings) || 1) * item.quantity, 0);

  const boostOrder = [...items].sort((a, b) => {
    const aScore = quantityPriorityScore(a.recipe);
    const bScore = quantityPriorityScore(b.recipe);
    return bScore - aScore;
  });

  let boostIndex = 0;
  while (getCoverage() < targetCoverage && boostIndex < boostOrder.length * 2) {
    const item = boostOrder[boostIndex % boostOrder.length];
    if (item.quantity < 3) item.quantity += 1;
    boostIndex += 1;
  }

  return items.map((item) => ({
    ...item,
    targetServings: (Number(item.recipe.servings) || 1) * item.quantity,
  }));
}

export function recipeViolatesHardAvoid(recipe, {
  familyMembers = [],
  familyProfile = {},
  hardAvoidSignals = null,
} = {}) {
  const signals = hardAvoidSignals ?? buildHardAvoidSignals(collectFamilyPreference(familyMembers, familyProfile));
  return matchesSignals(recipe, signals);
}

export function getHardAvoidSignals({ familyMembers = [], familyProfile = {} } = {}) {
  return buildHardAvoidSignals(collectFamilyPreference(familyMembers, familyProfile));
}

export function recipeMatchesHardAvoid(recipe, context = {}) {
  return recipeViolatesHardAvoid(recipe, {
    ...context,
    hardAvoidSignals: context.hardAvoidSignals ?? getHardAvoidSignals(context),
  });
}

export function collectDinnerRecommendationFeedback({
  recommendationFeedback = [],
  mealRuns = [],
  householdId = "",
} = {}) {
  const legacy = (Array.isArray(recommendationFeedback) ? recommendationFeedback : [])
    .map((item) => ({
      ...item,
      recipeIds: [...new Set([
        ...(Array.isArray(item?.recipeIds) ? item.recipeIds : []),
        item?.recipeId,
      ].filter(Boolean))],
      value: normalizeDinnerFeedbackValue(item?.value || item?.reasonId),
    }))
    .filter((item) => item.recipeIds.length > 0 && item.value);
  const completed = (Array.isArray(mealRuns) ? mealRuns : [])
    .filter((run) => (
      run?.status === "completed"
      && (!householdId || run.householdId === householdId)
      && Array.isArray(run.recipeIds)
    ))
    .flatMap((run) => (Array.isArray(run.feedback) ? run.feedback : []).map((entry) => ({
      recipeIds: [...new Set(run.recipeIds.filter(Boolean))],
      value: normalizeDinnerFeedbackValue(entry?.value),
      mealRunId: run.id || "",
      userId: entry?.userId || "",
      createdAt: entry?.updatedAt || entry?.createdAt || run.completedAt || "",
    })))
    .filter((item) => item.recipeIds.length > 0 && item.value);
  return [...legacy, ...completed].slice(-100);
}

export function normalizeDinnerFeedbackValue(value) {
  if (value === "want_again") return "want_again";
  if (["change_it", "change_next_time", "family_dislikes", "hard_to_buy", "wrong_taste", "not_dinner"].includes(value)) {
    return "change_it";
  }
  if (["too_hard", "too_much_effort", "too_much_work"].includes(value)) return "too_hard";
  return "";
}

export async function requestBalancedDinnerWithFallback({
  requestServer,
  serverPayload,
  localInput,
  validateServerGroup = (group) => validateDinnerRecommendationIds(group, localInput),
}) {
  try {
    const group = await requestServer(serverPayload);
    if (validateServerGroup(group)) return { source: "server", group };
  } catch (error) {
    if (!isRecommendationConnectivityError(error)) throw error;
  }
  return {
    source: "local_fallback",
    group: localInput?.storage ? rotateLocalDinner(localInput) : buildLocalBalancedDinner(localInput),
  };
}

export function validateDinnerRecommendationIds(group, input = {}) {
  const recipeIds = Array.isArray(group?.recipeIds) ? group.recipeIds : [];
  const targetDishCount = normalizeDinnerDishCount(input, recipeIds.length);
  if (recipeIds.length !== targetDishCount || new Set(recipeIds).size !== recipeIds.length) return false;
  const catalog = Array.isArray(input.catalog) ? input.catalog : recipes;
  return recipeIds.every((id) => {
    const recipe = catalog.find((candidate) => candidate.id === id);
    if (!recipe) return false;
    if (input.mode === "meal_execution" && (
      recipe.cookAssist?.status !== "certified"
      || recipe.cookAssist.effortTier !== input.effortTier
    )) return false;
    if ((input.dislikedRecipeIds ?? []).includes(id)) return false;
    return !recipeMatchesHardAvoid(recipe, input);
  });
}

export function buildLocalBalancedDinner(input = {}) {
  const targetDishCount = normalizeDinnerDishCount(input);
  const catalog = Array.isArray(input.catalog) ? input.catalog : recipes;
  const seenIds = new Set([
    ...(input.rotation?.seenRecipeIds ?? []),
    ...(input.excludedRecipeIds ?? []),
  ]);
  const safe = catalog
    .filter((recipe) => {
      if (seenIds.has(recipe.id)) return false;
      if (input.mode === "meal_execution" && (
        recipe.cookAssist?.status !== "certified"
        || recipe.cookAssist.effortTier !== input.effortTier
      )) return false;
      if ((input.dislikedRecipeIds ?? []).includes(recipe.id)) return false;
      return !recipeMatchesHardAvoid(recipe, input);
    });
  const pool = safe.length >= targetDishCount ? safe : catalog.filter((recipe) => (
    !seenIds.has(recipe.id)
    && !(input.dislikedRecipeIds ?? []).includes(recipe.id)
    && !recipeMatchesHardAvoid(recipe, input)
    && (input.mode !== "meal_execution" || (
      recipe.cookAssist?.status === "certified"
      && recipe.cookAssist.effortTier === input.effortTier
    ))
  ));
  const ranked = pool
    .map((recipe) => ({ recipe, score: localRecipeScore(recipe, input) }))
    .sort((left, right) => right.score - left.score || left.recipe.id.localeCompare(right.recipe.id));
  const best = ranked[0]?.score ?? 0;
  const highScoreWindow = ranked.filter((item) => item.score >= best - 12);
  const selected = chooseLocalComplementaryGroup(
    highScoreWindow.length >= targetDishCount ? highScoreWindow : ranked,
    targetDishCount,
  );
  const recipeIds = selected.map((item) => item.recipe.id);
  if (recipeIds.length !== targetDishCount) {
    const error = new Error("没有足够的安全菜谱可供推荐。");
    error.code = "recommendation_candidates_exhausted";
    throw error;
  }
  return {
    recommendationId: `local:${input.dateKey || "today"}:${input.effortTier || "legacy"}:${recipeIds.join("+")}`,
    recipeIds,
    cycle: Number(input.rotation?.cycle || 0),
    groupIndex: Math.floor((input.rotation?.seenRecipeIds?.length || 0) / targetDishCount),
    exhausted: false,
    reasonCode: "local_balanced_fallback",
    stateVersion: "",
  };
}

export function rotateLocalDinner(input = {}) {
  const storage = input.storage;
  if (!storage?.getItem || !storage?.setItem) {
    throw new Error("Dinner rotation storage is required.");
  }
  const targetDishCount = normalizeDinnerDishCount(input);
  const scopeKey = [
    input.householdId || "guest",
    input.dateKey,
    input.mode,
    input.effortTier || "legacy",
    input.contextFingerprint,
  ].join(":");
  const storageKey = `humi:recommendation:v1:${scopeKey}`;
  const stored = readLocalDinnerRotation(storage, storageKey, scopeKey, input.householdId || "guest");
  const action = ["next", "reject"].includes(input.action) ? input.action : "initial";
  if (action === "initial" && stored.seenRecipeIds.length >= targetDishCount) {
    const recipeIds = stored.seenRecipeIds.slice(-targetDishCount);
    if (validateDinnerRecommendationIds({ recipeIds }, { ...input, targetDishCount })) {
      return localDinnerGroup(recipeIds, stored, targetDishCount, false, "current_group");
    }
  }

  let rotation = stored;
  let exhausted = false;
  let protectedRecipeIds = [];
  const candidateCount = localDinnerCandidates({ ...input, rotation }).length;
  if (candidateCount < targetDishCount) {
    exhausted = true;
    protectedRecipeIds = stored.recentGroupIds.slice(-2).flatMap((groupId) => groupId.split("+"));
    rotation = { ...stored, seenRecipeIds: [], cycle: stored.cycle + 1 };
  }
  const selected = buildLocalBalancedDinner({
    ...input,
    targetDishCount,
    rotation,
    excludedRecipeIds: [...(input.excludedRecipeIds ?? []), ...protectedRecipeIds],
  });
  const nextRotation = {
    scopeKey,
    householdId: input.householdId || "guest",
    seenRecipeIds: [...rotation.seenRecipeIds, ...selected.recipeIds],
    recentGroupIds: [...stored.recentGroupIds, [...selected.recipeIds].sort().join("+")].slice(-10),
    cycle: rotation.cycle,
    updatedAt: new Date().toISOString(),
  };
  storage.setItem(storageKey, JSON.stringify(nextRotation));
  return localDinnerGroup(
    selected.recipeIds,
    nextRotation,
    targetDishCount,
    exhausted,
    exhausted ? "cycle_reset_recent_protected" : "balanced_unseen",
  );
}

function selectDinnerSet({ primary, scored, fallbackRecipes, hardAvoidSignals, targetDishCount }) {
  const selected = [];
  const selectedIds = new Set();
  const addRecipe = (recipe) => {
    if (!recipe || selectedIds.has(recipe.id) || recipeViolatesHardAvoid(recipe, { hardAvoidSignals })) return false;
    selected.push(recipe);
    selectedIds.add(recipe.id);
    return true;
  };

  addRecipe(primary);

  const scoredRecipes = scored.map(({ recipe }) => recipe);
  const candidates = [...scoredRecipes, ...fallbackRecipes];
  while (selected.length < targetDishCount) {
    const next =
      candidates.find((recipe) => !selectedIds.has(recipe.id) && pairsWellWithSet(selected, recipe)) ??
      candidates.find((recipe) => !selectedIds.has(recipe.id));
    if (!next) break;
    addRecipe(next);
  }

  return selected;
}

function normalizeDinnerDishCount(input = {}, responseLength = 0) {
  const requested = Number.parseInt(input.targetDishCount, 10);
  if (Number.isFinite(requested)) return Math.max(1, Math.min(4, requested));
  if (responseLength > 0) return responseLength;
  if (input.mode === "meal_execution" && input.effortTier === "quick_15") return 1;
  const familySize = Math.max(1, Number.parseInt(input.familyProfile?.familySize, 10) || 2);
  return input.mode === "legacy" && familySize >= 5 ? 3 : familySize <= 1 ? 1 : 2;
}

function isRecommendationConnectivityError(error) {
  if (error?.name === "AbortError" || error instanceof TypeError) return true;
  if (Number(error?.status) === 0) return true;
  return /failed to fetch|network|timeout|load failed|网络|连接|超时/i.test(String(error?.message || ""));
}

function localRecipeScore(recipe, input = {}) {
  let score = (Array.isArray(input.recommendationFeedback) ? input.recommendationFeedback : []).reduce((total, item) => {
    const recipeIds = [item?.recipeId, ...(Array.isArray(item?.recipeIds) ? item.recipeIds : [])];
    if (!recipeIds.includes(recipe.id)) return total;
    return total + feedbackScoreDelta(item.value || item.reasonId);
  }, 100);
  const pantryNames = new Set((input.pantryItems ?? []).map((item) => normalize(item?.name || item)));
  score += (recipe.ingredients ?? []).filter((ingredient) => pantryNames.has(normalize(ingredient?.name))).length * 3;
  const haystack = [
    recipe.searchText,
    recipe.name,
    recipe.title,
    recipe.description,
    ...(recipe.categories ?? []),
    ...(recipe.tags ?? []),
    ...(recipe.ingredients ?? []).map((ingredient) => ingredient?.name),
  ].filter(Boolean).map(normalize).join(" ");
  const wanted = (input.wantToEatItems ?? []).map((item) => normalize(item?.name || item?.title || item));
  if (wanted.some((signal) => signal && haystack.includes(signal))) score += 8;
  if (recipe.cookAssist?.cleanupLevel === "low") score += input.effortTier === "quick_15" ? 4 : 1;
  return score;
}

function feedbackScoreDelta(value) {
  const normalized = normalizeDinnerFeedbackValue(value);
  if (normalized === "want_again") return 12;
  if (normalized === "change_it") return -7;
  if (normalized === "too_hard") return -12;
  return 0;
}

function chooseLocalComplementaryGroup(scored, targetDishCount) {
  const selected = [];
  const usedPrimaryCategories = new Set();
  for (const item of scored) {
    if (selected.length >= targetDishCount) break;
    const primaryCategory = item.recipe.categories?.[0] || "";
    if (selected.length > 0 && primaryCategory && usedPrimaryCategories.has(primaryCategory)) continue;
    selected.push(item);
    if (primaryCategory) usedPrimaryCategories.add(primaryCategory);
  }
  if (selected.length < targetDishCount) {
    for (const item of scored) {
      if (selected.length >= targetDishCount) break;
      if (!selected.some((entry) => entry.recipe.id === item.recipe.id)) selected.push(item);
    }
  }
  return selected;
}

function localDinnerCandidates(input = {}) {
  const catalog = Array.isArray(input.catalog) ? input.catalog : recipes;
  const seenIds = new Set([
    ...(input.rotation?.seenRecipeIds ?? []),
    ...(input.excludedRecipeIds ?? []),
  ]);
  return catalog.filter((recipe) => (
    !seenIds.has(recipe.id)
    && !(input.dislikedRecipeIds ?? []).includes(recipe.id)
    && !recipeMatchesHardAvoid(recipe, input)
    && (input.mode !== "meal_execution" || (
      recipe.cookAssist?.status === "certified"
      && recipe.cookAssist.effortTier === input.effortTier
    ))
  ));
}

function readLocalDinnerRotation(storage, storageKey, scopeKey, householdId) {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || "null");
    if (parsed?.scopeKey === scopeKey && Array.isArray(parsed.seenRecipeIds) && Array.isArray(parsed.recentGroupIds)) {
      return {
        scopeKey,
        householdId,
        seenRecipeIds: [...new Set(parsed.seenRecipeIds.map(String))],
        recentGroupIds: [...new Set(parsed.recentGroupIds.map(String))].slice(-10),
        cycle: Math.max(0, Number.parseInt(parsed.cycle, 10) || 0),
        updatedAt: String(parsed.updatedAt || ""),
      };
    }
  } catch {
    // Invalid local cursors are discarded and rebuilt from the scoped catalog.
  }
  return { scopeKey, householdId, seenRecipeIds: [], recentGroupIds: [], cycle: 0, updatedAt: "" };
}

function localDinnerGroup(recipeIds, rotation, targetDishCount, exhausted, reasonCode) {
  return {
    recommendationId: `local:${rotation.cycle}:${recipeIds.join("+")}`,
    recipeIds,
    cycle: rotation.cycle,
    groupIndex: Math.max(0, Math.floor(rotation.seenRecipeIds.length / targetDishCount) - 1),
    exhausted,
    reasonCode,
    stateVersion: String(simpleDinnerHash(JSON.stringify(rotation))),
  };
}

function simpleDinnerHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getTargetDishCount(familySize) {
  if (familySize <= 2) return 2;
  if (familySize <= 4) return 3;
  return 4;
}

function normalizeFamilySize(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(8, Math.max(1, parsed));
}

function quantityPriorityScore(recipe) {
  const categories = new Set(recipe.categories);
  const nutrition = nutritionFor(recipe);
  let score = nutrition.proteinG >= 15 ? 12 : 0;
  if (categories.has("肉类") || categories.has("海鲜") || categories.has("豆制品") || categories.has("蛋类")) score += 14;
  if (categories.has("主食") || categories.has("粥")) score += 10;
  if (categories.has("素菜") || categories.has("清爽")) score += 4;
  if (categories.has("汤")) score -= 4;
  return score;
}

function collectMatchedPantryItems(selected, pantryState) {
  const selectedIngredientNames = selected.flatMap((recipe) =>
    recipe.ingredients.map((item) => normalize(item.name)),
  );
  return [...new Set(selectedIngredientNames)]
    .filter((name) => pantryState.usableNames.has(name))
    .slice(0, 5);
}

function buildPantryExplanation({ inventoryHits, expiringHits, matchedPantryItems }) {
  if (expiringHits > 0) return `先把快到期的吃掉：${matchedPantryItems.join("、") || `${expiringHits} 项食材`}。`;
  if (inventoryHits > 0) return `能用上家里现有的：${matchedPantryItems.join("、") || `${inventoryHits} 项食材`}。`;
  return "这组需要新买几样主食材，适合顺路补齐。";
}

function buildPreferenceExplanation(preferenceHits) {
  if (preferenceHits > 0) return `避开了 ${preferenceHits} 个家里的硬忌口线索。`;
  return "还没积累太多行为信号，先按家里现有、耗时和搭配来安排。";
}

function buildWantExplanation(wantIntentHits) {
  if (wantIntentHits > 0) return `照顾到最近记下的 ${wantIntentHits} 个想吃。`;
  return "最近想吃里还没有能直接匹配的菜，先按今晚做起来方不方便来安排。";
}

function buildFeelingExplanation(feelingHits) {
  if (feelingHits > 0) return `照顾到 ${feelingHits} 个家人这次点的感觉。`;
  return "这次没有明确感觉命中，先按忌口、耗时和搭配平衡安排。";
}

function buildMealHistoryExplanation(mealHistoryHits, historyTaste) {
  if (mealHistoryHits <= 0 || historyTaste.sampleCount < 2) {
    return "确认做过的餐次还不多，暂不让历史口味左右今晚。";
  }
  const categories = [...historyTaste.preferredCategories].slice(0, 3).join("、");
  return `参考最近确认做过的 ${historyTaste.sampleCount} 道菜，轻量照顾 ${categories || "常做类型"}，但仍避开原菜重复。`;
}

function buildGroceryExplanation(missingItems) {
  if (missingItems.length === 0) return "主食材基本够了，可以直接开做。";
  return `还要买：${dedupeItems(missingItems).map((item) => item.name).join("、")}。`;
}

function buildPantryState(pantryItems) {
  return pantryItems.reduce(
    (state, item) => {
      const name = normalize(item.name);
      if (!name) return state;
      const expiryState = getExpiryState(item.expiresOn);
      if (expiryState === "expired") {
        state.expiredNames.add(name);
        return state;
      }
      state.usableNames.add(name);
      if (expiryState === "soon") state.expiringNames.add(name);
      return state;
    },
    { usableNames: new Set(), expiringNames: new Set(), expiredNames: new Set() },
  );
}

function collectFamilyPreference(members, familyProfile = {}) {
  const memberPreference = members.reduce(
    (summary, member) => {
      const preference = member.preference ?? {};
      return {
        dislikes: [...summary.dislikes, ...(preference.dislikes ?? [])].map(normalize),
        allergies: [...summary.allergies, ...(preference.allergies ?? [])].map(normalize),
      };
    },
    { dislikes: [], allergies: [] },
  );
  return {
    likes: [],
    dislikes: [...memberPreference.dislikes, ...(familyProfile.dislikes ?? [])].map(normalize),
    allergies: [...memberPreference.allergies, ...(familyProfile.allergies ?? [])].map(normalize),
    goals: [...(familyProfile.goals ?? [])].map(normalize),
  };
}

function scorePreference(recipe, familyPreference) {
  const haystack = buildRecipeHaystack(recipe);
  const nutrition = nutritionFor(recipe);
  const likeHits = familyPreference.likes.filter((signal) => signal && haystack.includes(signal)).length;
  const dislikeHits = familyPreference.dislikes.filter((signal) => signal && haystack.includes(signal)).length;
  const allergyHits = familyPreference.allergies.filter((signal) => signal && haystack.includes(signal)).length;
  const goalBonus = familyPreference.goals.reduce((bonus, goal) => {
    if (goal.includes("高蛋白") && nutrition.proteinG >= 15) return bonus + 12;
    if ((goal.includes("低脂") || goal.includes("少油")) && nutrition.fatG <= 12) return bonus + 8;
    if ((goal.includes("快手") || goal.includes("省时")) && recipe.timeMinutes <= 25) return bonus + 8;
    if ((goal.includes("清淡") || goal.includes("少辣")) && !haystack.includes("辣")) return bonus + 6;
    return bonus;
  }, 0);

  return {
    bonus: likeHits * 10 + goalBonus,
    penalty: dislikeHits * 40 + allergyHits * 120,
    hits: likeHits + (goalBonus > 0 ? 1 : 0),
  };
}

function collectWantSignals(wantToEatItems = []) {
  return wantToEatItems
    .filter((item) => item?.status !== "done")
    .slice(0, 12)
    .flatMap((item) => {
      const title = normalize(item.title);
      const note = normalize(item.note);
      const recipeId = normalize(item.recipeId);
      return [
        recipeId && { type: "recipe", value: recipeId },
        title && { type: "text", value: title },
        note && { type: "text", value: note },
      ].filter(Boolean);
    });
}

function scoreWantSignals(recipe, wantSignals = []) {
  if (wantSignals.length === 0) return { bonus: 0, hits: 0 };
  const recipeId = normalize(recipe.id);
  const haystack = buildRecipeHaystack(recipe);
  const hits = wantSignals.reduce((count, signal) => {
    if (signal.type === "recipe" && signal.value === recipeId) return count + 1;
    if (signal.type !== "text") return count;
    if (signal.value.length <= 1) return count;
    if (haystack.includes(signal.value) || signal.value.includes(normalize(recipe.name))) return count + 1;
    return count;
  }, 0);
  return {
    bonus: Math.min(36, hits * 18),
    hits,
  };
}

function collectFeelingSignals(craveVotes = []) {
  return craveVotes
    .map((vote) => normalize(vote?.feelingTag ?? vote))
    .filter((tag) => tag && tag !== "随便都行")
    .slice(0, 8);
}

function scoreFeelingSignals(recipe, feelingSignals = []) {
  if (feelingSignals.length === 0) return { bonus: 0, hits: 0 };
  const hits = feelingSignals.filter((tag) => recipeMatchesFeeling(recipe, tag)).length;
  return {
    bonus: Math.min(42, hits * 14),
    hits,
  };
}

function scoreMealHistoryTaste(recipe, historyTaste) {
  if (!historyTaste || historyTaste.sampleCount < 2) return { bonus: 0, hits: 0 };
  const categoryHits = recipe.categories.filter((category) => historyTaste.preferredCategories.has(category)).length;
  const quickHit = historyTaste.prefersQuick && recipe.timeMinutes <= 25 ? 1 : 0;
  const hits = categoryHits + quickHit;
  return {
    bonus: Math.min(12, categoryHits * 4 + quickHit * 3),
    hits,
  };
}

function buildHardAvoidSignals(familyPreference) {
  return [
    ...familyPreference.dislikes,
    ...familyPreference.allergies,
  ].flatMap(expandAvoidSignal).filter(Boolean);
}

function expandAvoidSignal(signal) {
  const normalized = normalize(signal).replace(/[，。,.；;、\s]/g, "");
  if (!normalized) return [];
  const stripped = normalized
    .replace(/^(?:我|本人|孩子|小孩|宝宝)?对/, "")
    .replace(/(?:严重)?(?:过敏|不耐受|不能吃|吃不了|忌口|不吃)$/g, "");
  const expanded = [stripped || normalized];
  if (normalized.includes("太辣") || normalized.includes("不吃辣") || normalized.includes("少辣")) expanded.push("辣");
  if (normalized.includes("海鲜")) expanded.push("鱼", "虾", "贝", "蟹");
  if (normalized.includes("坚果") || normalized.includes("花生") || normalized.includes("腰果")) expanded.push("坚果", "花生", "核桃", "杏仁", "腰果");
  if (normalized.includes("鸡蛋") || normalized.includes("蛋类")) expanded.push("鸡蛋", "蛋");
  if (normalized.includes("豆制品")) expanded.push("豆腐", "豆浆", "豆皮");
  if (normalized.includes("乳糖")) expanded.push("牛奶", "奶酪", "奶");
  return [...new Set(expanded)];
}

function matchesSignals(recipe, signals = []) {
  const haystack = buildRecipeHaystack(recipe);
  return signals.some((signal) => signal && haystack.includes(signal));
}

function buildRecipeHaystack(recipe) {
  return [
    recipe.name,
    recipe.description,
    ...recipe.categories,
    ...recipe.tags,
    ...recipe.ingredients.map((item) => item.name),
  ]
    .map(normalize)
    .join(" ");
}

function recipeMatchesFeeling(recipe, feelingTag) {
  const categories = new Set(recipe.categories ?? []);
  const tags = new Set(recipe.tags ?? []);
  const haystack = buildRecipeHaystack(recipe);
  if (feelingTag === "辣一点") return /辣|麻婆|鱼香/.test(haystack);
  if (feelingTag === "清淡点") return /清淡|清爽|低脂|汤|蒸|白灼/.test(haystack);
  if (feelingTag === "想喝汤" || feelingTag === "喝点汤") return categories.has("汤") || /汤|粥/.test(haystack);
  if (feelingTag === "想吃肉" || feelingTag === "有肉") return /肉|鸡|牛|排骨|鱼|虾|蛋/.test(haystack) || categories.has("肉菜");
  if (feelingTag === "想吃素") return categories.has("素菜") || /豆腐|蔬|青菜|西兰花|土豆|茄子/.test(haystack);
  if (feelingTag === "不想动" || feelingTag === "快手") return recipe.timeMinutes <= 25 || /省时|快手|10分钟|15分钟|20分钟/.test(haystack);
  if (feelingTag === "想暖胃") return /汤|粥|炖|暖|冬瓜|番茄/.test(haystack);
  if (feelingTag === "开胃 / 酸") return /酸|番茄|鱼香|醋|柠檬/.test(haystack);
  return tags.has(feelingTag) || haystack.includes(feelingTag);
}

function balancedCategoryScore(recipe) {
  if (recipe.categories.some((category) => ["蔬菜", "素菜", "清爽"].includes(category))) return 16;
  if (recipe.categories.some((category) => ["肉类", "海鲜", "豆制品", "蛋类"].includes(category))) return 12;
  if (recipe.categories.some((category) => ["汤", "粥"].includes(category))) return 8;
  return 4;
}

function scorePlanningMode(recipe, modeId) {
  const haystack = [
    recipe.name,
    recipe.description,
    ...recipe.categories,
    ...recipe.tags,
    ...recipe.ingredients.map((item) => item.name),
  ]
    .map(normalize)
    .join(" ");
  const nutrition = nutritionFor(recipe);

  if (modeId === "fat_loss") {
    return (nutrition.fatG <= 12 ? 14 : 0) +
      (nutrition.proteinG >= 15 ? 10 : 0) +
      (recipe.categories.some((category) => ["蔬菜", "素菜", "清爽", "汤"].includes(category)) ? 10 : 0) -
      (haystack.includes("油炸") || haystack.includes("甜") ? 18 : 0);
  }
  if (modeId === "fitness") {
    return (nutrition.proteinG >= 20 ? 18 : nutrition.proteinG >= 15 ? 12 : 0) +
      (recipe.timeMinutes <= 35 ? 6 : 0) +
      (haystack.includes("鸡胸") || haystack.includes("牛肉") || haystack.includes("虾") || haystack.includes("豆腐") ? 8 : 0);
  }
  if (modeId === "baby_food") {
    return (recipe.timeMinutes <= 35 ? 6 : 0) +
      (haystack.includes("粥") || haystack.includes("蒸") || haystack.includes("汤") || haystack.includes("软") ? 16 : 0) -
      (haystack.includes("辣") || haystack.includes("油炸") || haystack.includes("坚果") || haystack.includes("蜂蜜") ? 40 : 0);
  }
  return recipe.timeMinutes <= 35 ? 8 : 0;
}

function pairsWell(primary, candidate) {
  const primaryCategories = new Set(primary.categories);
  if (primaryCategories.has("肉类")) {
    return candidate.categories.some((category) => ["蔬菜", "素菜", "汤"].includes(category));
  }
  if (primaryCategories.has("素菜")) {
    return candidate.categories.some((category) => ["肉类", "蛋类", "豆制品", "海鲜"].includes(category));
  }
  return candidate.timeMinutes <= 30;
}

function pairsWellWithSet(selected, candidate) {
  if (selected.length === 0) return true;
  const selectedCategories = new Set(selected.flatMap((recipe) => recipe.categories));
  const candidateCategories = new Set(candidate.categories);

  if (!selectedCategories.has("素菜") && candidateCategories.has("素菜")) return true;
  if (!selectedCategories.has("清爽") && candidateCategories.has("清爽")) return true;
  if (!selectedCategories.has("汤") && candidateCategories.has("汤")) return true;
  if (
    ![...selectedCategories].some((category) => ["肉类", "海鲜", "豆制品", "蛋类"].includes(category)) &&
    [...candidateCategories].some((category) => ["肉类", "海鲜", "豆制品", "蛋类"].includes(category))
  ) {
    return true;
  }
  return selected.some((recipe) => pairsWell(recipe, candidate));
}

function buildReason({ selected, inventoryHits, expiringHits, groceryItems, selectedMissing, preferenceHits, wantIntentHits, feelingHits, mealHistoryHits }) {
  const quickCount = selected.filter((recipe) => recipe.timeMinutes <= 25).length;
  if (expiringHits > 0) {
    return `优先用掉 ${expiringHits} 项快到期食材，日期已过的先留给你确认，适合今天减少浪费。`;
  }
  if (feelingHits > 0) {
    return `已把这次征集里的 ${feelingHits} 个感觉放进排序，同时继续避开家里的硬忌口。`;
  }
  if (wantIntentHits > 0) {
    return `优先看看最近记下的 ${wantIntentHits} 个想吃，同时继续避开家里一定不能吃的东西。`;
  }
  if (mealHistoryHits > 0) {
    return `参考最近确认做过的菜，命中 ${mealHistoryHits} 个常做类型，同时降低了原菜重复。`;
  }
  if (preferenceHits > 0) {
    return `已避开家里的硬忌口，并参考 ${preferenceHits} 个行为信号来排序。`;
  }
  if (inventoryHits > 0) {
    return `优先用上家里现有食材，预计少买 ${inventoryHits} 项，适合今天快速开火。`;
  }
  if (selectedMissing.length <= 3 && groceryItems.length > 0) {
    return "缺口食材少，能直接衔接当前采购清单，适合今天执行。";
  }
  if (quickCount > 0) {
    return "组合里有省时菜，能降低晚餐决策和下厨压力。";
  }
  return "按荤素和耗时做了平衡，适合作为家庭晚餐方案。";
}

function dedupeItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalize(item.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(value) {
  return String(value).trim().toLowerCase();
}

function getExpiryState(expiresOn) {
  if (!expiresOn) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(`${expiresOn}T00:00:00`);
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000);
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 3) return "soon";
  return "fresh";
}
