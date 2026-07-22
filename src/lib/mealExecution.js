import rawRecipes from "../../data/recipes.json" with { type: "json" };
import cookAssistCatalog from "../../data/cook-assist.json" with { type: "json" };

const rawRecipeById = new Map(rawRecipes.map((recipe) => [recipe.id, recipe]));
const catalogById = new Map(cookAssistCatalog.map((entry) => [entry.id, entry]));

export const effortTiers = Object.freeze([
  { id: "quick_15", label: "15 分钟·只求开饭", maxMinutes: 15 },
  { id: "easy_30", label: "30 分钟·简单做", maxMinutes: 30 },
  { id: "normal", label: "正常做·今天有精力", maxMinutes: null },
]);

export function attachCookAssist(recipe) {
  if (!recipe) return null;
  const entry = catalogById.get(recipe.id);
  if (!entry) return recipe;
  return {
    ...recipe,
    cookAssist: buildCookAssist(entry, recipe),
  };
}

export function getCertifiedRecipe(id) {
  const recipe = rawRecipeById.get(id);
  const entry = catalogById.get(id);
  if (!recipe || !entry) return null;
  return attachCookAssist(recipe);
}

export function getCertifiedRecipesForTier(tier) {
  return cookAssistCatalog
    .filter((entry) => entry.effortTier === tier)
    .map((entry) => getCertifiedRecipe(entry.id));
}

export function buildMealTimeline(recipeIds, { startedAt = new Date().toISOString() } = {}) {
  const normalizedRecipeIds = [...new Set((Array.isArray(recipeIds) ? recipeIds : []).filter(Boolean))];
  if (normalizedRecipeIds.length === 0) throw executionError("meal_recipes_required", "Choose at least one certified recipe.");
  const recipes = normalizedRecipeIds.map((id) => {
    const recipe = getCertifiedRecipe(id);
    if (!recipe) throw executionError("recipe_not_certified", `${id} is not cook-assist certified.`);
    return recipe;
  });
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) throw executionError("invalid_started_at", "startedAt must be an ISO date.");

  const pending = recipes.flatMap((recipe) => recipe.cookAssist.steps.map((step) => ({
    ...step,
    recipeId: recipe.id,
    recipeName: recipe.name,
  })));
  const scheduled = new Map();
  const resourceAvailableAt = new Map();
  let activeAvailableAt = 0;
  const result = [];

  while (pending.length > 0) {
    const ready = pending
      .filter((step) => step.dependsOn.every((dependency) => scheduled.has(dependency)))
      .map((step) => {
        const dependencyEnd = Math.max(0, ...step.dependsOn.map((dependency) => scheduled.get(dependency).endOffsetSeconds));
        const resourceEnd = Math.max(0, ...step.resources.map((resource) => resourceAvailableAt.get(resource) ?? 0));
        const startOffsetSeconds = Math.max(dependencyEnd, resourceEnd, step.attention === "active" ? activeAvailableAt : 0);
        return { step, startOffsetSeconds };
      })
      .sort((left, right) => (
        left.startOffsetSeconds - right.startOffsetSeconds
        || Number(left.step.attention === "active") - Number(right.step.attention === "active")
        || left.step.recipeId.localeCompare(right.step.recipeId)
        || left.step.index - right.step.index
      ));
    if (ready.length === 0) throw executionError("timeline_dependency_cycle", "Recipe steps contain a dependency cycle.");

    const { step, startOffsetSeconds } = ready[0];
    const endOffsetSeconds = startOffsetSeconds + step.durationSeconds;
    const scheduledStep = {
      ...step,
      startOffsetSeconds,
      endOffsetSeconds,
      startsAt: new Date(startedAtMs + startOffsetSeconds * 1000).toISOString(),
      endsAt: new Date(startedAtMs + endOffsetSeconds * 1000).toISOString(),
    };
    scheduled.set(step.id, scheduledStep);
    result.push(scheduledStep);
    for (const resource of step.resources) resourceAvailableAt.set(resource, endOffsetSeconds);
    if (step.attention === "active") activeAvailableAt = endOffsetSeconds;
    pending.splice(pending.findIndex((candidate) => candidate.id === step.id), 1);
  }

  result.sort((left, right) => (
    left.startOffsetSeconds - right.startOffsetSeconds
    || Number(left.attention === "active") - Number(right.attention === "active")
    || left.id.localeCompare(right.id)
  ));
  const totalSeconds = Math.max(...result.map((step) => step.endOffsetSeconds));
  return {
    version: 1,
    recipeIds: normalizedRecipeIds,
    startedAt: new Date(startedAtMs).toISOString(),
    endsAt: new Date(startedAtMs + totalSeconds * 1000).toISOString(),
    totalSeconds,
    cookware: [...new Set(recipes.flatMap((recipe) => recipe.cookAssist.cookware))],
    steps: result,
  };
}

export function remainingTimerSeconds(endsAt, now = new Date().toISOString()) {
  const remainingMs = Date.parse(endsAt) - Date.parse(now);
  if (!Number.isFinite(remainingMs)) return 0;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function downgradeMealPlan(recipeIds, action) {
  const normalizedRecipeIds = [...new Set((Array.isArray(recipeIds) ? recipeIds : []).filter(Boolean))];
  if (normalizedRecipeIds.length === 0) throw executionError("meal_recipes_required", "Choose at least one certified recipe.");
  if (action === "remove_optional_side") {
    return { recipeIds: normalizedRecipeIds.slice(0, 1), readyStaple: "" };
  }
  if (action === "lower_effort_recipe") {
    return {
      recipeIds: [...new Set(normalizedRecipeIds.map((id) => {
        const recipe = getCertifiedRecipe(id);
        if (!recipe) throw executionError("recipe_not_certified", `${id} is not cook-assist certified.`);
        return recipe.cookAssist.downgradeRecipeIds[0] || id;
      }))],
      readyStaple: "",
    };
  }
  if (action === "ready_staple") {
    const staple = normalizedRecipeIds.map((id) => getCertifiedRecipe(id)?.cookAssist.readyStaple).find(Boolean) || "即食米饭";
    return { recipeIds: normalizedRecipeIds, readyStaple: staple };
  }
  throw executionError("invalid_downgrade_action", "Unsupported downgrade action.");
}

function buildCookAssist(entry, recipe) {
  const passiveSteps = new Set(entry.passiveStepIndexes ?? []);
  return {
    status: "certified",
    effortTier: entry.effortTier,
    activeMinutes: entry.activeMinutes,
    totalMinutes: entry.totalMinutes,
    cookware: [...entry.cookware],
    cleanupLevel: entry.cleanupLevel,
    substitutions: structuredClone(entry.substitutions ?? []),
    downgradeRecipeIds: [...(entry.downgradeRecipeIds ?? [])],
    readyStaple: entry.readyStaple || "即食米饭",
    steps: recipe.steps.map((text, index) => {
      const id = `${recipe.id}:step:${index + 1}`;
      return {
        id,
        index,
        text,
        phase: index === 0 ? "prep" : index === recipe.steps.length - 1 ? "finish" : "cook",
        durationSeconds: entry.stepDurationsSeconds[index],
        attention: passiveSteps.has(index) ? "passive" : "active",
        resources: [...(entry.stepResources[index] ?? [])],
        dependsOn: index === 0 ? [] : [`${recipe.id}:step:${index}`],
        timerLabel: passiveSteps.has(index) ? `${recipe.name} · ${Math.ceil(entry.stepDurationsSeconds[index] / 60)} 分钟` : "",
        rescueTip: index === recipe.steps.length - 1 ? entry.rescueTip : "",
      };
    }),
  };
}

function executionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
