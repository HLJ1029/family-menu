const certifiedRecipes = require("../data/certified-recipes");
const { requestHumi } = require("./request");
const { buildMealTimeline, summarizeMealTimeline } = require("./meal-timeline");
const { readMealMutationResult } = require("./offline-queue");

const GUEST_RUN_PREFIX = "humi:meal-run:guest:v1:";
const REMOTE_RUN_PREFIX = "humi:meal-run:remote:v1:";
const MERGED_RUN_PREFIX = "humi:meal-run:merged:v1:";
const OPTIMISTIC_PROGRESS_PREFIX = "humi:meal-run:optimistic-progress:v1:";
const ACTIVE_STATUSES = new Set(["planned", "cooking"]);
const RUN_STATUSES = new Set(["planned", "cooking", "completed", "abandoned"]);
const EFFORT_TIERS = new Set(["quick_15", "easy_30", "normal"]);
const recipesById = new Map(certifiedRecipes.map((recipe) => [recipe.id, recipe]));
const ABANDON_REASONS = new Set(["too_much_effort", "missing_ingredients", "plans_changed", "cooking_failed"]);
const FEEDBACK_VALUES = new Set(["want_again", "change_it", "too_hard"]);
const DOWNGRADE_ACTIONS = new Set(["remove_optional_side", "lower_effort_recipe", "ready_staple"]);

async function createMealRun({
  bootstrap = {},
  recommendation,
  effortTier,
  dateKey = formatDinnerDateKey(),
  stateVersion = "",
} = {}) {
  const normalized = normalizeCreateInput({ bootstrap, recommendation, effortTier, dateKey });
  if (!normalized.householdId) return createGuestMealRun(normalized);
  if (!canReplaceHouseholdPlan(bootstrap, normalized.ownerUserId)) {
    throw codedError("forbidden");
  }
  const idempotencyKey = `recommendation:${normalized.recommendationId}`;
  const result = await requestHumi({
    path: "/meal-runs",
    method: "POST",
    data: {
      householdId: normalized.householdId,
      dateKey: normalized.dateKey,
      mealSlot: "dinner",
      effortTier: normalized.effortTier,
      recipeIds: normalized.recipeIds,
      idempotencyKey,
    },
    idempotencyKey,
    stateVersion,
    expectedUserId: normalized.ownerUserId,
  });
  const mealRun = normalizeMealRun(result?.mealRun);
  if (!mealRun) throw codedError("meal_run_response_invalid");
  writeRemoteMealRun(mealRun, normalized.ownerUserId);
  return mealRun;
}

async function loadCurrentMealRun({
  bootstrap = {},
  dateKey = formatDinnerDateKey(),
  allowCache = true,
} = {}) {
  const ownerUserId = bootstrapUserId(bootstrap);
  const householdId = clean(bootstrap.activeHouseholdId);
  if (!ownerUserId || !householdId) return readActiveGuestMealRun({ ownerUserId, dateKey });
  try {
    const result = await requestHumi({
      path: `/meal-runs/current?householdId=${encodeURIComponent(householdId)}&dateKey=${encodeURIComponent(dateKey)}&mealSlot=dinner`,
      expectedUserId: ownerUserId,
    });
    const mealRun = normalizeMealRun(result?.mealRun);
    if (mealRun) writeRemoteMealRun(mealRun, ownerUserId);
    else wx.removeStorageSync(remoteRunKey(ownerUserId, householdId, dateKey));
    return mealRun;
  } catch (error) {
    if (!allowCache || !isNetworkError(error)) throw error;
    const cached = normalizeMealRun(wx.getStorageSync(remoteRunKey(ownerUserId, householdId, dateKey)));
    return cached ? { ...cached, cacheState: "cached" } : null;
  }
}

