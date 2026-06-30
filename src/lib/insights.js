import { getPlanningMode } from "./profile";
import { mealPlanEntriesForGroceries } from "./mealPlan";
import { getRecipe, nutritionFor, recipes } from "./recipes";

const nutrientLabels = {
  caloriesKcal: "热量",
  proteinG: "蛋白质",
  fatG: "脂肪",
  carbsG: "碳水",
};

const sourceLabels = {
  home: "在家做",
  delivery: "点外卖",
  outside: "外面吃",
  skip: "不记录",
};

export function getDefaultNutritionGoals(profile = {}) {
  const mode = getPlanningMode(profile.planningMode);
  const base = {
    modeId: mode.id,
    caloriesKcalMax: 650,
    proteinGMin: 22,
    fatGMax: 28,
    carbsGMax: 80,
    vegetableRatioMin: 0.35,
    proteinRatioMin: 0.35,
    quickRatioMin: 0.35,
    homeCookRatioMin: 0.5,
    label: "均衡家庭三餐",
  };

  if (mode.id === "fat_loss") {
    return {
      ...base,
      caloriesKcalMax: 520,
      proteinGMin: 25,
      fatGMax: 18,
      carbsGMax: 58,
      vegetableRatioMin: 0.45,
      homeCookRatioMin: 0.6,
      label: "减脂三餐",
    };
  }

  if (mode.id === "fitness") {
    return {
      ...base,
      caloriesKcalMax: 780,
      proteinGMin: 34,
      fatGMax: 30,
      carbsGMax: 95,
      proteinRatioMin: 0.5,
      quickRatioMin: 0.3,
      label: "健身增肌三餐",
    };
  }

  if (mode.id === "baby_food") {
    return {
      ...base,
      caloriesKcalMax: 460,
      proteinGMin: 14,
      fatGMax: 16,
      carbsGMax: 58,
      vegetableRatioMin: 0.4,
      quickRatioMin: 0.25,
      label: "清淡辅食灵感",
    };
  }

  return base;
}

export function normalizeNutritionGoals(profile = {}, goals = {}) {
  const defaults = getDefaultNutritionGoals(profile);
  return {
    ...defaults,
    ...goals,
    modeId: goals.modeId ?? defaults.modeId,
    label: goals.label || defaults.label,
  };
}

export function buildMealInsights({
  mealLogs = {},
  mealCalendar = {},
  pantryItems = [],
  familyProfile = {},
  nutritionGoals = {},
  todayRecipes = [],
  plannedRecipes = [],
  weekPlan = {},
  mealPlan = {},
  currentDate = new Date(),
} = {}) {
  const monthKey = formatMonthKey(currentDate);
  const goals = normalizeNutritionGoals(familyProfile, nutritionGoals);
  const monthLogs = Object.entries(mealLogs).filter(([dateKey]) => dateKey.startsWith(monthKey));
  const confirmedMeals = Object.entries(mealLogs ?? {})
    .filter(([dateKey]) => dateKey.startsWith(monthKey))
    .filter(([, log]) => log?.confirmation === "all")
    .map(([dateKey, log]) => ({
      dateKey,
      source: log?.source,
      recipes: buildConsumedRecipes({
        consumedEntries: log?.consumedEntries,
        recipeIds: mealCalendar?.[dateKey],
      }),
    }))
    .filter((meal) => meal.recipes.length > 0);
  const confirmedRecipes = confirmedMeals.flatMap((meal) => meal.recipes);
  const mealPlanRecipes = mealPlanEntriesForGroceries(mealPlan)
    .map((entry) => getRecipe(entry.recipeId))
    .filter(Boolean);
  const fallbackRecipes = [...todayRecipes, ...plannedRecipes, ...mealPlanRecipes].filter(Boolean);
  const hasConfirmedMeals = confirmedMeals.length > 0;
  const analysisRecipes = hasConfirmedMeals ? confirmedRecipes : fallbackRecipes;
  const nutritionTotals = sumNutrition(analysisRecipes);
  const nutritionAverages = averageNutrition(nutritionTotals, Math.max(analysisRecipes.length, 1));
  const categoryMix = buildCategoryMix(analysisRecipes);
  const sourceBreakdown = buildSourceBreakdown(monthLogs);
  const ratios = buildRatios({ recipes: analysisRecipes, sourceBreakdown, totalLogs: monthLogs.length });
  const targetProgress = buildTargetProgress({ averages: nutritionAverages, ratios, goals });
  const narrativeInsights = buildNarrativeInsights({ sourceBreakdown, ratios, targetProgress, hasConfirmedMeals });
  const pantryPriorityItems = buildPantryPriorityItems(pantryItems);
  const inventoryRecipeMatches = buildInventoryRecipeMatches({ pantryItems, pantryPriorityItems, weekPlan });

  return {
    monthKey,
    goals,
    hasConfirmedMeals,
    confirmedMeals,
    analysisRecipes,
    sourceBreakdown,
    nutritionTotals,
    nutritionAverages,
    targetProgress,
    categoryMix,
    ratios,
    narrativeInsights,
    pantryPriorityItems,
    inventoryRecipeMatches,
  };
}

