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

export function createActualPassiveTimer(step, startedAt = new Date().toISOString()) {
  if (!step?.id || step.attention !== "passive" || !Number.isFinite(Number(step.durationSeconds)) || Number(step.durationSeconds) <= 0) {
    throw executionError("passive_timer_step_invalid", "Only a certified passive step may start a timer.");
  }
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) throw executionError("passive_timer_start_invalid", "Timer start must be a valid date.");
  const canonicalStartedAt = new Date(startedAtMs).toISOString();
  return {
    stepId: step.id,
    startedAt: canonicalStartedAt,
    endsAt: new Date(startedAtMs + Number(step.durationSeconds) * 1000).toISOString(),
  };
}

export function nextAvailableMealTimelineStep(timeline, currentStepId, timers = {}, now = new Date().toISOString()) {
  const currentIndex = timelineStepIndex(timeline, currentStepId);
  if (currentIndex < 0) return null;
  const candidate = timeline.steps[currentIndex + 1] || null;
  if (!candidate) return null;
  const progressed = timeline.steps.slice(0, currentIndex + 1);
  const stepById = new Map(timeline.steps.map((step) => [step.id, step]));
  if (progressed.some((step) => step.attention === "passive" && !actualTimerFor(timers, step.id))) return null;
  const dependencyRunning = (candidate.dependsOn || []).some((dependencyId) => {
    const dependency = stepById.get(dependencyId);
    const timer = actualTimerFor(timers, dependencyId);
    return dependency?.attention === "passive" && (!timer || remainingTimerSeconds(timer.endsAt, now) > 0);
  });
  if (dependencyRunning) return null;
  const candidateResources = new Set(candidate.resources || []);
  const resourceBusy = progressed.some((step) => {
    const timer = actualTimerFor(timers, step.id);
    return step.attention === "passive"
      && timer
      && remainingTimerSeconds(timer.endsAt, now) > 0
      && (step.resources || []).some((resource) => candidateResources.has(resource));
  });
  return resourceBusy ? null : candidate;
}

export function runningMealTimelineTimers(timeline, currentStepId, timers = {}, now = new Date().toISOString()) {
  const currentIndex = timelineStepIndex(timeline, currentStepId);
  if (currentIndex < 0) return [];
  return timeline.steps
    .slice(0, currentIndex + 1)
    .filter((step) => step.attention === "passive")
    .map((step) => {
      const timer = actualTimerFor(timers, step.id);
      return timer ? {
        ...step,
        startedAt: timer.startedAt,
        endsAt: timer.endsAt,
        remainingSeconds: remainingTimerSeconds(timer.endsAt, now),
      } : null;
    })
    .filter((step) => step?.remainingSeconds > 0);
}

function timelineStepIndex(timeline, stepId) {
  return Array.isArray(timeline?.steps)
    ? timeline.steps.findIndex((step) => step.id === stepId)
    : -1;
}

function actualTimerFor(timers, stepId) {
  const timer = timers && typeof timers === "object" && !Array.isArray(timers) ? timers[stepId] : null;
  return timer?.stepId === stepId
    && Number.isFinite(Date.parse(timer.startedAt))
    && Number.isFinite(Date.parse(timer.endsAt))
    ? timer
    : null;
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
      const phase = index === 0 ? "prep" : index === recipe.steps.length - 1 ? "finish" : "cook";
      const delegatable = phase === "prep" && !passiveSteps.has(index);
      return {
        id,
        index,
        text,
        phase,
        delegatable,
        taskLabel: delegatable ? controlledPrepTaskLabel(text) : "",
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

function controlledPrepTaskLabel(text) {
  const action = String(text || "").trim().replace(/[。！!]+$/, "").slice(0, 56);
  return action ? `帮忙${action}`.slice(0, 64) : "";
}

function executionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