async function mergeActiveGuestMealRun({
  bootstrap = {},
  dateKey = formatDinnerDateKey(),
} = {}) {
  const ownerUserId = bootstrapUserId(bootstrap);
  const householdId = clean(bootstrap.activeHouseholdId);
  if (!ownerUserId || !householdId) return { merged: false, reason: "no_household", mealRun: null, guestRun: null };
  const guestRun = readActiveGuestMealRun({ ownerUserId, dateKey });
  if (!guestRun || !ACTIVE_STATUSES.has(guestRun.status)) {
    return { merged: false, reason: "no_guest_run", mealRun: null, guestRun: null };
  }
  if (!canReplaceHouseholdPlan(bootstrap, ownerUserId)) {
    return { merged: false, reason: "owner_required", mealRun: bootstrap.currentMealRun || null, guestRun };
  }

  let remote;
  try {
    remote = await loadCurrentMealRun({ bootstrap, dateKey, allowCache: false });
  } catch (error) {
    if (isNetworkError(error)) return { merged: false, reason: "offline", mealRun: null, guestRun };
    throw error;
  }
  if (remote && ["cooking", "completed"].includes(remote.status) && !isSyncedGuestRun(remote, guestRun)) {
    return { merged: false, reason: "remote_locked", mealRun: remote, guestRun };
  }

  const idempotencyKey = `guest-merge:${guestRun.id}`;
  try {
    if (!isSyncedGuestRun(remote, guestRun)) {
      const result = await requestHumi({
        path: "/meal-runs",
        method: "POST",
        data: {
          householdId,
          dateKey,
          mealSlot: "dinner",
          effortTier: guestRun.effortTier,
          recipeIds: guestRun.recipeIds,
          readyStaple: guestRun.readyStaple || "",
          syncedFromLocalId: guestRun.id,
          idempotencyKey,
        },
        idempotencyKey,
        expectedUserId: ownerUserId,
      });
      remote = normalizeMealRun(result?.mealRun);
      if (!remote) throw codedError("meal_run_response_invalid");
      writeRemoteMealRun(remote, ownerUserId);
    }
    return await migrateGuestRunState({
      guestRun,
      remote,
      ownerUserId,
      dateKey,
    });
  } catch (error) {
    if (isNetworkError(error)) {
      return { merged: false, reason: "offline", mealRun: null, guestRun };
    }
    if (Number(error?.status) !== 409) throw error;
    let latest;
    try {
      latest = await loadCurrentMealRun({ bootstrap, dateKey, allowCache: false });
    } catch (latestError) {
      if (isNetworkError(latestError)) return { merged: false, reason: "offline", mealRun: null, guestRun };
      throw latestError;
    }
    if (isSyncedGuestRun(latest, guestRun)) {
      try {
        return await migrateGuestRunState({
          guestRun,
          remote: latest,
          ownerUserId,
          dateKey,
        });
      } catch (latestError) {
        if (isNetworkError(latestError)) return { merged: false, reason: "offline", mealRun: null, guestRun };
        throw latestError;
      }
    }
    return {
      merged: false,
      reason: latest && ["cooking", "completed"].includes(latest.status) ? "remote_locked" : "state_conflict",
      mealRun: latest,
      guestRun,
    };
  }
}

