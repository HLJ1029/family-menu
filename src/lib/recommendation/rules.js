import { nutritionFor, recipes } from "../recipes";

const recentRecipeIds = new Set();
const dislikedSignals = ["鸡爪", "肥肠"];

export function buildTodayRecommendation({
  pantryItems = [],
  weekPlan = {},
  groceryItems = [],
  todayRecipes = [],
  familyMembers = [],
}) {
  const pantryState = buildPantryState(pantryItems);
  const familyPreference = collectFamilyPreference(familyMembers);
  Object.values(weekPlan)
    .flat()
    .slice(-8)
    .forEach((recipeId) => recentRecipeIds.add(recipeId));
  todayRecipes.forEach((recipe) => recentRecipeIds.add(recipe.id));

  const scored = recipes
    .filter((recipe) => !todayRecipes.some((item) => item.id === recipe.id))
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
      const score =
        quickBonus +
        balanceBonus +
        pantryBonus +
        nutritionBonus +
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

  const primary = scored[0]?.recipe ?? recipes[0];
  const partner =
    scored.find(({ recipe }) => recipe.id !== primary.id && pairsWell(primary, recipe))?.recipe ??
    scored.find(({ recipe }) => recipe.id !== primary.id)?.recipe ??
    recipes[1];
  const selected = [primary, partner].filter(Boolean);
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
  const calories = selected.reduce((total, recipe) => total + nutritionFor(recipe).caloriesKcal, 0);
  const protein = selected.reduce((total, recipe) => total + nutritionFor(recipe).proteinG, 0);
  const matchedPantryItems = collectMatchedPantryItems(selected, pantryState);

  return {
    recipes: selected,
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

function collectFamilyPreference(members) {
  return members.reduce(
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
}

function scorePreference(recipe, familyPreference) {
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

function balancedCategoryScore(recipe) {
  if (recipe.categories.some((category) => ["蔬菜", "素菜", "清爽"].includes(category))) return 16;
  if (recipe.categories.some((category) => ["肉类", "海鲜", "豆制品", "蛋类"].includes(category))) return 12;
  if (recipe.categories.some((category) => ["汤", "粥"].includes(category))) return 8;
  return 4;
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
    return "组合里有快手菜，能降低晚餐决策和下厨压力。";
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
