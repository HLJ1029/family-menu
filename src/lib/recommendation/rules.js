import { nutritionFor, recipes } from "../recipes";

const recentRecipeIds = new Set();
const dislikedSignals = ["鸡爪", "肥肠"];

export function buildTodayRecommendation({ pantryItems = [], weekPlan = {}, groceryItems = [], todayRecipes = [] }) {
  const pantryNames = new Set(pantryItems.map((item) => normalize(item.name)));
  Object.values(weekPlan)
    .flat()
    .slice(-8)
    .forEach((recipeId) => recentRecipeIds.add(recipeId));
  todayRecipes.forEach((recipe) => recentRecipeIds.add(recipe.id));

  const scored = recipes
    .filter((recipe) => !todayRecipes.some((item) => item.id === recipe.id))
    .map((recipe) => {
      const ingredientNames = recipe.ingredients.map((item) => normalize(item.name));
      const pantryMatches = ingredientNames.filter((name) => pantryNames.has(name)).length;
      const missingRequired = recipe.ingredients.filter(
        (item) => item.required !== false && !pantryNames.has(normalize(item.name)),
      );
      const nutrition = nutritionFor(recipe);
      const quickBonus = recipe.timeMinutes <= 25 ? 18 : 0;
      const balanceBonus = balancedCategoryScore(recipe);
      const pantryBonus = pantryMatches * 16;
      const nutritionBonus = nutrition.proteinG >= 15 ? 10 : 0;
      const repeatedPenalty = recentRecipeIds.has(recipe.id) ? 22 : 0;
      const dislikedPenalty = dislikedSignals.some((signal) => recipe.name.includes(signal)) ? 16 : 0;
      const score = quickBonus + balanceBonus + pantryBonus + nutritionBonus - repeatedPenalty - dislikedPenalty;
      return { recipe, score, pantryMatches, missingRequired };
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
    .reduce((total, item) => total + item.pantryMatches, 0);
  const calories = selected.reduce((total, recipe) => total + nutritionFor(recipe).caloriesKcal, 0);
  const protein = selected.reduce((total, recipe) => total + nutritionFor(recipe).proteinG, 0);

  return {
    recipes: selected,
    title: selected.map((recipe) => recipe.name).join(" + "),
    reason: buildReason({ selected, inventoryHits, groceryItems, selectedMissing }),
    inventoryHits,
    missingItems: dedupeItems(selectedMissing),
    nutrition: {
      caloriesKcal: calories,
      proteinG: protein,
    },
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

function buildReason({ selected, inventoryHits, groceryItems, selectedMissing }) {
  const quickCount = selected.filter((recipe) => recipe.timeMinutes <= 25).length;
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