async function migrateGuestRunState({
  guestRun,
  remote,
  ownerUserId,
  dateKey,
}) {
  if (!isSyncedGuestRun(remote, guestRun)) {
    return { merged: false, reason: "state_conflict", mealRun: null, guestRun };
  }
  let mealRun = remote;
  if (guestRun.status === "cooking" && mealRun.status === "planned") {
    const idempotencyKey = `guest-merge:${guestRun.id}:start`;
    const result = await requestHumi({
      path: `/meal-runs/${encodeURIComponent(mealRun.id)}/start`,
      method: "POST",
      data: {},
      idempotencyKey,
      expectedUserId: ownerUserId,
    });
    mealRun = normalizeMealRun(result?.mealRun);
    if (!mealRun) throw codedError("meal_run_response_invalid");
    writeRemoteMealRun(mealRun, ownerUserId);
  }
  if (guestRun.status === "cooking" && mealRun.status === "cooking") {
    let progressComparison = compareCookingProgress(guestRun, mealRun);
    if (progressComparison === null) {
      return { merged: false, reason: "timeline_conflict", mealRun: null, guestRun };
    }
    if (progressComparison < 0) {
      const idempotencyKey = `guest-merge:${guestRun.id}:progress`;
      const result = await requestHumi({
        path: `/meal-runs/${encodeURIComponent(mealRun.id)}/progress`,
        method: "PUT",
        data: {
          currentStepId: guestRun.currentStepId,
          timerEndsAt: guestRun.timerEndsAt || "",
        },
        idempotencyKey,
        expectedUserId: ownerUserId,
      });
      mealRun = normalizeMealRun(result?.mealRun);
      if (!mealRun) throw codedError("meal_run_response_invalid");
      writeRemoteMealRun(mealRun, ownerUserId);
      progressComparison = compareCookingProgress(guestRun, mealRun);
    }
    if (progressComparison === null || progressComparison < 0) {
      return { merged: false, reason: "progress_conflict", mealRun: null, guestRun };
    }
  }
  const remoteIsEquivalent = guestRun.status === "planned"
    ? ["planned", "cooking", "completed"].includes(mealRun.status)
    : mealRun.status === "cooking" || mealRun.status === "completed";
  if (!remoteIsEquivalent) {
    return { merged: false, reason: "state_conflict", mealRun: null, guestRun };
  }
  writeRemoteMealRun(mealRun, ownerUserId);
  archiveMergedGuestRun(guestRun, mealRun.id);
  wx.removeStorageSync(guestRunKey(ownerUserId, dateKey));
  return { merged: true, reason: "merged", mealRun, guestRun };
}

function isSyncedGuestRun(remote, guestRun) {
  return Boolean(remote && guestRun && clean(remote.syncedFromLocalId) === clean(guestRun.id));
}

function compareCookingProgress(guestRun, remote) {
  const guestStepIds = timelineStepIds(guestRun.timeline);
  const remoteStepIds = timelineStepIds(remote.timeline);
  if (!guestStepIds.length || guestStepIds.length !== remoteStepIds.length) return null;
  if (guestStepIds.some((stepId, index) => stepId !== remoteStepIds[index])) return null;
  const guestIndex = guestStepIds.indexOf(clean(guestRun.currentStepId));
  const remoteIndex = remoteStepIds.indexOf(clean(remote.currentStepId));
  return guestIndex >= 0 && remoteIndex >= 0 ? remoteIndex - guestIndex : null;
}

function timelineStepIds(timeline) {
  if (!Array.isArray(timeline?.steps)) return [];
  return timeline.steps.map((step) => clean(step?.id)).filter(Boolean);
}

function createGuestMealRun(input) {
  const now = new Date().toISOString();
  const mealRun = {
    id: `guest:${createUuid()}`,
    householdId: "guest",
    ownerUserId: input.ownerUserId,
    dateKey: input.dateKey,
    mealSlot: "dinner",
    effortTier: input.effortTier,
    recommendationId: input.recommendationId,
    recipeIds: [...input.recipeIds],
    recipeSnapshot: input.recipeIds.map((recipeId) => clone(recipesById.get(recipeId))),
    timelineVersion: 1,
    timeline: null,
    currentStepId: "",
    timerEndsAt: "",
    readyStaple: input.recipeIds.map((recipeId) => recipesById.get(recipeId)?.cookAssist?.readyStaple).find(Boolean) || "即食米饭",
    status: "planned",
    localOnly: true,
    createdBy: input.ownerUserId || "guest",
    createdAt: now,
    updatedAt: now,
    startedAt: "",
    completedAt: "",
  };
  wx.setStorageSync(guestRunKey(input.ownerUserId, input.dateKey), mealRun);
  return mealRun;
}

function readActiveGuestMealRun({ ownerUserId = "", dateKey = formatDinnerDateKey() } = {}) {
  if (!clean(ownerUserId) || !validDateKey(dateKey)) return null;
  const mealRun = normalizeMealRun(wx.getStorageSync(guestRunKey(ownerUserId, dateKey)));
  if (!mealRun || mealRun.ownerUserId !== clean(ownerUserId) || mealRun.dateKey !== dateKey || !mealRun.localOnly) return null;
  return mealRun;
}

