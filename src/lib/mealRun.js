import {
  buildMealTimeline,
  createActualPassiveTimer,
  downgradeMealPlan,
  getCertifiedRecipe,
  nextAvailableMealTimelineStep,
  remainingTimerSeconds,
  runningMealTimelineTimers,
} from "./mealExecution.js";

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
    timers: {},
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
  const recipeChanged = !sameStringArray(previousRecipeIds, next.recipeIds);
  next.timelineVersion = Number(next.timelineVersion || 1) + 1;
  if (next.status === "cooking" && recipeChanged) {
    next.timeline = buildMealTimeline(next.recipeIds, { startedAt: changedAt });
    next.currentStepId = next.timeline.steps[0]?.id || "";
    next.timers = {};
    if (next.timeline.steps[0]?.attention === "passive") {
      const timer = createActualPassiveTimer(next.timeline.steps[0], changedAt);
      next.timers[timer.stepId] = timer;
      next.timerEndsAt = timer.endsAt;
    } else {
      next.timerEndsAt = "";
    }
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
    next.timers = {};
    if (next.timeline.steps[0]?.attention === "passive") {
      const timer = createActualPassiveTimer(next.timeline.steps[0], now);
      next.timers[timer.stepId] = timer;
      next.timerEndsAt = timer.endsAt;
    } else {
      next.timerEndsAt = "";
    }
    next.startedBy = payload.userId || "guest";
    next.startedAt = now;
    next.updatedAt = now;
    return next;
  }

  if (action === "progress") {
    if (next.status !== "cooking") throw mealRunError("meal_run_transition_invalid", "Progress requires an active dinner.");
    const expectedTimelineVersion = payload.timelineVersion === undefined
      ? Number(next.timelineVersion || 1)
      : Number(payload.timelineVersion);
    if (
      !Number.isInteger(expectedTimelineVersion)
      || expectedTimelineVersion !== Number(next.timelineVersion || 1)
    ) {
      throw mealRunError("meal_timeline_version_conflict", "The cooking timeline changed.");
    }
    const step = next.timeline?.steps?.find((candidate) => candidate.id === payload.currentStepId);
    if (!step) throw mealRunError("meal_step_invalid", "The step does not belong to this dinner.");
    const currentIndex = next.timeline.steps.findIndex((candidate) => candidate.id === next.currentStepId);
    const incomingIndex = next.timeline.steps.findIndex((candidate) => candidate.id === step.id);
    const timer = payload.timer ? normalizeActualTimer(payload.timer, next.timeline) : null;
    if (timer && timer.stepId !== step.id) throw mealRunError("meal_timer_step_invalid", "Timer and step must match.");
    if (incomingIndex > currentIndex) {
      const available = nextAvailableMealTimelineStep(next.timeline, next.currentStepId, next.timers, now);
      if (available?.id !== step.id) throw mealRunError("meal_step_blocked", "This step is still waiting for a dependency or cookware.");
      if (step.attention === "passive" && !timer && !next.timers?.[step.id]) {
        throw mealRunError("meal_timer_step_invalid", "A passive step requires its actual timer.");
      }
    }
    next.timers = mergeTimerMaps(next.timers, timer ? { [timer.stepId]: timer } : {});
    if (incomingIndex > currentIndex) next.currentStepId = step.id;
    next.timerEndsAt = next.timers[timer?.stepId]?.endsAt || next.timerEndsAt || "";
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
  const sameRun = localRun.id === remoteRun.id
    || remoteRun.syncedFromLocalId === localRun.id
    || localRun.syncedToRemoteId === remoteRun.id;
  if (sameRun) {
    const localTimelineVersion = Number(localRun.timelineVersion || 1);
    const remoteTimelineVersion = Number(remoteRun.timelineVersion || 1);
    if (remoteTimelineVersion > localTimelineVersion) {
      return { ...structuredClone(remoteRun), localOnly: false, syncStatus: "synced" };
    }
    if (localTimelineVersion > remoteTimelineVersion) return localRun;
  }
  const timers = mergeTimerMaps(remoteRun.timers, localRun.timers);
  if (remoteRun.syncedFromLocalId === localRun.id || localRun.syncedToRemoteId === remoteRun.id) {
    return { ...structuredClone(remoteRun), timers, localOnly: false, syncStatus: "synced" };
  }
  const localRank = runStatusRank[localRun.status] ?? -1;
  const remoteRank = runStatusRank[remoteRun.status] ?? -1;
  if (remoteRank > localRank) return { ...structuredClone(remoteRun), timers, localOnly: false, syncStatus: "synced" };
  if (localRank > remoteRank) return { ...localRun, timers };
  return Date.parse(remoteRun.updatedAt || 0) >= Date.parse(localRun.updatedAt || 0)
    ? { ...structuredClone(remoteRun), timers, localOnly: false, syncStatus: "synced" }
    : { ...localRun, timers };
}

