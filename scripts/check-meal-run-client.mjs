import assert from "node:assert/strict";
import {
  completedMealsInWeek,
  createLocalMealRun,
  downgradeLocalMealRun,
  isCompletedGuestRunEquivalent,
  mergeLocalMealRun,
  obsoleteMealEpochOperationIds,
  recoverObsoleteMealEpoch,
  remainingLocalTimerSeconds,
  transitionLocalMealRun,
} from "../src/lib/mealRun.js";
import {
  abandonHumiMealRun,
  cancelHumiMealReminder,
  claimHumiMealTask,
  completeHumiMealRun,
  completeHumiMealTask,
  createHumiMealReminder,
  createHumiMealRun,
  createHumiMealTask,
  downgradeHumiMealRun,
  loadCurrentHumiMealRun,
  loadHumiMealReminderConfig,
  recordHumiProductEvent,
  startHumiMealRun,
  updateHumiMealRunFeedback,
  updateHumiMealRunProgress,
} from "../src/lib/humiApi.js";
import {
  buildMealTimeline,
  createActualPassiveTimer,
  nextAvailableMealTimelineStep,
  runningMealTimelineTimers,
} from "../src/lib/mealExecution.js";

for (const clientMethod of [
  abandonHumiMealRun,
  cancelHumiMealReminder,
  claimHumiMealTask,
  completeHumiMealRun,
  completeHumiMealTask,
  createHumiMealReminder,
  createHumiMealRun,
  createHumiMealTask,
  downgradeHumiMealRun,
  loadCurrentHumiMealRun,
  loadHumiMealReminderConfig,
  recordHumiProductEvent,
  startHumiMealRun,
  updateHumiMealRunFeedback,
  updateHumiMealRunProgress,
]) assert.equal(typeof clientMethod, "function", "meal execution API client contract must be exported");

const planned = createLocalMealRun({
  id: "guest-run-1",
  householdId: "guest",
  dateKey: "2026-07-22",
  effortTier: "normal",
  recipeIds: ["cola-wings"],
  now: "2026-07-22T10:00:00.000Z",
});
assert.equal(planned.status, "planned");
assert.equal(planned.localOnly, true);
assert.equal(planned.timeline, null);

const cooking = transitionLocalMealRun(planned, "start", { now: "2026-07-22T10:05:00.000Z", userId: "guest" });
assert.equal(cooking.status, "cooking");
assert.equal(cooking.startedAt, "2026-07-22T10:05:00.000Z");
assert(cooking.timeline.steps.length > 0);
assert.equal(planned.status, "planned", "local transitions must not mutate the previous snapshot");

const passiveStep = cooking.timeline.steps.find((step) => step.attention === "passive");
const delayedStartedAt = new Date(Date.parse(passiveStep.startsAt) + 5 * 60_000).toISOString();
const passiveTimer = createActualPassiveTimer(passiveStep, delayedStartedAt);
const beforePassive = cooking.timeline.steps
  .slice(1, cooking.timeline.steps.findIndex((step) => step.id === passiveStep.id))
  .reduce((run, step) => transitionLocalMealRun(run, "progress", {
    currentStepId: step.id,
    now: delayedStartedAt,
  }), cooking);
const progressed = transitionLocalMealRun(beforePassive, "progress", {
  currentStepId: passiveStep.id,
  timer: passiveTimer,
  now: delayedStartedAt,
});
assert.equal(progressed.currentStepId, passiveStep.id);
assert.notEqual(passiveTimer.endsAt, passiveStep.endsAt, "static schedule is only an estimate");
assert.deepEqual(progressed.timers[passiveStep.id], passiveTimer);
assert.equal(remainingLocalTimerSeconds(progressed, new Date(Date.parse(passiveTimer.endsAt) - 45_000).toISOString()), 45);
assert.equal(remainingLocalTimerSeconds(progressed, new Date(Date.parse(passiveTimer.endsAt) + 1000).toISOString()), 0);
assert.throws(
  () => transitionLocalMealRun(beforePassive, "progress", {
    currentStepId: passiveStep.id,
    timer: { ...passiveTimer, endsAt: new Date(Date.parse(passiveTimer.endsAt) - 1000).toISOString() },
  }),
  (error) => error.code === "meal_timer_duration_invalid",
);