async function loadMealRunForCooking({
  bootstrap = {},
  mealRunId,
  dateKey = formatDinnerDateKey(),
  allowCache = true,
} = {}) {
  const safeMealRunId = normalizeMealRunId(mealRunId);
  const ownerUserId = bootstrapUserId(bootstrap);
  if (safeMealRunId.startsWith("guest:")) {
    const guestRun = readActiveGuestMealRun({ ownerUserId, dateKey });
    if (!guestRun || guestRun.id !== safeMealRunId) throw codedError("meal_run_not_found");
    return guestRun;
  }
  const replayedRun = normalizeMealRun(readMealMutationResult(safeMealRunId));
  if (replayedRun && ["completed", "abandoned"].includes(replayedRun.status)) {
    clearOptimisticMealProgress(replayedRun, ownerUserId);
    writeRemoteMealRun(replayedRun, ownerUserId);
    return replayedRun;
  }
  const mealRun = await loadCurrentMealRun({ bootstrap, dateKey, allowCache });
  const latestRun = chooseLatestMealRunSnapshot(mealRun, replayedRun);
  if (latestRun?.id === safeMealRunId) {
    writeRemoteMealRun(latestRun, ownerUserId);
    return applyOptimisticMealProgress(latestRun, ownerUserId);
  }
  const bootstrapRun = normalizeMealRun(bootstrap.currentMealRun);
  if (allowCache && bootstrapRun?.id === safeMealRunId) {
    return applyOptimisticMealProgress({ ...bootstrapRun, cacheState: "bootstrap" }, ownerUserId);
  }
  throw codedError("meal_run_not_found");
}

function chooseLatestMealRunSnapshot(remote, replayed) {
  if (!remote || !replayed || remote.id !== replayed.id) return remote || replayed || null;
  const ranks = { planned: 0, cooking: 1, abandoned: 2, completed: 2 };
  if ((ranks[replayed.status] ?? -1) > (ranks[remote.status] ?? -1)) return replayed;
  if ((ranks[replayed.status] ?? -1) < (ranks[remote.status] ?? -1)) return remote;
  if (remote.status !== "cooking" || replayed.status !== "cooking") {
    const remoteTime = Date.parse(remote.updatedAt || "");
    const replayedTime = Date.parse(replayed.updatedAt || "");
    return replayedTime >= remoteTime ? replayed : remote;
  }
  const remoteIds = timelineStepIds(remote.timeline);
  const replayedIds = timelineStepIds(replayed.timeline);
  if (
    remoteIds.length
    && remoteIds.length === replayedIds.length
    && remoteIds.every((id, index) => id === replayedIds[index])
  ) {
    return replayedIds.indexOf(replayed.currentStepId) >= remoteIds.indexOf(remote.currentStepId)
      ? replayed
      : remote;
  }
  return remote;
}

function writeOptimisticMealProgress(mealRun, {
  ownerUserId,
  currentStepId,
  timerEndsAt = "",
  now = new Date().toISOString(),
} = {}) {
  if (
    !mealRun?.id
    || mealRun.localOnly
    || mealRun.status !== "cooking"
    || !clean(ownerUserId)
    || timelineStepIndex(mealRun.timeline, currentStepId) < 0
  ) throw codedError("optimistic_progress_invalid");
  const overlay = {
    mealRunId: mealRun.id,
    ownerUserId: clean(ownerUserId),
    householdId: clean(mealRun.householdId),
    dateKey: mealRun.dateKey,
    timelineVersion: Number(mealRun.timelineVersion || mealRun.timeline?.version || 1),
    currentStepId,
    timerEndsAt: timerEndsAt || "",
    updatedAt: new Date(now).toISOString(),
  };
  wx.setStorageSync(optimisticProgressKey(overlay.ownerUserId, overlay.householdId, overlay.dateKey), overlay);
  return overlay;
}