export function isCompletedGuestRunEquivalent(guestRun, remoteRun, ownerUserId) {
  if (guestRun?.status !== "completed" || remoteRun?.status !== "completed") return false;
  const guestStepIds = timelineStepIds(guestRun.timeline);
  const remoteStepIds = timelineStepIds(remoteRun.timeline);
  if (
    !guestStepIds.length
    || guestStepIds.length !== remoteStepIds.length
    || guestStepIds.some((stepId, index) => stepId !== remoteStepIds[index])
  ) return false;
  const guestIndex = guestStepIds.indexOf(guestRun.currentStepId);
  const remoteIndex = remoteStepIds.indexOf(remoteRun.currentStepId);
  if (guestIndex < 0 || remoteIndex < guestIndex) return false;
  const guestTimers = normalizeTimerMap(guestRun.timers, guestRun.timeline);
  const remoteTimers = normalizeTimerMap(remoteRun.timers, remoteRun.timeline);
  if (Object.entries(guestTimers).some(([stepId, timer]) => !sameTimer(timer, remoteTimers[stepId]))) {
    return false;
  }
  const guestFeedbackValue = [...(guestRun.feedback || [])]
    .reverse()
    .find((entry) => ["want_again", "change_it", "too_hard"].includes(entry?.value))?.value;
  return !guestFeedbackValue || (remoteRun.feedback || []).some((entry) => (
    entry.userId === ownerUserId && entry.value === guestFeedbackValue
  ));
}

export function remainingLocalTimerSeconds(run, now = new Date().toISOString()) {
  const timer = run?.timers?.[run.currentStepId];
  return timer ? remainingTimerSeconds(timer.endsAt, now) : 0;
}

export function runningLocalMealTimers(run, now = new Date().toISOString()) {
  return runningMealTimelineTimers(run?.timeline, run?.currentStepId, run?.timers, now);
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

function normalizeActualTimer(timer, timeline) {
  if (!timer || typeof timer !== "object" || Array.isArray(timer)) {
    throw mealRunError("meal_timer_step_invalid", "A passive timer is required.");
  }
  const step = timeline?.steps?.find((candidate) => candidate.id === timer.stepId);
  if (!step || step.attention !== "passive") {
    throw mealRunError("meal_timer_step_invalid", "Timer must belong to a passive step.");
  }
  const startedAt = normalizeCanonicalIsoDate(timer.startedAt);
  const endsAt = normalizeCanonicalIsoDate(timer.endsAt);
  if (Date.parse(endsAt) - Date.parse(startedAt) !== Number(step.durationSeconds) * 1000) {
    throw mealRunError("meal_timer_duration_invalid", "Timer duration must match the certified step.");
  }
  return { stepId: step.id, startedAt, endsAt };
}

function normalizeCanonicalIsoDate(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw mealRunError("meal_timer_time_invalid", "Timer timestamp must use canonical ISO format.");
  }
  return value;
}

function mergeTimerMaps(primary, fallback) {
  const merged = { ...(primary || {}) };
  for (const [stepId, timer] of Object.entries(fallback || {})) {
    if (!merged[stepId]) merged[stepId] = timer;
  }
  return merged;
}

function timelineStepIds(timeline) {
  return Array.isArray(timeline?.steps)
    ? timeline.steps.map((step) => String(step?.id || "").trim()).filter(Boolean)
    : [];
}

function normalizeTimerMap(timers, timeline) {
  const result = {};
  for (const [stepId, timer] of Object.entries(timers || {})) {
    try {
      const normalized = normalizeActualTimer(timer, timeline);
      if (normalized.stepId === stepId) result[stepId] = normalized;
    } catch {
      // Invalid legacy timers never count as successfully synchronized.
    }
  }
  return result;
}

function sameTimer(left, right) {
  return Boolean(left && right
    && left.stepId === right.stepId
    && left.startedAt === right.startedAt
    && left.endsAt === right.endsAt);
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeAbandonReason(value) {
  if (["too_much_effort", "missing_ingredients", "plans_changed", "cooking_failed"].includes(value)) return value;
  throw mealRunError("abandon_reason_invalid", "Unsupported abandon reason.");
}

function normalizeFeedback(value) {
  if (value === "want_again") return "want_again";
  if (["change_it", "change_next_time"].includes(value)) return "change_it";
  if (["too_hard", "too_much_effort"].includes(value)) return "too_hard";
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
