const certifiedRecipes = require("../data/certified-recipes");

const recipesById = new Map(certifiedRecipes.map((recipe) => [recipe.id, recipe]));

function buildMealTimeline(recipeIds, { startedAt = new Date().toISOString() } = {}) {
  const normalizedRecipeIds = [...new Set((Array.isArray(recipeIds) ? recipeIds : []).filter(Boolean))];
  if (normalizedRecipeIds.length === 0) throw timelineError("meal_recipes_required");
  const recipes = normalizedRecipeIds.map((id) => {
    const recipe = recipesById.get(id);
    if (!recipe || recipe.cookAssist?.status !== "certified") throw timelineError("recipe_not_certified");
    return recipe;
  });
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) throw timelineError("invalid_started_at");

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
    if (ready.length === 0) throw timelineError("timeline_dependency_cycle");

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

function summarizeMealTimeline(timeline) {
  if (!timeline || !Array.isArray(timeline.steps) || !Number.isFinite(timeline.totalSeconds)) {
    throw timelineError("timeline_invalid");
  }
  const activeSeconds = timeline.steps
    .filter((step) => step.attention === "active")
    .reduce((total, step) => total + Number(step.durationSeconds || 0), 0);
  return {
    totalSeconds: timeline.totalSeconds,
    totalMinutes: Math.ceil(timeline.totalSeconds / 60),
    activeSeconds,
    activeMinutes: Math.ceil(activeSeconds / 60),
    cookware: [...timeline.cookware],
  };
}

function remainingSeconds(endsAt, now = new Date().toISOString()) {
  const remainingMs = Date.parse(endsAt) - Date.parse(now);
  if (!Number.isFinite(remainingMs)) return 0;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function createActualPassiveTimer(step, startedAt = new Date().toISOString()) {
  if (!step?.id || step.attention !== "passive" || !Number.isFinite(Number(step.durationSeconds)) || Number(step.durationSeconds) <= 0) {
    throw timelineError("passive_timer_step_invalid");
  }
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) throw timelineError("passive_timer_start_invalid");
  const canonicalStartedAt = new Date(startedAtMs).toISOString();
  return {
    stepId: step.id,
    startedAt: canonicalStartedAt,
    endsAt: new Date(startedAtMs + Number(step.durationSeconds) * 1000).toISOString(),
  };
}

function actualTimerFor(timers, stepId) {
  const timer = timers && typeof timers === "object" && !Array.isArray(timers) ? timers[stepId] : null;
  if (!timer || timer.stepId !== stepId || !Number.isFinite(Date.parse(timer.startedAt)) || !Number.isFinite(Date.parse(timer.endsAt))) {
    return null;
  }
  return timer;
}

function timelineStepIndex(timeline, stepId) {
  if (!Array.isArray(timeline?.steps)) return -1;
  return timeline.steps.findIndex((step) => step.id === stepId);
}

function nextTimelineStep(timeline, currentStepId) {
  const currentIndex = timelineStepIndex(timeline, currentStepId);
  if (currentIndex < 0) return timeline?.steps?.[0] || null;
  return timeline.steps[currentIndex + 1] || null;
}

function nextAvailableTimelineStep(timeline, currentStepId, timers = {}, now = new Date().toISOString()) {
  const candidate = nextTimelineStep(timeline, currentStepId);
  if (!candidate) return null;
  const currentIndex = timelineStepIndex(timeline, currentStepId);
  const progressedSteps = timeline.steps.slice(0, currentIndex + 1);
  const stepById = new Map(timeline.steps.map((step) => [step.id, step]));
  if (progressedSteps.some((step) => step.attention === "passive" && !actualTimerFor(timers, step.id))) {
    return null;
  }
  const passiveDependencyRunning = candidate.dependsOn.some((dependencyId) => {
    const dependency = stepById.get(dependencyId);
    return dependency?.attention === "passive"
      && progressedSteps.some((step) => step.id === dependencyId)
      && remainingSeconds(actualTimerFor(timers, dependencyId)?.endsAt, now) > 0;
  });
  if (passiveDependencyRunning) return null;
  const candidateResources = new Set(candidate.resources || []);
  const resourceBusy = progressedSteps.some((step) => (
    step.attention === "passive"
    && remainingSeconds(actualTimerFor(timers, step.id)?.endsAt, now) > 0
    && (step.resources || []).some((resource) => candidateResources.has(resource))
  ));
  return resourceBusy ? null : candidate;
}

function runningPassiveTimers(timeline, currentStepId, timers = {}, now = new Date().toISOString()) {
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
        remainingSeconds: remainingSeconds(timer.endsAt, now),
      } : null;
    })
    .filter(Boolean)
    .filter((step) => step.remainingSeconds > 0);
}

function timelineError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = {
  buildMealTimeline,
  createActualPassiveTimer,
  nextAvailableTimelineStep,
  nextTimelineStep,
  remainingSeconds,
  runningPassiveTimers,
  summarizeMealTimeline,
  timelineStepIndex,
};