function applyOptimisticMealProgress(mealRun, ownerUserId) {
  if (!mealRun?.id || mealRun.localOnly || !clean(ownerUserId) || !mealRun.householdId || !mealRun.dateKey) return mealRun;
  const key = optimisticProgressKey(ownerUserId, mealRun.householdId, mealRun.dateKey);
  const overlay = wx.getStorageSync(key);
  if (
    !overlay
    || overlay.ownerUserId !== clean(ownerUserId)
    || overlay.householdId !== mealRun.householdId
    || overlay.dateKey !== mealRun.dateKey
    || overlay.mealRunId !== mealRun.id
    || Number(overlay.timelineVersion) !== Number(mealRun.timelineVersion || mealRun.timeline?.version || 1)
  ) {
    if (overlay) wx.removeStorageSync(key);
    return mealRun;
  }
  const remoteIndex = timelineStepIndex(mealRun.timeline, mealRun.currentStepId);
  const optimisticIndex = timelineStepIndex(mealRun.timeline, overlay.currentStepId);
  if (optimisticIndex < 0 || remoteIndex >= optimisticIndex || mealRun.status !== "cooking") {
    wx.removeStorageSync(key);
    return mealRun;
  }
  return {
    ...mealRun,
    currentStepId: overlay.currentStepId,
    timerEndsAt: overlay.timerEndsAt,
    pendingSync: true,
  };
}

function clearOptimisticMealProgress(mealRun, ownerUserId) {
  if (!mealRun?.householdId || !mealRun?.dateKey || !clean(ownerUserId)) return;
  wx.removeStorageSync(optimisticProgressKey(ownerUserId, mealRun.householdId, mealRun.dateKey));
}

function optimisticProgressKey(ownerUserId, householdId, dateKey) {
  return `${OPTIMISTIC_PROGRESS_PREFIX}${encodeKey(ownerUserId)}:${encodeKey(householdId)}:${dateKey}`;
}

async function startCookingMealRun(mealRun, { bootstrap = {}, idempotencyKey, now = new Date().toISOString() } = {}) {
  assertMealRunWritable(mealRun, ["planned", "cooking"]);
  if (mealRun.status === "cooking") return mealRun;
  if (mealRun.localOnly) {
    const next = clone(mealRun);
    next.status = "cooking";
    next.timeline = buildMealTimeline(next.recipeIds, { startedAt: now });
    next.currentStepId = next.timeline.steps[0]?.id || "";
    next.timerEndsAt = next.timeline.steps[0]?.attention === "passive" ? next.timeline.steps[0].endsAt : "";
    next.startedBy = bootstrapUserId(bootstrap) || "guest";
    next.startedAt = now;
    next.updatedAt = now;
    writeGuestMealRun(next);
    return next;
  }
  return requestMealRunMutation(mealRun, "start", "POST", {}, {
    bootstrap,
    idempotencyKey,
  });
}

async function progressCookingMealRun(mealRun, {
  bootstrap = {},
  currentStepId,
  timerEndsAt = "",
  idempotencyKey,
  now = new Date().toISOString(),
} = {}) {
  assertMealRunWritable(mealRun, ["cooking"]);
  const stepIndex = timelineStepIndex(mealRun.timeline, currentStepId);
  if (stepIndex < 0) throw codedError("meal_step_invalid");
  const currentIndex = timelineStepIndex(mealRun.timeline, mealRun.currentStepId);
  if (currentIndex >= stepIndex) return mealRun;
  if (mealRun.localOnly) {
    const next = clone(mealRun);
    next.currentStepId = currentStepId;
    next.timerEndsAt = timerEndsAt || "";
    next.updatedAt = now;
    writeGuestMealRun(next);
    return next;
  }
  return requestMealRunMutation(mealRun, "progress", "PUT", {
    currentStepId,
    timerEndsAt,
  }, { bootstrap, idempotencyKey });
}