function sumNutrition(recipeList) {
  return recipeList.reduce(
    (summary, recipe) => {
      const item = nutritionFor(recipe);
      return {
        caloriesKcal: summary.caloriesKcal + item.caloriesKcal,
        proteinG: summary.proteinG + item.proteinG,
        fatG: summary.fatG + item.fatG,
        carbsG: summary.carbsG + item.carbsG,
      };
    },
    { caloriesKcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  );
}

function buildConsumedRecipes({ consumedEntries, recipeIds }) {
  if (Array.isArray(consumedEntries) && consumedEntries.length > 0) {
    return consumedEntries.flatMap((entry) => {
      const recipe = getRecipe(entry.recipeId);
      if (!recipe) return [];
      const quantity = Math.max(1, Number.parseInt(entry.quantity, 10) || 1);
      return Array.from({ length: quantity }, () => recipe);
    });
  }

  return (recipeIds ?? []).map((recipeId) => getRecipe(recipeId)).filter(Boolean);
}

function averageNutrition(totals, count) {
  return Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, Math.round((value / count) * 10) / 10]),
  );
}

function buildSourceBreakdown(monthLogs) {
  const counts = { home: 0, delivery: 0, outside: 0, skip: 0 };
  monthLogs.forEach(([, log]) => {
    if (counts[log?.source] !== undefined) counts[log.source] += 1;
  });
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return {
    total,
    counts,
    items: Object.entries(counts).map(([id, count]) => ({
      id,
      label: sourceLabels[id],
      count,
      ratio: total > 0 ? count / total : 0,
    })),
  };
}

function buildCategoryMix(recipeList) {
  const counts = recipeList.reduce((summary, recipe) => {
    recipe.categories.forEach((category) => {
      summary[category] = (summary[category] ?? 0) + 1;
    });
    return summary;
  }, {});
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, count]) => ({ category, count }));
}

function buildRatios({ recipes: recipeList, sourceBreakdown, totalLogs }) {
  const totalRecipes = Math.max(recipeList.length, 1);
  const vegetableCount = recipeList.filter(isVegetableRecipe).length;
  const proteinCount = recipeList.filter(isProteinRecipe).length;
  const quickCount = recipeList.filter((recipe) => recipe.timeMinutes <= 25).length;
  return {
    vegetable: vegetableCount / totalRecipes,
    protein: proteinCount / totalRecipes,
    quick: quickCount / totalRecipes,
    homeCook: totalLogs > 0 ? (sourceBreakdown.counts.home ?? 0) / totalLogs : 0,
    vegetableCount,
    proteinCount,
    quickCount,
  };
}

function buildTargetProgress({ averages, ratios, goals }) {
  return [
    buildMaxTarget("caloriesKcal", averages.caloriesKcal, goals.caloriesKcalMax, "kcal"),
    buildMinTarget("proteinG", averages.proteinG, goals.proteinGMin, "g"),
    buildMaxTarget("fatG", averages.fatG, goals.fatGMax, "g"),
    buildMaxTarget("carbsG", averages.carbsG, goals.carbsGMax, "g"),
    buildRatioTarget("vegetable", "蔬菜比例", ratios.vegetable, goals.vegetableRatioMin),
    buildRatioTarget("protein", "蛋白类比例", ratios.protein, goals.proteinRatioMin),
    buildRatioTarget("quick", "省时菜比例", ratios.quick, goals.quickRatioMin),
    buildRatioTarget("homeCook", "在家做比例", ratios.homeCook, goals.homeCookRatioMin),
  ];
}

function buildMaxTarget(key, value, target, unit) {
  const ok = value <= target;
  return {
    key,
    label: nutrientLabels[key],
    value,
    target,
    unit,
    ok,
    direction: "max",
    percent: target > 0 ? Math.min(value / target, 1.4) : 0,
    hint: ok ? "控制得住" : `偏高 ${formatNumber(value - target)}${unit}`,
  };
}