const parallelTimeline = buildMealTimeline(["cola-wings", "shiitake-steamed-chicken"], {
  startedAt: "2026-07-22T10:00:00.000Z",
});
const colaPassive = parallelTimeline.steps.find((step) => step.id === "cola-wings:step:4");
const shiitakePassive = parallelTimeline.steps.find((step) => step.id === "shiitake-steamed-chicken:step:3");
const parallelNow = "2026-07-22T10:20:00.000Z";
const parallelTimers = Object.fromEntries([colaPassive, shiitakePassive].map((step) => {
  const timer = createActualPassiveTimer(step, parallelNow);
  return [step.id, timer];
}));
assert.deepEqual(
  runningMealTimelineTimers(parallelTimeline, shiitakePassive.id, parallelTimers, parallelNow)
    .map((timer) => timer.id)
    .sort(),
  [colaPassive.id, shiitakePassive.id].sort(),
  "H5 rollback supports two independent actual timers",
);
assert.equal(
  nextAvailableMealTimelineStep(
    parallelTimeline,
    colaPassive.id,
    { [colaPassive.id]: parallelTimers[colaPassive.id] },
    parallelNow,
  )?.id,
  "shiitake-steamed-chicken:step:1",
  "an independent active step remains available while another dish waits",
);

const downgraded = downgradeLocalMealRun(progressed, "ready_staple", { now: "2026-07-22T10:07:00.000Z" });
assert.equal(downgraded.status, "cooking");
assert.equal(downgraded.readyStaple, "即食米饭");
assert.equal(downgraded.downgrades.length, 1);
assert.equal(downgraded.downgrades[0].action, "ready_staple");
assert.equal(downgraded.timelineVersion, progressed.timelineVersion + 1);
assert.equal(downgraded.currentStepId, progressed.currentStepId);
assert.deepEqual(downgraded.timers, progressed.timers, "ready staple preserves an unchanged cooking timeline");

const recipeDowngraded = downgradeLocalMealRun(downgraded, "lower_effort_recipe", { now: "2026-07-22T10:08:00.000Z" });
assert.equal(recipeDowngraded.timelineVersion, downgraded.timelineVersion + 1);
assert.deepEqual(recipeDowngraded.recipeIds, ["tomato-egg"]);
assert.equal(recipeDowngraded.currentStepId, recipeDowngraded.timeline.steps[0].id);
assert.deepEqual(recipeDowngraded.timers, {}, "a changed recipe starts a new timer epoch");

const higherVersionReset = {
  ...progressed,
  timelineVersion: progressed.timelineVersion + 1,
  currentStepId: progressed.timeline.steps[0].id,
  timers: {},
  updatedAt: "2026-07-22T10:04:00.000Z",
};
const mergedHigherVersion = mergeLocalMealRun(progressed, higherVersionReset);
assert.equal(mergedHigherVersion.timelineVersion, higherVersionReset.timelineVersion);
assert.equal(mergedHigherVersion.currentStepId, higherVersionReset.currentStepId);
assert.deepEqual(mergedHigherVersion.timers, {}, "a higher timeline epoch is authoritative even with an earlier cursor");

assert.throws(
  () => transitionLocalMealRun(planned, "complete", { now: "2026-07-22T10:10:00.000Z" }),
  (error) => error.code === "meal_run_transition_invalid",
);
assert.throws(
  () => transitionLocalMealRun(cooking, "progress", { currentStepId: "not-a-step" }),
  (error) => error.code === "meal_step_invalid",
);

const completed = transitionLocalMealRun(progressed, "complete", { now: "2026-07-22T10:20:00.000Z", userId: "guest" });
const completedAgain = transitionLocalMealRun(completed, "complete", { now: "2026-07-22T10:30:00.000Z", userId: "guest" });
assert.equal(completedAgain.completedAt, completed.completedAt, "completion must be exactly once");

const remoteCompleted = { ...completed, id: "remote-run-9", localOnly: false, syncedFromLocalId: completed.id };
const merged = mergeLocalMealRun(completed, remoteCompleted);
assert.equal(merged.id, "remote-run-9");
assert.equal(merged.status, "completed");