async function downgradeCookingMealRun(mealRun, action, {
  bootstrap = {},
  idempotencyKey,
  now = new Date().toISOString(),
} = {}) {
  assertMealRunWritable(mealRun, ["planned", "cooking"]);
  if (!DOWNGRADE_ACTIONS.has(action)) throw codedError("invalid_downgrade_action");
  if (!mealRun.localOnly) {
    return requestMealRunMutation(mealRun, "downgrade", "POST", { action }, {
      bootstrap,
      idempotencyKey,
    });
  }
  const next = clone(mealRun);
  const previousRecipeIds = [...next.recipeIds];
  if (action === "remove_optional_side") next.recipeIds = next.recipeIds.slice(0, 1);
  if (action === "lower_effort_recipe") {
    next.recipeIds = [...new Set(next.recipeIds.map((recipeId) => (
      recipesById.get(recipeId)?.cookAssist?.downgradeRecipeIds?.[0] || recipeId
    )))];
  }
  if (action === "ready_staple") {
    next.readyStaple = next.recipeIds
      .map((recipeId) => recipesById.get(recipeId)?.cookAssist?.readyStaple)
      .find(Boolean) || "即食米饭";
  }
  if (!next.recipeIds.every((recipeId) => recipesById.get(recipeId)?.cookAssist?.status === "certified")) {
    throw codedError("recipe_not_certified");
  }
  next.recipeSnapshot = next.recipeIds.map((recipeId) => clone(recipesById.get(recipeId)));
  next.downgrades = [...(next.downgrades || []), {
    action,
    previousRecipeIds,
    recipeIds: [...next.recipeIds],
    changedBy: bootstrapUserId(bootstrap) || "guest",
    changedAt: now,
  }];
  if (next.status === "cooking") {
    next.timeline = buildMealTimeline(next.recipeIds, { startedAt: now });
    next.currentStepId = next.timeline.steps[0]?.id || "";
    next.timerEndsAt = next.timeline.steps[0]?.attention === "passive" ? next.timeline.steps[0].endsAt : "";
  }
  next.updatedAt = now;
  writeGuestMealRun(next);
  return next;
}

async function abandonCookingMealRun(mealRun, reason, {
  bootstrap = {},
  idempotencyKey,
  now = new Date().toISOString(),
} = {}) {
  if (mealRun?.status === "abandoned") return mealRun;
  assertMealRunWritable(mealRun, ["planned", "cooking"]);
  if (!ABANDON_REASONS.has(reason)) throw codedError("abandon_reason_invalid");
  if (!mealRun.localOnly) {
    return requestMealRunMutation(mealRun, "abandon", "POST", { reason }, {
      bootstrap,
      idempotencyKey,
    });
  }
  const next = clone(mealRun);
  next.status = "abandoned";
  next.abandonReason = reason;
  next.abandonedAt = now;
  next.timerEndsAt = "";
  next.updatedAt = now;
  writeGuestMealRun(next);
  return next;
}

async function completeCookingMealRun(mealRun, {
  bootstrap = {},
  idempotencyKey,
  now = new Date().toISOString(),
} = {}) {
  if (mealRun?.status === "completed") return mealRun;
  assertMealRunWritable(mealRun, ["cooking"]);
  if (!mealRun.localOnly) {
    return requestMealRunMutation(mealRun, "complete", "POST", {}, {
      bootstrap,
      idempotencyKey,
    });
  }
  const next = clone(mealRun);
  next.status = "completed";
  next.completedBy = bootstrapUserId(bootstrap) || "guest";
  next.completedAt = now;
  next.timerEndsAt = "";
  next.updatedAt = now;
  writeGuestMealRun(next);
  return next;
}

async function saveCookingFeedback(mealRun, value, {
  bootstrap = {},
  idempotencyKey,
  now = new Date().toISOString(),
} = {}) {
  assertMealRunWritable(mealRun, ["completed"]);
  if (!FEEDBACK_VALUES.has(value)) throw codedError("meal_feedback_invalid");
  const userId = bootstrapUserId(bootstrap) || "guest";
  const existing = (mealRun.feedback || []).find((entry) => entry.userId === userId);
  if (existing?.value === value) return mealRun;
  if (!mealRun.localOnly) {
    return requestMealRunMutation(mealRun, "feedback", "PUT", { value }, {
      bootstrap,
      idempotencyKey,
    });
  }
  const next = clone(mealRun);
  const feedback = [...(next.feedback || [])];
  const index = feedback.findIndex((entry) => entry.userId === userId);
  if (index >= 0) feedback[index] = { ...feedback[index], value, updatedAt: now };
  else feedback.push({ userId, value, createdAt: now, updatedAt: now });
  next.feedback = feedback;
  next.updatedAt = now;
  writeGuestMealRun(next);
  return next;
}