function buildMinTarget(key, value, target, unit) {
  const ok = value >= target;
  return {
    key,
    label: nutrientLabels[key],
    value,
    target,
    unit,
    ok,
    direction: "min",
    percent: target > 0 ? Math.min(value / target, 1.4) : 0,
    hint: ok ? "达标" : `还差 ${formatNumber(target - value)}${unit}`,
  };
}

function buildRatioTarget(key, label, value, target) {
  const ok = value >= target;
  return {
    key,
    label,
    value,
    target,
    unit: "%",
    ok,
    direction: "min",
    percent: target > 0 ? Math.min(value / target, 1.4) : 0,
    hint: ok ? "达标" : `还差 ${Math.round((target - value) * 100)}%`,
  };
}

function buildNarrativeInsights({ sourceBreakdown, ratios, targetProgress, hasConfirmedMeals }) {
  const insights = [];
  if (!hasConfirmedMeals) {
    insights.push("确认餐次还不够，先用本周计划做弱参考。");
  }
  if ((sourceBreakdown.counts.delivery ?? 0) + (sourceBreakdown.counts.outside ?? 0) >= 3) {
    insights.push("本月外卖/外食偏多，可以先把两顿家常快手菜排进计划。");
  }
  if (ratios.vegetable < 0.35) insights.push("蔬菜相关菜偏少，下次推荐可优先选清爽蔬菜或汤。");
  if (ratios.protein >= 0.45) insights.push("蛋白来源比较稳定，可以继续保持。");
  if (targetProgress.some((item) => item.key === "fatG" && !item.ok)) insights.push("脂肪估算偏高，适合减少重油下饭菜。");
  if (insights.length === 0) insights.push("本月结构比较平衡，继续按当前节奏安排就好。");
  return insights.slice(0, 4);
}

function buildPantryPriorityItems(pantryItems) {
  return pantryItems
    .map((item) => {
      const daysUntilExpiry = getDaysUntilExpiry(item.expiresOn);
      const state = getExpiryStateFromDays(daysUntilExpiry, item.expiresOn);
      const score =
        state === "expired" ? 100 :
        state === "soon" ? 80 - Math.max(daysUntilExpiry, 0) :
        item.expiresOn ? 35 - Math.min(Math.max(daysUntilExpiry, 0), 30) :
        12;
      return {
        ...item,
        normalizedName: normalize(item.name),
        daysUntilExpiry,
        state,
        score,
        note: buildPantryNote(item, state, daysUntilExpiry),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function buildInventoryRecipeMatches({ pantryItems, pantryPriorityItems, weekPlan }) {
  const pantryNames = new Set(pantryItems.map((item) => normalize(item.name)).filter(Boolean));
  const plannedIds = new Set(Object.values(weekPlan ?? {}).flat());
  const priorityNames = new Set(pantryPriorityItems.slice(0, 5).map((item) => item.normalizedName));
  return recipes
    .map((recipe) => {
      const ingredientNames = recipe.ingredients.map((item) => normalize(item.name));
      const matched = ingredientNames.filter((name) => pantryNames.has(name));
      const priorityMatched = matched.filter((name) => priorityNames.has(name));
      const score = matched.length * 10 + priorityMatched.length * 18 + (plannedIds.has(recipe.id) ? 10 : 0);
      return {
        recipe,
        matched,
        priorityMatched,
        score,
        planned: plannedIds.has(recipe.id),
      };
    })
    .filter((item) => item.matched.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function buildPantryNote(item, state, daysUntilExpiry) {
  if (state === "expired") return "日期已过，按实际状态确认";
  if (state === "soon") return daysUntilExpiry === 0 ? "今天到提醒日，优先处理" : `${daysUntilExpiry} 天内优先用掉`;
  if (item.expiresOn) return `${daysUntilExpiry} 天后到提醒日`;
  return "未填提醒日期，可匹配菜谱但不参与临期排序";
}

function isVegetableRecipe(recipe) {
  return recipe.categories.some((category) => ["蔬菜", "素菜", "清爽", "汤"].includes(category));
}

function isProteinRecipe(recipe) {
  return recipe.categories.some((category) => ["肉类", "蛋类", "豆制品", "海鲜"].includes(category));
}

function getDaysUntilExpiry(expiresOn) {
  if (!expiresOn) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(`${expiresOn}T00:00:00`);
  return Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000);
}

function getExpiryStateFromDays(daysUntilExpiry, expiresOn) {
  if (!expiresOn) return "none";
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 3) return "soon";
  return "fresh";
}

function formatMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatNumber(value) {
  return Math.max(0, Math.round(value * 10) / 10);
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
