import { buildMealTimeline, downgradeMealPlan, getCertifiedRecipe, remainingTimerSeconds } from "./mealExecution.js";

const runStatusRank = { planned: 0, cooking: 1, abandoned: 2, completed: 3 };

export function createLocalMealRun({
  id,
  householdId = "guest",
  dateKey,
  effortTier,
  recipeIds,
  readyStaple = "",
  now = new Date().toISOString(),
} = {}) {
  const normalizedDateKey = normalizeDateKey(dateKey || now.slice(0, 10));
  const normalizedRecipeIds = normalizeCertifiedRecipeIds(recipeIds);
  normalizeEffortTier(effortTier);
  return {
    id: id || createLocalId(),
    householdId: householdId || "guest",
    dateKey: normalizedDateKey,
    mealSlot: "dinner",
    effortTier,
    recipeIds: normalizedRecipeIds,
    recipeSnapshot: normalizedRecipeIds.map((recipeId) => {
      const recipe = getCertifiedRecipe(recipeId);
      return { id: recipe.id, name: recipe.name, cookAssist: structuredClone(recipe.cookAssist) };
    }),
    timelineVersion: 1,
    timeline: null,
    currentStepId: "",
    timerEndsAt: "",
    readyStaple,
    status: "planned",
    abandonReason: "",
    feedback: [],
    downgrades: [],
    localOnly: true,
    syncStatus: "local",
    createdBy: "guest",
    startedBy: "",
    completedBy: "",
    createdAt: normalizeIsoDate(now),
    updatedAt: normalizeIsoDate(now),
    startedAt: "",
    completedAt: "",
    abandonedAt: "",
  };
}

export function downgradeLocalMealRun(run, action, { now = new Date().toISOString(), userId = "guest" } = {}) {
  if (!run?.id || !["planned", "cooking"].includes(run.status)) {
    throw mealRunError("meal_run_transition_invalid", "Only a planned or active dinner can be simplified.");
  }
  const changedAt = normalizeIsoDate(now);
  const result = downgradeMealPlan(run.recipeIds, action);
  const next = structuredClone(run);
  const previousRecipeIds = [...next.recipeIds];
  next.recipeIds = result.recipeIds;
  next.readyStaple = result.readyStaple || next.readyStaple || "";
  next.recipeSnapshot = next.recipeIds.map((recipeId) => {
    const recipe = getCertifiedRecipe(recipeId);
    return { id: recipe.id, name: recipe.name, cookAssist: structuredClone(recipe.cookAssist) };
  });
  next.downgrades = [...(next.downgrades ?? []), {
    action,
    previousRecipeIds,
    recipeIds: [...next.recipeIds],
    changedBy: userId,
    changedAt,
  }];
  if (next.status === "cooking") {
    next.timeline = buildMealTimeline(next.recipeIds, { startedAt: changedAt });
    next.currentStepId = next.timeline.steps[0]?.id || "";
    next.timerEndsAt = next.timeline.steps[0]?.attention === "passive" ? next.timeline.steps[0].endsAt : "";
  }
  next.updatedAt = changedAt;
  return next;
}

export function transitionLocalMealRun(run, action, payload = {}) {
  if (!run?.id) throw mealRunError("meal_run_invalid", "A meal run is required.");
  const next = structuredClone(run);
  const now = normalizeIsoDate(payload.now || new Date().toISOString());

  if (action === "start") {
    if (next.status === "cooking") return next;
    if (next.status !== "planned") throw mealRunError("meal_run_transition_invalid", "Only a planned dinner can start.");
    next.status = "cooking";
    next.timeline = buildMealTimeline(next.recipeIds, { startedAt: now });
    next.currentStepId = next.timeline.steps[0]?.id || "";
    next.timerEndsAt = next.timeline.steps[0]?.attention === "passive" ? next.timeline.steps[0].endsAt : "";
    next.startedBy = payload.userId || "guest";
    next.startedAt = now;
    next.updatedAt = now;
    return next;
  }

  if (action === "progress") {
    if (next.status !== "cooking") throw mealRunError("meal_run_transition_invalid", "Progress requires an active dinner.");
    const step = next.timeline?.steps?.find((candidate) => candidate.id === payload.currentStepId);
    if (!step) throw mealRunError("meal_step_invalid", "The step does not belong to this dinner.");
    next.currentStepId = step.id;
    next.timerEndsAt = payload.timerEndsAt ? normalizeIsoDate(payload.timerEndsAt) : "";
    next.updatedAt = now;
    return next;
  }

  if (action === "complete") {
    if (next.status === "completed") return next;
    if (next.status !== "cooking") throw mealRunError("meal_run_transition_invalid", "Only an active dinner can be served.");
    next.status = "completed";
    next.completedBy = payload.userId || "guest";
    next.completedAt = now;
    next.timerEndsAt = "";
    next.updatedAt = now;
    return next;
  }

  if (action === "abandon") {
    if (next.status === "abandoned") return next;
    if (!["planned", "cooking"].includes(next.status)) throw mealRunError("meal_run_transition_invalid", "A completed dinner cannot be abandoned.");
    next.status = "abandoned";
    next.abandonReason = normalizeAbandonReason(payload.reason);
    next.abandonedAt = now;
    next.timerEndsAt = "";
    next.updatedAt = now;
    return next;
  }

  if (action === "feedback") {
    if (next.status !== "completed") throw mealRunError("meal_run_transition_invalid", "Feedback is available after serving.");
    const userId = payload.userId || "guest";
    const value = normalizeFeedback(payload.value);
    const existing = next.feedback.find((entry) => entry.userId === userId);
    if (existing) {
      existing.value = value;
      existing.updatedAt = now;
    } else {
      next.feedback.push({ userId, value, createdAt: now, updatedAt: now });
    }
    next.updatedAt = now;
    return next;
  }

  throw mealRunError("meal_run_action_invalid", "Unsupported meal run action.");
}