async function requestMealRunMutation(mealRun, action, method, data, {
  bootstrap = {},
  idempotencyKey,
} = {}) {
  const ownerUserId = bootstrapUserId(bootstrap);
  if (!ownerUserId) throw codedError("invalid_session");
  const result = await requestHumi({
    path: `/meal-runs/${encodeURIComponent(mealRun.id)}/${action}`,
    method,
    data,
    idempotencyKey,
    stateVersion: bootstrap.stateVersion || "",
    expectedUserId: ownerUserId,
  });
  const next = normalizeMealRun(result?.mealRun);
  if (!next || next.id !== mealRun.id) throw codedError("meal_run_response_invalid");
  writeRemoteMealRun(next, ownerUserId);
  return next;
}

function writeGuestMealRun(mealRun) {
  if (!mealRun?.localOnly || !mealRun.ownerUserId || !validDateKey(mealRun.dateKey)) {
    throw codedError("guest_meal_run_invalid");
  }
  wx.setStorageSync(guestRunKey(mealRun.ownerUserId, mealRun.dateKey), mealRun);
}

function assertMealRunWritable(mealRun, statuses) {
  if (!mealRun?.id || !statuses.includes(mealRun.status)) throw codedError("meal_run_transition_invalid");
}

function normalizeMealRunId(value) {
  const mealRunId = clean(value);
  const remoteId = /^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$/;
  const guestId = /^guest:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!remoteId.test(mealRunId) && !guestId.test(mealRunId)) throw codedError("meal_run_id_invalid");
  return mealRunId;
}

function timelineStepIndex(timeline, stepId) {
  if (!Array.isArray(timeline?.steps)) return -1;
  return timeline.steps.findIndex((step) => step.id === stepId);
}

function buildDinnerPlan(recommendation, bootstrap = {}) {
  const recipes = (recommendation?.recipeIds || []).map((recipeId) => recipesById.get(recipeId)).filter(Boolean);
  if (!recipes.length || recipes.length !== recommendation?.recipeIds?.length) throw codedError("recommendation_group_invalid");
  const pantry = new Set((bootstrap.householdState?.pantryItems || [])
    .map((item) => clean(item?.name || item).toLowerCase())
    .filter(Boolean));
  const requiredIngredients = recipes.flatMap((recipe) => (
    recipe.ingredients || []
  ).filter((ingredient) => ingredient.required !== false).map((ingredient) => clean(ingredient.name))).filter(Boolean);
  const missingIngredients = [...new Set(requiredIngredients.filter((name) => !pantry.has(name.toLowerCase())))];
  const timeline = buildMealTimeline(recommendation.recipeIds, { startedAt: "2000-01-01T00:00:00.000Z" });
  const timelineSummary = summarizeMealTimeline(timeline);
  return {
    recommendationId: clean(recommendation.recommendationId),
    recipes: recipes.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      thumbnailUrl: absoluteAssetUrl(recipe.thumbnailUrl),
      totalMinutes: Number(recipe.cookAssist.totalMinutes) || 0,
      activeMinutes: Number(recipe.cookAssist.activeMinutes) || 0,
    })),
    totalMinutes: timelineSummary.totalMinutes,
    activeMinutes: timelineSummary.activeMinutes,
    cookwareCount: timelineSummary.cookware.length,
    cookware: timelineSummary.cookware,
    timelineVersion: timeline.version,
    missingIngredients,
    missingIngredientsText: missingIngredients.length ? missingIngredients.slice(0, 4).join("、") : "家里现有食材基本够用",
  };
}