const completedWithFeedback = transitionLocalMealRun(completed, "feedback", {
  now: "2026-07-22T10:21:00.000Z",
  userId: "guest",
  value: "want_again",
});
const equivalentRemoteCompleted = {
  ...remoteCompleted,
  feedback: [{
    userId: "owner-1",
    value: "want_again",
    createdAt: "2026-07-22T10:22:00.000Z",
    updatedAt: "2026-07-22T10:22:00.000Z",
  }],
};
assert.equal(
  isCompletedGuestRunEquivalent(completedWithFeedback, equivalentRemoteCompleted, "owner-1"),
  true,
  "H5 only clears a completed guest run after cursor, timers, completion, and owner feedback converge",
);
assert.equal(
  isCompletedGuestRunEquivalent(completedWithFeedback, { ...equivalentRemoteCompleted, timers: {} }, "owner-1"),
  false,
  "a missing remote timer keeps the completed H5 guest record available for retry",
);
assert.equal(
  isCompletedGuestRunEquivalent(completedWithFeedback, { ...equivalentRemoteCompleted, feedback: [] }, "owner-1"),
  false,
  "missing owner feedback keeps the completed H5 guest record available for retry",
);

const obsoleteOperationIds = obsoleteMealEpochOperationIds([
  { id: "progress-v1", mealRunId: "run-epoch", action: "progress", payload: { timelineVersion: 1 } },
  { id: "complete-v1", mealRunId: "run-epoch", action: "complete", payload: { timelineVersion: 1 } },
  { id: "feedback-v1", mealRunId: "run-epoch", action: "feedback", payload: { value: "want_again" } },
  { id: "abandon-safe", mealRunId: "run-epoch", action: "abandon", payload: { reason: "plans_changed" } },
  { id: "progress-v2", mealRunId: "run-epoch", action: "progress", payload: { timelineVersion: 2 } },
  { id: "other-run", mealRunId: "other", action: "progress", payload: { timelineVersion: 1 } },
], {
  mealRunId: "run-epoch",
  timelineVersion: 1,
});
assert.deepEqual(
  obsoleteOperationIds.sort(),
  ["complete-v1", "feedback-v1", "progress-v1"],
  "H5 drops only obsolete epoch work and its dependent feedback",
);
const recoveredEpoch = await recoverObsoleteMealEpoch({
  operations: [
    { id: "progress-v1", mealRunId: "run-epoch", action: "progress", payload: { timelineVersion: 1 } },
    { id: "complete-v1", mealRunId: "run-epoch", action: "complete", payload: { timelineVersion: 1 } },
    { id: "other-run", mealRunId: "other", action: "progress", payload: { timelineVersion: 1 } },
  ],
  failedOperation: {
    id: "progress-v1",
    mealRunId: "run-epoch",
    action: "progress",
    payload: { timelineVersion: 1 },
  },
  loadLatest: async () => ({ mealRun: { id: "run-epoch", timelineVersion: 2, status: "cooking" } }),
});
assert.equal(recoveredEpoch.latestMealRun.timelineVersion, 2);
assert.equal(recoveredEpoch.discardedCompletion, true);
assert.deepEqual(recoveredEpoch.discardedOperationIds.sort(), ["complete-v1", "progress-v1"]);
await assert.rejects(
  () => recoverObsoleteMealEpoch({
    operations: [{ id: "progress-v1", mealRunId: "run-epoch", action: "progress", payload: { timelineVersion: 1 } }],
    failedOperation: { id: "progress-v1", mealRunId: "run-epoch", action: "progress", payload: { timelineVersion: 1 } },
    loadLatest: async () => { throw new Error("offline"); },
  }),
  /offline/,
  "H5 keeps the old queue intact until the authoritative refresh succeeds",
);

const abandoned = transitionLocalMealRun(
  createLocalMealRun({ id: "guest-run-2", dateKey: "2026-07-23", effortTier: "easy_30", recipeIds: ["mapo-tofu"] }),
  "abandon",
  { reason: "plans_changed", now: "2026-07-23T10:00:00.000Z" },
);
assert.equal(abandoned.status, "abandoned");
assert.equal(abandoned.abandonReason, "plans_changed");

assert.equal(completedMealsInWeek([
  completed,
  completedAgain,
  { ...completed, id: "another-household", householdId: "other" },
  abandoned,
], { householdId: "guest", weekStartDateKey: "2026-07-20" }), 1, "weekly count must deduplicate the same completed dinner");

console.log("Meal run local-first client checks passed.");
