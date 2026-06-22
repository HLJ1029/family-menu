import { nutritionFor, recipes } from "../recipes";
import { getPlanningMode } from "../profile";

const recentRecipeIds = new Set();
const dislikedSignals = ["鸡爪", "肥肠"];

export function buildTodayRecommendation({
  pantryItems = [],
  weekPlan = {},
  groceryItems = [],
  todayRecipes = [],
  familyMembers = [],
  familyProfile = {},
  excludedRecipeIds = [],
}) {
  const pantryState = buildPantryState(pantryItems);
  const familyPreference = collectFamilyPreference(familyMembers, familyProfile);
  const planningMode = getPlanningMode(familyProfile.planningMode);
  const excludedIds = new Set(excludedRecipeIds);
  Object.values(weekPlan)
    .flat()
    .slice(-8)
    .forEach((recipeId) => recentRecipeIds.add(recipeId));
  todayRecipes.forEach((recipe) => recentRecipeIds.add(recipe.id));

  const scored = recipes
    .filter(
      (recipe) =>
        !excludedIds.has(recipe.id) &&
        !todayRecipes.some((item) => item.id === recipe.id) &&
        !matchesSignals(recipe, familyPreference.allergies),
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
      const modeScore = scorePlanningMode(recipe, planningMode.id);
      const score =
        quickBonus +
        balanceBonus +
        pantryBonus +
        nutritionBonus +
        modeScore +
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
      };
    })
    .sort((a, b) => b.score - a.score);

  const fallbackRecipes = recipes.filter((recipe) => !matchesSignals(recipe, familyPreference.allergies));
  const familySize = normalizeFamilySize(familyProfile.familySize);
  const targetDishCount = getTargetDishCount(familySize);
  const primary = scored[0]?.recipe ?? fallbackRecipes[0] ?? recipes[0];
  const selected = selectDinnerSet({
    primary,
    scored,
    fallbackRecipes,
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
    }),
    inventoryHits,
    expiringHits,
    preferenceHits,
    missingItems: dedupeItems(selectedMissing),
    explanation: {
      pantry: buildPantryExplanation({ inventoryHits, expiringHits, matchedPantryItems }),
      preference: buildPreferenceExplanation(preferenceHits),
      grocery: buildGroceryExplanation(selectedMissing),
    },
    nutrition: {
      caloriesKcal: calories,
      proteinG: protein,
    },
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

function selectDinnerSet({ primary, scored, fallbackRecipes, targetDishCount }) {
  const selected = [];
  const selectedIds = new Set();
  const addRecipe = (recipe) => {
    if (!recipe || selectedIds.has(recipe.id)) return false;
    selected.push(recipe);
    selectedIds.add(recipe.id);
    return true;
  };

  addRecipe(primary);

  const scoredRecipes = scored.map(({ recipe }) => recipe);
  const candidates = [...scoredRecipes, ...fallbackRecipes, ...recipes];
  while (selected.length < targetDishCount) {
    const next =
      candidates.find((recipe) => !selectedIds.has(recipe.id) && pairsWellWithSet(selected, recipe)) ??
      candidates.find((recipe) => !selectedIds.has(recipe.id));
    if (!next) break;
    addRecipe(next);
  }

  return selected;
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
  if (preferenceHits > 0) return `照顾到 ${preferenceHits} 个家人口味或饮食目标。`;
  return "还没记录太多口味，先按家里现有、耗时和搭配来安排。";
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
        likes: [...summary.likes, ...(preference.likes ?? [])].map(normalize),
        dislikes: [...summary.dislikes, ...(preference.dislikes ?? [])].map(normalize),
        allergies: [...summary.allergies, ...(preference.allergies ?? [])].map(normalize),
        goals: [...summary.goals, ...(preference.goals ?? [])].map(normalize),
      };
    },
    { likes: [], dislikes: [], allergies: [], goals: [] },
  );
  return {
    likes: [...memberPreference.likes, ...(familyProfile.tastePreferences ?? [])].map(normalize),
    dislikes: [...memberPreference.dislikes, ...(familyProfile.dislikes ?? [])].map(normalize),
    allergies: [...memberPreference.allergies, ...(familyProfile.allergies ?? [])].map(normalize),
    goals: [...memberPreference.goals, ...(familyProfile.goals ?? [])].map(normalize),
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

function buildReason({ selected, inventoryHits, expiringHits, groceryItems, selectedMissing, preferenceHits }) {
  const quickCount = selected.filter((recipe) => recipe.timeMinutes <= 25).length;
  if (expiringHits > 0) {
    return `优先消耗 ${expiringHits} 项临期库存，同时避开已过期食材，适合今天减少浪费。`;
  }
  if (preferenceHits > 0) {
    return `已参考家人口味和饮食目标，尽量避开忌口，也照顾到 ${preferenceHits} 个口味信号。`;
  }
  if (inventoryHits > 0) {
    return `优先消耗家中已有食材，预计少买 ${inventoryHits} 项，适合今天快速开火。`;
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