function normalizeCreateInput({ bootstrap, recommendation, effortTier, dateKey }) {
  const recommendationId = clean(recommendation?.recommendationId);
  const recipeIds = [...new Set(Array.isArray(recommendation?.recipeIds) ? recommendation.recipeIds.map(clean).filter(Boolean) : [])];
  if (!recommendationId || !recipeIds.length || !recipeIds.every((recipeId) => recipesById.has(recipeId))) {
    throw codedError("recommendation_group_invalid");
  }
  if (!EFFORT_TIERS.has(effortTier)) throw codedError("effort_tier_invalid");
  if (!validDateKey(dateKey)) throw codedError("date_key_invalid");
  if (!recipeIds.every((recipeId) => recipesById.get(recipeId)?.cookAssist?.effortTier === effortTier)) {
    throw codedError("effort_tier_mismatch");
  }
  return {
    householdId: clean(bootstrap.activeHouseholdId),
    ownerUserId: bootstrapUserId(bootstrap),
    recommendationId,
    recipeIds,
    effortTier,
    dateKey,
  };
}

function canReplaceHouseholdPlan(bootstrap = {}, userId = bootstrapUserId(bootstrap)) {
  const householdId = clean(bootstrap.activeHouseholdId);
  if (!householdId) return true;
  const household = (bootstrap.households || []).find((item) => item.id === householdId);
  return Boolean(household && clean(household.ownerId) === clean(userId) && clean(userId));
}

function currentHouseholdRole(bootstrap = {}) {
  const household = (bootstrap.households || []).find((item) => item.id === bootstrap.activeHouseholdId);
  return household?.role === "owner" || household?.ownerId === bootstrapUserId(bootstrap) ? "owner" : household ? "member" : "guest";
}

function normalizeMealRun(value) {
  if (!value || typeof value !== "object" || !clean(value.id) || !RUN_STATUSES.has(value.status)) return null;
  if (!validDateKey(value.dateKey) || value.mealSlot !== "dinner") return null;
  return clone(value);
}

function writeRemoteMealRun(mealRun, userId) {
  if (!userId || !mealRun?.householdId || !mealRun?.dateKey) return;
  wx.setStorageSync(remoteRunKey(userId, mealRun.householdId, mealRun.dateKey), mealRun);
}

function archiveMergedGuestRun(guestRun, remoteMealRunId) {
  wx.setStorageSync(`${MERGED_RUN_PREFIX}${encodeKey(guestRun.ownerUserId)}:${encodeKey(guestRun.id)}`, {
    ...guestRun,
    mergeStatus: "merged",
    mergedIntoMealRunId: remoteMealRunId,
    mergedAt: new Date().toISOString(),
  });
}

function guestRunKey(ownerUserId, dateKey) {
  return `${GUEST_RUN_PREFIX}${encodeKey(ownerUserId)}:${dateKey}`;
}

function remoteRunKey(userId, householdId, dateKey) {
  return `${REMOTE_RUN_PREFIX}${encodeKey(userId)}:${encodeKey(householdId)}:${dateKey}`;
}

function encodeKey(value) {
  return encodeURIComponent(clean(value));
}

function bootstrapUserId(bootstrap = {}) {
  return clean(bootstrap.user?.id);
}

function formatDinnerDateKey(date = new Date()) {
  const instant = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(instant.getTime())) throw codedError("date_key_invalid");
  return new Date(instant.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function createUuid() {
  const bytes = new Uint8Array(16);
  if (typeof wx.getRandomValues === "function") wx.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function absoluteAssetUrl(value) {
  const url = clean(value);
  return url.startsWith("/") ? `https://www.humi-home.com${url}` : url;
}

function isNetworkError(error = {}) {
  return Number(error.status) === 0 || ["network_error", "request_timeout"].includes(error.code);
}

function clean(value) {
  return String(value || "").trim();
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = {
  applyOptimisticMealProgress,
  buildDinnerPlan,
  abandonCookingMealRun,
  canReplaceHouseholdPlan,
  clearOptimisticMealProgress,
  completeCookingMealRun,
  createMealRun,
  currentHouseholdRole,
  downgradeCookingMealRun,
  formatDinnerDateKey,
  loadMealRunForCooking,
  loadCurrentMealRun,
  mergeActiveGuestMealRun,
  normalizeMealRunId,
  progressCookingMealRun,
  readActiveGuestMealRun,
  saveCookingFeedback,
  startCookingMealRun,
  writeOptimisticMealProgress,
  writeGuestMealRun,
};
