import assert from "node:assert/strict";
import {
  completedMealsInWeek,
  createLocalMealRun,
  downgradeLocalMealRun,
  mergeLocalMealRun,
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
  effortTier: "quick_15",
  recipeIds: ["tomato-egg", "seaweed-egg-soup"],
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
const progressed = transitionLocalMealRun(cooking, "progress", {
  currentStepId: passiveStep.id,
  timerEndsAt: passiveStep.endsAt,
  now: "2026-07-22T10:06:00.000Z",
});
assert.equal(progressed.currentStepId, passiveStep.id);
assert.equal(remainingLocalTimerSeconds(progressed, new Date(Date.parse(passiveStep.endsAt) - 45_000).toISOString()), 45);
assert.equal(remainingLocalTimerSeconds(progressed, new Date(Date.parse(passiveStep.endsAt) + 1000).toISOString()), 0);

const downgraded = downgradeLocalMealRun(progressed, "ready_staple", { now: "2026-07-22T10:07:00.000Z" });
assert.equal(downgraded.status, "cooking");
assert.equal(downgraded.readyStaple, "即食米饭");
assert.equal(downgraded.downgrades.length, 1);
assert.equal(downgraded.downgrades[0].action, "ready_staple");

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