export function mergeLocalMealRun(localRun, remoteRun) {
  if (!localRun) return remoteRun ?? null;
  if (!remoteRun) return localRun;
  if (remoteRun.syncedFromLocalId === localRun.id || localRun.syncedToRemoteId === remoteRun.id) {
    return { ...structuredClone(remoteRun), localOnly: false, syncStatus: "synced" };
  }
  const localRank = runStatusRank[localRun.status] ?? -1;
  const remoteRank = runStatusRank[remoteRun.status] ?? -1;
  if (remoteRank > localRank) return { ...structuredClone(remoteRun), localOnly: false, syncStatus: "synced" };
  if (localRank > remoteRank) return localRun;
  return Date.parse(remoteRun.updatedAt || 0) >= Date.parse(localRun.updatedAt || 0)
    ? { ...structuredClone(remoteRun), localOnly: false, syncStatus: "synced" }
    : localRun;
}

export function remainingLocalTimerSeconds(run, now = new Date().toISOString()) {
  return run?.timerEndsAt ? remainingTimerSeconds(run.timerEndsAt, now) : 0;
}

export function completedMealsInWeek(runs, { householdId, weekStartDateKey } = {}) {
  const start = Date.parse(`${normalizeDateKey(weekStartDateKey)}T00:00:00.000Z`);
  const end = start + 7 * 24 * 60 * 60 * 1000;
  const counted = new Set();
  for (const run of Array.isArray(runs) ? runs : []) {
    if (run?.status !== "completed" || (householdId && run.householdId !== householdId)) continue;
    const date = Date.parse(`${run.dateKey}T00:00:00.000Z`);
    if (date < start || date >= end) continue;
    counted.add(run.syncedFromLocalId || run.id);
  }
  return counted.size;
}

function normalizeCertifiedRecipeIds(recipeIds) {
  const normalized = [...new Set((Array.isArray(recipeIds) ? recipeIds : []).filter(Boolean))];
  if (normalized.length === 0) throw mealRunError("meal_recipes_required", "Choose at least one recipe.");
  for (const recipeId of normalized) {
    if (!getCertifiedRecipe(recipeId)) throw mealRunError("recipe_not_certified", `${recipeId} is not certified.`);
  }
  return normalized;
}

function normalizeEffortTier(value) {
  if (["quick_15", "easy_30", "normal"].includes(value)) return value;
  throw mealRunError("effort_tier_invalid", "Unsupported effort tier.");
}

function normalizeDateKey(value) {
  const dateKey = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Number.isFinite(Date.parse(`${dateKey}T00:00:00.000Z`))) {
    throw mealRunError("date_key_invalid", "dateKey must use YYYY-MM-DD.");
  }
  return dateKey;
}

function normalizeIsoDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw mealRunError("date_invalid", "A valid date is required.");
  return date.toISOString();
}

function normalizeAbandonReason(value) {
  if (["too_much_effort", "missing_ingredients", "plans_changed", "cooking_failed"].includes(value)) return value;
  throw mealRunError("abandon_reason_invalid", "Unsupported abandon reason.");
}

function normalizeFeedback(value) {
  if (["want_again", "change_next_time", "too_much_effort"].includes(value)) return value;
  throw mealRunError("meal_feedback_invalid", "Unsupported meal feedback.");
}

function createLocalId() {
  return globalThis.crypto?.randomUUID?.() || `local-meal:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function mealRunError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
