import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "miniprogram/components/cooking-step/index.js",
  "miniprogram/components/cooking-step/index.json",
  "miniprogram/components/cooking-step/index.wxml",
  "miniprogram/components/cooking-step/index.wxss",
  "miniprogram/components/absolute-timer/index.js",
  "miniprogram/components/absolute-timer/index.json",
  "miniprogram/components/absolute-timer/index.wxml",
  "miniprogram/components/absolute-timer/index.wxss",
  "miniprogram/components/meal-feedback/index.js",
  "miniprogram/components/meal-feedback/index.json",
  "miniprogram/components/meal-feedback/index.wxml",
  "miniprogram/components/meal-feedback/index.wxss",
];
for (const relativePath of requiredFiles) {
  assert(existsSync(path.join(root, relativePath)), `${relativePath} must exist`);
}

const timeline = {
  version: 1,
  recipeIds: ["tomato-egg", "seaweed-egg-soup"],
  startedAt: "2026-07-23T10:00:00.000Z",
  endsAt: "2026-07-23T10:04:00.000Z",
  totalSeconds: 240,
  cookware: ["wok", "pot"],
  steps: [
    step("tomato-egg:step:1", "active", 0, 60, [], ["wok"]),
    step("seaweed-egg-soup:step:1", "passive", 60, 180, ["tomato-egg:step:1"], ["pot"]),
    step("tomato-egg:step:2", "active", 60, 120, ["tomato-egg:step:1"], ["wok"]),
    step("seaweed-egg-soup:step:2", "active", 180, 240, ["seaweed-egg-soup:step:1", "tomato-egg:step:2"], ["pot"]),
  ],
};

{
  const runtime = createRuntime({ initialRun: remoteRun({ status: "planned" }) });
  const cookingModule = runtime.load("miniprogram/packageCooking/pages/cooking/index.js");
  assert.equal(typeof cookingModule.remainingSeconds, "function");
  assert.equal(
    cookingModule.remainingSeconds("2026-07-23T10:01:00.000Z", "2026-07-23T10:00:15.000Z"),
    45,
  );
  assert.equal(
    cookingModule.remainingSeconds("2026-07-23T10:01:00.000Z", "2026-07-23T10:02:00.000Z"),
    0,
  );
}

await verifyAuthenticatedLifecycle();
await verifyDelayedActualPassiveTimers();
await verifyParallelActualPassiveTimers();
await verifyConsecutiveActualPassiveTimers();
verifyCertifiedActualTimerReachability();
verifyTimelineVersionAuthorityAndOverlay();
await verifyPassiveConcurrencyAndBackgroundRestore();
await verifyConsecutivePassiveRecovery();
await verifyCertifiedAutoPassiveCases();
await verifyRapidTapAndMonotonicProgress();
await verifyOfflineRecoveryAndAccountIsolation();
await verifyCompletedReceiptFeedbackRefresh();
await verifyNetworkRaceQueuesMutation();
await verifyOfflinePlannedRunStaysActionable();
await verifyOfflineAbandonReasons();
await verifyAllDowngrades();
await verifyOfflineEpochConflictConverges();
await verifyConflictFreezeAndReload();
await verifyConflictReplacementGuidance();
await verifyCrossDeviceAbandonConflict();
await verifyGuestLifecycle();
await verifyMemberPermissionsAndCompletedReadOnly();
await verifyRetryRecovery();
verifyPresentationContracts();

console.log("Native whole-meal cooking checks passed.");

async function verifyDelayedActualPassiveTimers() {
  const recipeIds = [
    "spinach-tofu-egg-drop-soup",
    "cola-wings",
    "steamed-sea-bass",
    "shiitake-steamed-chicken",
  ];
  for (const [caseIndex, recipeId] of recipeIds.entries()) {
    const catalogRuntime = createRuntime({ initialRun: remoteRun({ status: "planned" }) });
    const { buildMealTimeline } = catalogRuntime.load("miniprogram/utils/meal-timeline.js");
    const candidateTimeline = buildMealTimeline([recipeId], { startedAt: "2026-07-23T10:00:00.000Z" });
    const passiveIndex = candidateTimeline.steps.findIndex((step) => step.attention === "passive");
    assert(passiveIndex > 0, `${recipeId} has a real passive step after an active action`);
    const passiveStep = candidateTimeline.steps[passiveIndex];
    const predecessor = candidateTimeline.steps[passiveIndex - 1];
    const delayedStartedAt = new Date(Date.parse(passiveStep.startsAt) + 5 * 60 * 1000).toISOString();
    const expectedEndsAt = new Date(Date.parse(delayedStartedAt) + passiveStep.durationSeconds * 1000).toISOString();
    const cooking = remoteRun({
      id: `run-delayed-timer-${caseIndex}`,
      status: "cooking",
      recipeIds: [recipeId],
      timeline: candidateTimeline,
      currentStepId: predecessor.id,
      timerEndsAt: "",
      timers: {},
    });
    const runtime = createRuntime({ initialRun: cooking, now: delayedStartedAt });
    const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
    await page.onLoad({ mealRunId: cooking.id });
    await page.advanceStep({ detail: { stepId: predecessor.id } });
    const progressRequest = runtime.requests.find((request) => request.path.endsWith("/progress"));
    assert.deepEqual(progressRequest?.data?.timer, {
      stepId: passiveStep.id,
      startedAt: delayedStartedAt,
      endsAt: expectedEndsAt,
    }, `${recipeId}: a passive timer starts from actual entry, not the estimated schedule`);
    assert.notEqual(expectedEndsAt, passiveStep.endsAt, `${recipeId}: the five-minute delay must move the actual end`);
    assert.equal(page.data.mealRun.timers[passiveStep.id].endsAt, expectedEndsAt);
    assert.equal(page.data.runningTimers[0].remainingSeconds, passiveStep.durationSeconds, `${recipeId}: no cooking time is lost after a delay`);
    if (candidateTimeline.steps[passiveIndex + 1]?.dependsOn?.includes(passiveStep.id)) {
      assert.equal(page.data.currentActiveStep, null, `${recipeId}: a dependent action stays locked by the actual timer`);
    }
  }
}

async function verifyParallelActualPassiveTimers() {
  const catalogRuntime = createRuntime({ initialRun: remoteRun({ status: "planned" }) });
  const { buildMealTimeline } = catalogRuntime.load("miniprogram/utils/meal-timeline.js");
  const candidateTimeline = buildMealTimeline(["cola-wings", "shiitake-steamed-chicken"], {
    startedAt: "2026-07-23T10:00:00.000Z",
  });
  const colaPassive = candidateTimeline.steps.find((step) => step.id === "cola-wings:step:4");
  const shiitakePassive = candidateTimeline.steps.find((step) => step.id === "shiitake-steamed-chicken:step:3");
  const colaPredecessor = candidateTimeline.steps[candidateTimeline.steps.indexOf(colaPassive) - 1];
  const delayedColaStart = new Date(Date.parse(colaPassive.startsAt) + 5 * 60 * 1000).toISOString();
  const cooking = remoteRun({
    id: "run-two-actual-timers",
    status: "cooking",
    recipeIds: ["cola-wings", "shiitake-steamed-chicken"],
    timeline: candidateTimeline,
    currentStepId: colaPredecessor.id,
    timers: {},
  });
  const runtime = createRuntime({ initialRun: cooking, now: delayedColaStart });
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: cooking.id });
  await page.advanceStep({ detail: { stepId: colaPredecessor.id } });
  await page.advanceStep({ detail: { stepId: colaPassive.id } });
  await page.advanceStep({ detail: { stepId: "shiitake-steamed-chicken:step:1" } });
  runtime.advanceClock(11 * 60 * 1000);
  await page.advanceStep({ detail: { stepId: "shiitake-steamed-chicken:step:2" } });
  assert.equal(page.data.mealRun.currentStepId, shiitakePassive.id);
  assert.deepEqual(
    page.data.runningTimers.map((timer) => timer.id).sort(),
    [colaPassive.id, shiitakePassive.id].sort(),
    "two passive steps on independent cookware retain separate actual timers",
  );
  assert.equal(Object.keys(page.data.mealRun.timers).length, 2);
  assert(
    Date.parse(page.data.mealRun.timers[colaPassive.id].endsAt) > Date.parse(colaPassive.endsAt),
    "the delayed cola timer remains running after its estimated end",
  );
}

async function verifyConsecutiveActualPassiveTimers() {
  const catalogRuntime = createRuntime({ initialRun: remoteRun({ status: "planned" }) });
  const { buildMealTimeline } = catalogRuntime.load("miniprogram/utils/meal-timeline.js");
  const candidateTimeline = buildMealTimeline(["shiitake-steamed-chicken"], {
    startedAt: "2026-07-23T10:00:00.000Z",
  });
  const firstPassive = candidateTimeline.steps.find((step) => step.id === "shiitake-steamed-chicken:step:3");
  const secondPassive = candidateTimeline.steps.find((step) => step.id === "shiitake-steamed-chicken:step:4");
  const actualStart = new Date(Date.parse(firstPassive.startsAt) + 5 * 60 * 1000).toISOString();
  const cooking = remoteRun({
    id: "run-consecutive-actual-timers",
    status: "cooking",
    recipeIds: ["shiitake-steamed-chicken"],
    timeline: candidateTimeline,
    currentStepId: "shiitake-steamed-chicken:step:2",
    timers: {},
  });
  const runtime = createRuntime({ initialRun: cooking, now: actualStart });
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: cooking.id });
  await page.advanceStep({ detail: { stepId: cooking.currentStepId } });
  await page.advanceUnlockedPassiveSteps();
  assert.equal(page.data.mealRun.currentStepId, firstPassive.id, "the estimated end cannot auto-skip a newly started passive step");
  runtime.advanceClock(firstPassive.durationSeconds * 1000);
  await page.advanceUnlockedPassiveSteps();
  assert.equal(page.data.mealRun.currentStepId, secondPassive.id);
  assert.equal(
    page.data.mealRun.timers[secondPassive.id].startedAt,
    page.data.mealRun.timers[firstPassive.id].endsAt,
    "the second passive timer starts only when the first actual timer finishes",
  );
  assert.equal(
    Date.parse(page.data.mealRun.timers[secondPassive.id].endsAt)
      - Date.parse(page.data.mealRun.timers[secondPassive.id].startedAt),
    secondPassive.durationSeconds * 1000,
  );
}

function verifyCertifiedActualTimerReachability() {
  const runtime = createRuntime({ initialRun: remoteRun({ status: "planned" }) });
  const recipes = runtime.load("miniprogram/data/certified-recipes.js");
  const {
    buildMealTimeline,
    createActualPassiveTimer,
    nextAvailableTimelineStep,
    runningPassiveTimers,
  } = runtime.load("miniprogram/utils/meal-timeline.js");
  assert.equal(typeof createActualPassiveTimer, "function");
  const idsByTier = new Map();
  for (const recipe of recipes) {
    const ids = idsByTier.get(recipe.cookAssist.effortTier) || [];
    ids.push(recipe.id);
    idsByTier.set(recipe.cookAssist.effortTier, ids);
  }
  const cases = recipes.map((recipe) => [recipe.id]);
  for (const ids of idsByTier.values()) {
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) cases.push([ids[left], ids[right]]);
    }
  }
  assert.equal(cases.length, 165);
  let maxParallelTimers = 0;
  for (const recipeIds of cases) {
    const candidateTimeline = buildMealTimeline(recipeIds, { startedAt: "2026-07-23T10:00:00.000Z" });
    let now = "2026-07-23T10:05:00.000Z";
    let currentStepId = candidateTimeline.steps[0].id;
    let timers = {};
    if (candidateTimeline.steps[0].attention === "passive") {
      const timer = createActualPassiveTimer(candidateTimeline.steps[0], now);
      timers[timer.stepId] = timer;
    }
    let guard = 0;
    while (currentStepId !== candidateTimeline.steps.at(-1).id) {
      assert(guard++ < candidateTimeline.steps.length * 4, `${recipeIds.join("+")}: actual timer presentation must terminate`);
      const available = nextAvailableTimelineStep(candidateTimeline, currentStepId, timers, now);
      if (!available) {
        const running = runningPassiveTimers(candidateTimeline, currentStepId, timers, now);
        assert(running.length, `${recipeIds.join("+")}: only an actual running timer may block the next step`);
        now = running.map((timer) => timer.endsAt).sort()[0];
        continue;
      }
      currentStepId = available.id;
      if (available.attention === "passive") {
        const timer = createActualPassiveTimer(available, now);
        timers = { ...timers, [timer.stepId]: timer };
      }
      maxParallelTimers = Math.max(
        maxParallelTimers,
        runningPassiveTimers(candidateTimeline, currentStepId, timers, now).length,
      );
    }
  }
  assert(maxParallelTimers >= 2, "the certified catalog exercises at least two simultaneous actual passive timers");
}

function verifyTimelineVersionAuthorityAndOverlay() {
  const actualTimer = {
    stepId: timeline.steps[1].id,
    startedAt: timeline.steps[1].startsAt,
    endsAt: timeline.steps[1].endsAt,
  };
  const oldRun = remoteRun({
    status: "cooking",
    timelineVersion: 1,
    currentStepId: timeline.steps[2].id,
    timers: { [actualTimer.stepId]: actualTimer },
    downgrades: [],
  });
  const higherVersionReset = {
    ...oldRun,
    timelineVersion: 2,
    currentStepId: timeline.steps[0].id,
    timers: {},
    downgrades: [{ action: "lower_effort_recipe" }],
  };
  const runtime = createRuntime({ initialRun: oldRun });
  const pageHelpers = runtime.load("miniprogram/packageCooking/pages/cooking/index.js");
  const mealRuns = runtime.load("miniprogram/utils/meal-run.js");
  const authoritative = pageHelpers.chooseMonotonicMealRun(oldRun, higherVersionReset);
  assert.equal(authoritative.timelineVersion, 2);
  assert.equal(authoritative.currentStepId, timeline.steps[0].id);
  assert.deepEqual(clone(authoritative.timers), {}, "a higher timeline epoch clears obsolete timers even with identical step ids");
  const ignoredStale = pageHelpers.chooseMonotonicMealRun(higherVersionReset, oldRun);
  assert.equal(ignoredStale.timelineVersion, 2);
  assert.deepEqual(clone(ignoredStale.timers), {});

  mealRuns.writeOptimisticMealProgress(oldRun, {
    ownerUserId: "owner-1",
    currentStepId: timeline.steps[2].id,
    timer: actualTimer,
  });
  const afterEpochChange = mealRuns.applyOptimisticMealProgress(higherVersionReset, "owner-1");
  assert.equal(afterEpochChange.currentStepId, timeline.steps[0].id);
  assert.deepEqual(clone(afterEpochChange.timers), {}, "an old offline overlay cannot cross a timeline epoch");
  assert(
    !runtime.storageEntries().some(([key]) => key.startsWith("humi:meal-run:optimistic-progress:v1:")),
    "the stale optimistic overlay is deleted after an epoch change",
  );
}

async function verifyAuthenticatedLifecycle() {
  let active = remoteRun({ status: "planned" });
  const calls = [];
  const runtime = createRuntime({
    initialRun: active,
    requestHandler: requestRouter({
      getRun: () => active,
      setRun: (value) => { active = value; },
      calls,
    }),
  });
  const queue = runtime.load("miniprogram/utils/offline-queue.js");
  assert.throws(() => queue.enqueueMutation({
    id: "unsafe-progress",
    type: "meal_progress",
    householdId: "home-1",
    mealRunId: active.id,
    createdAt: 1,
    data: { currentStepId: timeline.steps[1].id, note: "private free text" },
  }), /offline_action_invalid/, "offline meal actions reject extra free text");
  assert.throws(() => queue.enqueueMutation({
    id: "unsafe-progress-shape",
    type: "meal_progress",
    householdId: "home-1",
    mealRunId: active.id,
    createdAt: 2,
    data: { currentStepId: timeline.steps[1].id, arbitraryField: true },
  }), /offline_action_invalid/, "offline meal actions use exact nested schemas");
  assert.throws(() => queue.enqueueMutation({
    id: "unsafe-feedback-value",
    type: "meal_feedback",
    householdId: "home-1",
    mealRunId: active.id,
    createdAt: 3,
    data: { value: "tell_everyone_the_note" },
  }), /offline_action_invalid/, "offline feedback is enum-only");
  assert.throws(() => queue.enqueueMutation({
    id: "unsafe-abandon-shape",
    type: "meal_abandon",
    householdId: "home-1",
    mealRunId: active.id,
    createdAt: 4,
    data: { reason: "plans_changed", message: "private free text" },
  }), /offline_action_invalid/, "offline abandon accepts only a reason enum");
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: active.id, action: "start" });
  assert.equal(page.data.mealRun.status, "cooking");
  assert.equal(page.data.currentActiveStep.id, timeline.steps[0].id);
  assert.equal(calls.filter((call) => call.path.endsWith("/start")).length, 1);

  await page.advanceStep({ currentTarget: { dataset: { stepId: timeline.steps[0].id } } });
  assert.equal(page.data.mealRun.currentStepId, timeline.steps[1].id);
  assert.equal(page.data.runningTimers.length, 1);
  assert.equal(
    calls.find((call) => call.path.endsWith("/progress"))?.data?.timelineVersion,
    1,
    "every progress mutation carries its expected timeline epoch",
  );
  await page.advanceStep({ currentTarget: { dataset: { stepId: timeline.steps[1].id } } });
  assert.equal(page.data.mealRun.currentStepId, timeline.steps[2].id);

  await page.completeMeal();
  await page.completeMeal();
  assert.equal(page.data.mealRun.status, "completed");
  assert.equal(page._clock, null, "completion stops the page timer immediately");
  assert.equal(calls.filter((call) => call.path.endsWith("/complete")).length, 1, "serve must be exactly once");
  assert.equal(
    calls.find((call) => call.path.endsWith("/complete"))?.data?.timelineVersion,
    1,
    "serving is bound to the timeline epoch the family actually cooked",
  );

  await page.saveFeedback({ detail: { value: "want_again" } });
  await page.saveFeedback({ detail: { value: "want_again" } });
  assert.equal(page.data.feedbackValue, "want_again");
  assert.equal(calls.filter((call) => call.path.endsWith("/feedback")).length, 1, "feedback must write once per value");
}

async function verifyPassiveConcurrencyAndBackgroundRestore() {
  const actualTimer = {
    stepId: timeline.steps[1].id,
    startedAt: timeline.steps[1].startsAt,
    endsAt: timeline.steps[1].endsAt,
  };
  const cooking = remoteRun({
    status: "cooking",
    currentStepId: timeline.steps[1].id,
    timers: { [actualTimer.stepId]: actualTimer },
    timerEndsAt: timeline.steps[1].endsAt,
  });
  const runtime = createRuntime({
    initialRun: cooking,
    now: "2026-07-23T10:01:30.000Z",
  });
  const timelineHelpers = runtime.load("miniprogram/utils/meal-timeline.js");
  assert.equal(
    timelineHelpers.nextAvailableTimelineStep(timeline, timeline.steps[1].id, cooking.timers, "2026-07-23T10:01:30.000Z").id,
    timeline.steps[2].id,
    "an independent active step can start while a passive timer runs on another resource",
  );
  assert.equal(
    timelineHelpers.nextAvailableTimelineStep(timeline, timeline.steps[2].id, cooking.timers, "2026-07-23T10:02:00.000Z"),
    null,
    "a step cannot bypass an unfinished passive dependency",
  );
  assert.equal(
    timelineHelpers.nextAvailableTimelineStep(timeline, timeline.steps[2].id, cooking.timers, "2026-07-23T10:03:00.000Z").id,
    timeline.steps[3].id,
    "the dependent step unlocks from the passive endsAt timestamp",
  );
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: cooking.id });
  assert.equal(page.data.currentStep.id, timeline.steps[1].id, "the persisted cursor remains the passive timer");
  assert.equal(page.data.currentActiveStep.id, timeline.steps[2].id, "the Now card promotes only the safe parallel active step");
  assert.equal(page.data.stepActionLabel, "开始这一步", "parallel progress never pretends the passive timer was manually completed");
  assert.equal(page.data.stepActionFromId, timeline.steps[1].id);
  assert.deepEqual(page.data.runningTimers.map((item) => item.id), [timeline.steps[1].id], "passive work may run beside an active step");
  assert.equal(page.data.runningTimers[0].remainingSeconds, 90);
  await page.advanceStep({ detail: { stepId: timeline.steps[1].id } });
  assert.equal(page.data.mealRun.currentStepId, timeline.steps[2].id, "starting the promoted active step advances from the passive cursor");
  assert.equal(page.data.currentActiveStep.id, timeline.steps[2].id);

  const blockedTimeline = clone(timeline);
  blockedTimeline.steps[2].resources = ["pot"];
  const blocked = remoteRun({
    id: "run-passive-wait",
    status: "cooking",
    timeline: blockedTimeline,
    currentStepId: blockedTimeline.steps[1].id,
    timers: { [actualTimer.stepId]: actualTimer },
    timerEndsAt: blockedTimeline.steps[1].endsAt,
  });
  const blockedRuntime = createRuntime({
    initialRun: blocked,
    now: "2026-07-23T10:01:30.000Z",
  });
  const blockedPage = blockedRuntime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await blockedPage.onLoad({ mealRunId: blocked.id });
  assert.equal(blockedPage.data.currentActiveStep, null, "a passive step is never rendered as actionable when no active step is safe");
  assert.equal(blockedPage.data.waitingForTimer, true, "the UI exposes an explicit waiting state");

  page.onHide();
  runtime.advanceClock(90_000);
  await page.onShow();
  assert.equal(page.data.runningTimers.length, 0, "expired passive timers are removed after absolute-time foreground recovery");
  assert(!JSON.stringify(runtime.storageEntries()).includes('"remainingCounter"'), "a decrementing timer is never persisted");
}

async function verifyConsecutivePassiveRecovery() {
  const chainedTimeline = clone(timeline);
  chainedTimeline.endsAt = "2026-07-23T10:06:00.000Z";
  chainedTimeline.totalSeconds = 360;
  chainedTimeline.steps = [
    clone(timeline.steps[0]),
    clone(timeline.steps[1]),
    {
      ...clone(timeline.steps[2]),
      id: "seaweed-egg-soup:step:passive-2",
      attention: "passive",
      resources: ["pot"],
      dependsOn: [timeline.steps[1].id],
      startOffsetSeconds: 180,
      endOffsetSeconds: 300,
      startsAt: "2026-07-23T10:03:00.000Z",
      endsAt: "2026-07-23T10:05:00.000Z",
      timerLabel: "继续焖煮",
    },
    {
      ...clone(timeline.steps[3]),
      id: "seaweed-egg-soup:step:finish",
      dependsOn: ["seaweed-egg-soup:step:passive-2"],
      startOffsetSeconds: 300,
      endOffsetSeconds: 360,
      startsAt: "2026-07-23T10:05:00.000Z",
      endsAt: "2026-07-23T10:06:00.000Z",
    },
  ];
  const cooking = remoteRun({
    id: "run-passive-chain",
    status: "cooking",
    timeline: chainedTimeline,
    currentStepId: chainedTimeline.steps[1].id,
    timers: {
      [chainedTimeline.steps[1].id]: {
        stepId: chainedTimeline.steps[1].id,
        startedAt: chainedTimeline.steps[1].startsAt,
        endsAt: chainedTimeline.steps[1].endsAt,
      },
    },
    timerEndsAt: chainedTimeline.steps[1].endsAt,
  });
  const sharedStorage = new Map();
  const offline = createRuntime({
    initialRun: cooking,
    storage: sharedStorage,
    userId: "passive-chain-member",
    online: false,
    now: "2026-07-23T10:03:00.000Z",
  });
  const offlinePage = offline.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await offlinePage.onLoad({ mealRunId: cooking.id });
  await offline.settle();
  assert.equal(
    offlinePage.data.mealRun.currentStepId,
    chainedTimeline.steps[2].id,
    "an unlocked passive successor is advanced automatically without asking the user to tap a waiting step",
  );
  assert.deepEqual(
    offlinePage.data.runningTimers.map((item) => item.id),
    [chainedTimeline.steps[2].id],
    "the successor absolute timer starts from its authoritative endsAt",
  );
  assert.equal(offlinePage.data.unsyncedCount, 1, "automatic offline progress is persisted through the same safe queue");

  const restarted = createRuntime({
    initialRun: cooking,
    storage: sharedStorage,
    userId: "passive-chain-member",
    online: false,
    now: "2026-07-23T10:03:30.000Z",
  });
  const restartedPage = restarted.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await restartedPage.onLoad({ mealRunId: cooking.id });
  assert.equal(restartedPage.data.mealRun.currentStepId, chainedTimeline.steps[2].id, "automatic passive progress survives restart");
  assert.equal(restartedPage.data.unsyncedCount, 1, "restart never duplicates the automatic mutation");

  const backgroundRuntime = createRuntime({
    initialRun: cooking,
    now: "2026-07-23T10:02:30.000Z",
  });
  const backgroundPage = backgroundRuntime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await backgroundPage.onLoad({ mealRunId: cooking.id });
  await backgroundPage.onShow();
  assert.equal(backgroundPage.data.mealRun.currentStepId, chainedTimeline.steps[1].id);
  backgroundPage.onHide();
  backgroundRuntime.advanceClock(30_000);
  await backgroundPage.onShow();
  assert.equal(backgroundPage.data.mealRun.currentStepId, chainedTimeline.steps[2].id, "foreground recovery drains a newly unlocked passive successor");
}

async function verifyCertifiedAutoPassiveCases() {
  const catalogRuntime = createRuntime({ initialRun: remoteRun({ status: "planned" }) });
  const recipes = catalogRuntime.load("miniprogram/data/certified-recipes.js");
  const { buildMealTimeline } = catalogRuntime.load("miniprogram/utils/meal-timeline.js");
  const idsByTier = new Map();
  for (const recipe of recipes) {
    const ids = idsByTier.get(recipe.cookAssist.effortTier) || [];
    ids.push(recipe.id);
    idsByTier.set(recipe.cookAssist.effortTier, ids);
  }
  const cases = recipes.map((recipe) => [recipe.id]);
  for (const ids of idsByTier.values()) {
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) cases.push([ids[left], ids[right]]);
    }
  }
  const consecutivePassiveCases = [];
  for (const recipeIds of cases) {
    const candidateTimeline = buildMealTimeline(recipeIds, { startedAt: "2026-07-23T10:00:00.000Z" });
    for (let index = 0; index < candidateTimeline.steps.length - 1; index += 1) {
      if (candidateTimeline.steps[index].attention === "passive" && candidateTimeline.steps[index + 1].attention === "passive") {
        consecutivePassiveCases.push({ recipeIds, candidateTimeline, index });
      }
    }
  }
  assert.equal(consecutivePassiveCases.length, 5, "the certified 30-recipe/165-case catalog currently has five real passive-chain presentations");
  for (const [caseIndex, contract] of consecutivePassiveCases.entries()) {
    const current = contract.candidateTimeline.steps[contract.index];
    const successor = contract.candidateTimeline.steps[contract.index + 1];
    const cooking = remoteRun({
      id: `run-real-passive-${caseIndex}`,
      status: "cooking",
      recipeIds: contract.recipeIds,
      timeline: contract.candidateTimeline,
      currentStepId: current.id,
      timers: actualTimersThrough(contract.candidateTimeline, current.id),
      timerEndsAt: current.endsAt,
    });
    const runtime = createRuntime({ initialRun: cooking, now: successor.startsAt });
    const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
    await page.onLoad({ mealRunId: cooking.id });
    assert.equal(
      page.data.mealRun.currentStepId,
      successor.id,
      `${contract.recipeIds.join("+")}: real certified passive chain advances`,
    );
    assert(
      runtime.requests.some((request) => (
        request.path.endsWith("/progress")
        && request.data.currentStepId === successor.id
        && request.data.timer?.stepId === successor.id
        && request.data.timer?.startedAt === successor.startsAt
        && request.data.timer?.endsAt === successor.endsAt
      )),
      `${contract.recipeIds.join("+")}: automatic progress starts the successor's actual full-duration timer`,
    );
  }
}

async function verifyRapidTapAndMonotonicProgress() {
  let active = remoteRun({ status: "cooking" });
  let resolveProgress;
  let progressCalls = 0;
  const runtime = createRuntime({
    initialRun: active,
    requestHandler: ({ path: pathname, data, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) return succeed({ mealRun: active });
      if (pathname.endsWith("/progress")) {
        progressCalls += 1;
        resolveProgress = () => succeed({
          mealRun: {
            ...active,
            currentStepId: data.currentStepId,
            timers: data.timer ? { [data.timer.stepId]: data.timer } : {},
            timerEndsAt: data.timer?.endsAt || "",
          },
        });
        return;
      }
      throw new Error(`Unexpected request: ${pathname}`);
    },
  });
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: active.id });
  const first = page.advanceStep({ currentTarget: { dataset: { stepId: timeline.steps[0].id } } });
  const second = page.advanceStep({ currentTarget: { dataset: { stepId: timeline.steps[0].id } } });
  await Promise.resolve();
  assert.equal(progressCalls, 1, "rapid progress taps share one mutation");
  resolveProgress();
  await Promise.all([first, second]);

  const { chooseMonotonicMealRun } = runtime.load("miniprogram/packageCooking/pages/cooking/index.js");
  const later = { ...active, currentStepId: timeline.steps[2].id };
  const stale = { ...active, currentStepId: timeline.steps[1].id };
  assert.equal(chooseMonotonicMealRun(later, stale).currentStepId, timeline.steps[2].id);
  const authoritativeTimer = {
    stepId: timeline.steps[1].id,
    startedAt: "2026-07-23T10:02:00.000Z",
    endsAt: "2026-07-23T10:04:00.000Z",
  };
  const conflictingLocalTimer = {
    stepId: timeline.steps[1].id,
    startedAt: "2026-07-23T10:01:00.000Z",
    endsAt: "2026-07-23T10:03:00.000Z",
  };
  const converged = chooseMonotonicMealRun(
    { ...later, timers: { [conflictingLocalTimer.stepId]: conflictingLocalTimer } },
    { ...stale, timers: { [authoritativeTimer.stepId]: authoritativeTimer } },
  );
  assert.deepEqual(
    converged.timers[authoritativeTimer.stepId],
    authoritativeTimer,
    "an authoritative server timer wins even when its cursor snapshot is behind optimistic local progress",
  );
}

async function verifyOfflineRecoveryAndAccountIsolation() {
  const cooking = remoteRun({ status: "cooking" });
  const sharedStorage = new Map();
  const runtime = createRuntime({
    initialRun: cooking,
    storage: sharedStorage,
    userId: "member-a",
    online: false,
  });
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: cooking.id });
  await page.advanceStep({ currentTarget: { dataset: { stepId: timeline.steps[0].id } } });
  assert.equal(page.data.unsyncedCount, 1);
  assert.equal(page.data.showBackWarning, true);
  const accountAQueue = sharedStorage.get("humi:offline-queue:v1:member-a");
  assert.equal(accountAQueue.length, 1);
  assert.equal(accountAQueue[0].type, "meal_progress");
  assert.equal(accountAQueue[0].data.currentStepId, timeline.steps[1].id);

  const accountB = createRuntime({
    initialRun: { ...cooking, id: "run-b" },
    storage: sharedStorage,
    userId: "member-b",
    online: false,
  });
  const pageB = accountB.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await pageB.onLoad({ mealRunId: "run-b" });
  assert.equal(pageB.data.unsyncedCount, 0, "another account cannot see pending progress");
  assert.equal(pageB.data.mealRun.currentStepId, timeline.steps[0].id, "another account cannot see account A's optimistic progress");

  const restartedA = createRuntime({
    initialRun: cooking,
    storage: sharedStorage,
    userId: "member-a",
    online: false,
  });
  const restartedPage = restartedA.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await restartedPage.onLoad({ mealRunId: cooking.id });
  assert.equal(restartedPage.data.mealRun.currentStepId, timeline.steps[1].id, "offline process restart restores the user/household/date scoped optimistic step");

  let serverRun = clone(cooking);
  const serverCalls = [];
  const reconnectHandler = requestRouter({
    getRun: () => serverRun,
    setRun: (value) => { serverRun = value; },
    calls: serverCalls,
  });
  const appFirstA = createRuntime({
    initialRun: cooking,
    storage: sharedStorage,
    userId: "member-a",
    online: true,
    requestHandler: reconnectHandler,
  });
  const appFirstQueue = appFirstA.load("miniprogram/utils/offline-queue.js");
  assert.equal((await appFirstQueue.flushMutationQueue()).status, "flushed", "App may flush before the cooking page is created");
  assert.equal(appFirstQueue.readQueue().length, 0);

  const resumedA = createRuntime({
    initialRun: cooking,
    storage: sharedStorage,
    userId: "member-a",
    online: true,
    requestHandler: reconnectHandler,
  });
  const resumedPage = resumedA.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await resumedPage.onLoad({ mealRunId: cooking.id });
  await resumedA.settle();
  await resumedA.settle();
  assert.equal(resumedPage.data.mealRun.currentStepId, timeline.steps[1].id, "cold page load consumes the App-first replay result instead of regressing");
  assert.equal(resumedPage.data.unsyncedCount, 0);
  assert.equal(resumedPage.data.showBackWarning, false);
  assert(
    appFirstA.requests.some((request) => request.path.endsWith("/progress") && request.data.currentStepId === timeline.steps[1].id),
    `App-first reconnect replays the allowlisted progress endpoint: ${JSON.stringify(appFirstA.requests)}`,
  );
}

async function verifyCompletedReceiptFeedbackRefresh() {
  const storage = new Map();
  const cooking = remoteRun({ id: "run-completed-receipt", status: "cooking" });
  let serverRun = clone(cooking);
  const offline = createRuntime({
    initialRun: cooking,
    storage,
    userId: "receipt-member",
    online: false,
  });
  const offlinePage = offline.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await offlinePage.onLoad({ mealRunId: cooking.id });
  await offlinePage.completeMeal();
  assert.equal(offlinePage.data.unsyncedCount, 1);

  const requestHandler = ({ path: pathname, data, succeed }) => {
    if (pathname.startsWith("/meal-runs/current")) return succeed({ mealRun: serverRun });
    if (pathname.endsWith("/complete")) {
      serverRun = {
        ...serverRun,
        status: "completed",
        completedAt: "2026-07-23T10:04:00.000Z",
        updatedAt: "2026-07-23T10:04:00.000Z",
        timerEndsAt: "",
      };
      return succeed({ mealRun: serverRun });
    }
    if (pathname.endsWith("/feedback")) {
      serverRun = {
        ...serverRun,
        feedback: [{ userId: "receipt-member", value: data.value }],
        updatedAt: "2026-07-23T10:05:00.000Z",
      };
      return succeed({ mealRun: serverRun });
    }
    throw new Error(`Unexpected request: ${pathname}`);
  };
  const appFirst = createRuntime({
    initialRun: cooking,
    storage,
    userId: "receipt-member",
    requestHandler,
  });
  await appFirst.load("miniprogram/utils/offline-queue.js").flushMutationQueue();

  const feedbackRuntime = createRuntime({
    initialRun: serverRun,
    storage,
    userId: "receipt-member",
    requestHandler,
  });
  const feedbackPage = feedbackRuntime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await feedbackPage.onLoad({ mealRunId: cooking.id });
  assert.equal(feedbackPage.data.mealRun.status, "completed");
  await feedbackPage.saveFeedback({ detail: { value: "want_again" } });
  assert.equal(feedbackPage.data.feedbackValue, "want_again");

  const coldRuntime = createRuntime({
    initialRun: serverRun,
    storage,
    userId: "receipt-member",
    requestHandler,
  });
  const coldPage = coldRuntime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await coldPage.onLoad({ mealRunId: cooking.id });
  assert.equal(coldPage.data.feedbackValue, "want_again", "server feedback supersedes the older completed replay receipt after cold launch");
}

async function verifyOfflineAbandonReasons() {
  for (const reason of ["too_much_effort", "missing_ingredients", "plans_changed", "cooking_failed"]) {
    const storage = new Map();
    const cooking = remoteRun({ id: `run-${reason}`, status: "cooking" });
    const offline = createRuntime({
      initialRun: cooking,
      storage,
      userId: "member-abandon",
      online: false,
    });
    const offlinePage = offline.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
    await offlinePage.onLoad({ mealRunId: cooking.id });
    await offlinePage.abandon({ currentTarget: { dataset: { reason } } });
    assert.equal(offlinePage.data.unsyncedCount, 1, `${reason} is queued offline`);
    assert.equal(offlinePage.data.mealRun.status, "cooking", "queued abandon does not count as a terminal server state");

    let serverRun = clone(cooking);
    const replayHandler = requestRouter({
      getRun: () => serverRun,
      setRun: (value) => { serverRun = value; },
      calls: [],
    });
    const appFirst = createRuntime({
      initialRun: cooking,
      storage,
      userId: "member-abandon",
      online: true,
      requestHandler: replayHandler,
    });
    const appQueue = appFirst.load("miniprogram/utils/offline-queue.js");
    assert.equal((await appQueue.flushMutationQueue()).status, "flushed", `${reason} may be replayed by App before Page`);
    assert.equal(appQueue.readQueue().length, 0);

    const online = createRuntime({
      initialRun: cooking,
      storage,
      userId: "member-abandon",
      online: true,
      requestHandler: replayHandler,
    });
    const onlinePage = online.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
    await onlinePage.onLoad({ mealRunId: cooking.id });
    assert.equal(onlinePage.data.mealRun.status, "abandoned", `${reason} converges from replay response`);
    assert.equal(onlinePage.data.mealRun.abandonReason, reason);
    assert.equal(onlinePage.data.unsyncedCount, 0);
  }
}

async function verifyAllDowngrades() {
  for (const [uiAction, apiAction] of [
    ["drop_side", "remove_optional_side"],
    ["lower_effort_recipe", "lower_effort_recipe"],
    ["ready_staple", "ready_staple"],
  ]) {
    let active = remoteRun({ status: "cooking" });
    const calls = [];
    const replacementTimeline = {
      ...timeline,
      recipeIds: ["tomato-egg"],
      steps: [timeline.steps[0]],
      totalSeconds: 60,
      endsAt: timeline.steps[0].endsAt,
    };
    const runtime = createRuntime({
      initialRun: active,
      requestHandler: ({ path: pathname, data, succeed }) => {
        calls.push({ path: pathname, data: clone(data) });
        if (pathname.startsWith("/meal-runs/current")) return succeed({ mealRun: active });
        if (pathname.endsWith("/downgrade")) {
          active = {
            ...active,
            timeline: replacementTimeline,
            recipeIds: ["tomato-egg"],
            currentStepId: timeline.steps[0].id,
            downgrades: [{ action: apiAction }],
          };
          return succeed({ mealRun: active });
        }
        throw new Error(`Unexpected request: ${pathname}`);
      },
    });
    const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
    await page.onLoad({ mealRunId: active.id });
    await page.downgrade({ currentTarget: { dataset: { action: uiAction } } });
    assert.equal(calls.at(-1).data.action, apiAction);
    assert.equal(page.data.mealRun.timeline.steps.length, 1, "authenticated downgrade uses the server snapshot");
  }
}

async function verifyNetworkRaceQueuesMutation() {
  const cooking = remoteRun({ status: "cooking" });
  const runtime = createRuntime({
    initialRun: cooking,
    online: true,
    requestHandler: ({ path: pathname, succeed, fail }) => {
      if (pathname.startsWith("/meal-runs/current")) return succeed({ mealRun: cooking });
      if (pathname.endsWith("/progress")) return fail();
      throw new Error(`Unexpected request: ${pathname}`);
    },
  });
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: cooking.id });
  await page.advanceStep({ currentTarget: { dataset: { stepId: timeline.steps[0].id } } });
  assert.equal(page.data.unsyncedCount, 1, "a request-time network loss queues the safe mutation");
  assert.equal(page.data.mealRun.currentStepId, timeline.steps[1].id);
}

async function verifyOfflinePlannedRunStaysActionable() {
  const planned = remoteRun({ status: "planned" });
  const runtime = createRuntime({ initialRun: planned, online: false });
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: planned.id, action: "start" });
  assert.equal(page.data.status, "ready");
  assert.equal(page.data.viewState, "planned");
  assert.match(page.data.errorText, /联网|网络/);
}

async function verifyConflictFreezeAndReload() {
  let progressCalls = 0;
  const initial = remoteRun({ status: "cooking" });
  const latest = remoteRun({ status: "cooking", currentStepId: timeline.steps[2].id });
  const runtime = createRuntime({
    initialRun: initial,
    requestHandler: ({ path: pathname, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) return succeed({ mealRun: initial });
      if (pathname.endsWith("/progress")) {
        progressCalls += 1;
        return succeed({
          error: "state_conflict",
          latestEnvelope: bootstrapFor({ currentMealRun: latest }),
        }, 409);
      }
      throw new Error(`Unexpected request: ${pathname}`);
    },
  });
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: latest.id });
  await page.advanceStep({ currentTarget: { dataset: { stepId: timeline.steps[0].id } } });
  assert.equal(page.data.syncFrozen, true);
  assert.equal(page.data.errorText, "家里的安排刚刚有更新，请确认最新进度");
  assert.equal(page.data.mealRun.currentStepId, timeline.steps[2].id);
  await page.advanceStep({ currentTarget: { dataset: { stepId: timeline.steps[2].id } } });
  assert.equal(progressCalls, 1, "a conflict freezes later mutations");
}

async function verifyOfflineEpochConflictConverges() {
  const initial = remoteRun({ id: "run-epoch-recovery", status: "cooking", timelineVersion: 1 });
  const latest = remoteRun({
    ...initial,
    timelineVersion: 2,
    recipeIds: ["tomato-egg"],
    currentStepId: timeline.steps[0].id,
    timers: {},
    downgrades: [{ action: "lower_effort_recipe" }],
  });
  let serverRun = initial;
  const calls = [];
  const runtime = createRuntime({
    initialRun: initial,
    online: false,
    requestHandler: ({ path: pathname, method, data, succeed }) => {
      calls.push({ path: pathname, method, data: clone(data) });
      if (pathname.startsWith("/meal-runs/current")) return succeed({ mealRun: serverRun });
      if (pathname.endsWith("/progress")) {
        if (Number(data.timelineVersion) !== Number(serverRun.timelineVersion)) {
          return succeed({ error: "meal_timeline_version_conflict" }, 409);
        }
        serverRun = { ...serverRun, currentStepId: data.currentStepId };
        return succeed({ mealRun: serverRun });
      }
      if (pathname.endsWith("/complete")) {
        assert.equal(data.timelineVersion, 2, "serving after recovery must confirm the authoritative epoch");
        serverRun = { ...serverRun, status: "completed" };
        return succeed({ mealRun: serverRun });
      }
      throw new Error(`Unexpected request: ${method} ${pathname}`);
    },
  });
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: initial.id });
  await page.advanceStep({ detail: { stepId: initial.currentStepId } });
  await page.completeMeal();
  const queue = runtime.load("miniprogram/utils/offline-queue.js");
  assert.deepEqual(
    Array.from(queue.readQueue(), (action) => action.type),
    ["meal_progress", "meal_complete"],
    "offline progress and serving remain ordered in the old epoch",
  );

  serverRun = latest;
  runtime.setOnline(true);
  await runtime.settle();
  await runtime.settle();
  assert.equal(page.data.mealRun.timelineVersion, 2, "reconnect adopts the authoritative timeline epoch");
  assert.equal(page.data.syncFrozen, false, "an obsolete progress action never permanently freezes cooking");
  assert.deepEqual(Array.from(queue.readQueue()), [], "old progress and its dependent completion are removed");
  assert.match(page.data.errorText, /重新确认上桌/, "a discarded stale completion asks for a fresh explicit confirmation");
  assert.equal(calls.filter((call) => call.path.endsWith("/complete")).length, 0, "old dishes never complete a replacement timeline");

  await page.completeMeal();
  assert.equal(page.data.mealRun.status, "completed");
  assert.equal(calls.filter((call) => call.path.endsWith("/complete")).length, 1);

  const coldLatest = remoteRun({
    id: "run-cold-epoch-recovery",
    status: "cooking",
    timelineVersion: 2,
    recipeIds: ["tomato-egg"],
    downgrades: [{ action: "lower_effort_recipe" }],
  });
  const coldRuntime = createRuntime({
    initialRun: { ...coldLatest, timelineVersion: 1, recipeIds: [...timeline.recipeIds], downgrades: [] },
    online: false,
    requestHandler: ({ path: pathname, data, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) return succeed({ mealRun: coldLatest });
      if (pathname.endsWith("/progress")) {
        assert.equal(data.timelineVersion, 1);
        return succeed({ error: "meal_timeline_version_conflict" }, 409);
      }
      throw new Error(`Unexpected cold recovery request: ${pathname}`);
    },
  });
  const coldQueue = coldRuntime.load("miniprogram/utils/offline-queue.js");
  coldQueue.enqueueMutation({
    id: "cold-progress-v1",
    type: "meal_progress",
    householdId: coldLatest.householdId,
    mealRunId: coldLatest.id,
    createdAt: 1,
    data: { currentStepId: timeline.steps[1].id, timelineVersion: 1 },
  });
  coldQueue.enqueueMutation({
    id: "cold-complete-v1",
    type: "meal_complete",
    householdId: coldLatest.householdId,
    mealRunId: coldLatest.id,
    createdAt: 2,
    data: { timelineVersion: 1 },
  });
  coldRuntime.setOnline(true);
  const bootRecovery = await coldQueue.flushMutationQueue();
  assert.equal(bootRecovery.status, "timeline_conflict");
  assert.deepEqual(Array.from(coldQueue.readQueue()), [], "cold-start replay cannot retain an obsolete epoch");
  const coldPage = coldRuntime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await coldPage.onLoad({ mealRunId: coldLatest.id });
  assert.equal(coldPage.data.mealRun.timelineVersion, 2);
  assert.equal(coldPage.data.syncFrozen, false, "cold-start recovery opens the authoritative timeline without a freeze");
}

async function verifyConflictReplacementGuidance() {
  const initial = remoteRun({ id: "old-run", status: "cooking" });
  const replacement = remoteRun({ id: "new-run", status: "planned", timeline: null, currentStepId: "" });
  const runtime = createRuntime({
    initialRun: initial,
    requestHandler: ({ path: pathname, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) return succeed({ mealRun: initial });
      if (pathname.endsWith("/progress")) {
        return succeed({
          error: "state_conflict",
          latestEnvelope: bootstrapFor({ currentMealRun: replacement }),
        }, 409);
      }
      throw new Error(`Unexpected request: ${pathname}`);
    },
  });
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: initial.id });
  await page.advanceStep({ currentTarget: { dataset: { stepId: timeline.steps[0].id } } });
  assert.equal(page.data.replacementDetected, true);
  assert.equal(page.data.mealRun.id, replacement.id, "a 409 never presents the replaced run as latest");
  assert.equal(page.data.viewState, "replaced");
  page.goToLatestPlan();
  assert.deepEqual(runtime.routes.at(-1), { kind: "reLaunch", url: "/pages/tonight/index" });
}

async function verifyCrossDeviceAbandonConflict() {
  const initial = remoteRun({ id: "run-cross-device-abandon", status: "cooking" });
  const abandoned = {
    ...initial,
    status: "abandoned",
    abandonReason: "plans_changed",
    abandonedAt: "2026-07-23T10:02:00.000Z",
    updatedAt: "2026-07-23T10:02:00.000Z",
    timerEndsAt: "",
  };
  let abandonedOnServer = false;
  const runtime = createRuntime({
    initialRun: initial,
    requestHandler: ({ path: pathname, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) {
        if (pathname.includes("mealRunId=")) return succeed({ mealRun: abandonedOnServer ? abandoned : initial });
        return succeed({ mealRun: abandonedOnServer ? null : initial });
      }
      if (pathname.endsWith("/progress")) {
        abandonedOnServer = true;
        return succeed({
          error: "state_conflict",
          latestEnvelope: bootstrapFor({ currentMealRun: null }),
        }, 409);
      }
      throw new Error(`Unexpected request: ${pathname}`);
    },
  });
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: initial.id });
  await page.advanceStep({ detail: { stepId: initial.currentStepId } });
  assert.equal(page.data.syncFrozen, true);
  assert.equal(page.data.mealRun.status, "abandoned", "409 reloads the exact cross-device terminal snapshot instead of stale cooking");
  assert.equal(page.data.mealRun.abandonReason, "plans_changed");
  assert.equal(page._clock, null);
}

async function verifyGuestLifecycle() {
  const sharedStorage = new Map();
  const ownerUserId = "guest-cook";
  const dateKey = "2026-07-23";
  const guest = guestRun({ ownerUserId, dateKey });
  sharedStorage.set(`humi:meal-run:guest:v1:${ownerUserId}:${dateKey}`, guest);
  const runtime = createRuntime({
    initialRun: guest,
    storage: sharedStorage,
    userId: ownerUserId,
    householdId: "",
  });
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: guest.id, action: "start" });
  assert.equal(page.data.mealRun.status, "cooking");
  assert.equal(page.data.mealRun.localOnly, true);
  await page.downgrade({ currentTarget: { dataset: { action: "ready_staple" } } });
  assert.equal(page.data.mealRun.readyStaple, "即食米饭");
  await page.completeMeal();
  assert.equal(page.data.mealRun.status, "completed");
  await page.saveFeedback({ detail: { value: "too_hard" } });
  assert.equal(page.data.feedbackValue, "too_hard");
  assert.equal(runtime.requests.length, 0, "guest cooking stays local");
}

async function verifyMemberPermissionsAndCompletedReadOnly() {
  let active = remoteRun({ status: "planned" });
  const calls = [];
  const runtime = createRuntime({
    initialRun: active,
    role: "member",
    requestHandler: requestRouter({
      getRun: () => active,
      setRun: (value) => { active = value; },
      calls,
    }),
  });
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: active.id, action: "start" });
  assert.equal(page.data.mealRun.status, "cooking", "formal members can start");
  await page.abandon({ currentTarget: { dataset: { reason: "plans_changed" } } });
  assert.equal(page.data.mealRun.status, "abandoned", "formal members can abandon");
  assert.equal(page._clock, null, "abandon stops the page timer immediately");

  const completed = remoteRun({ status: "completed", completedAt: "2026-07-23T10:04:00.000Z" });
  const readOnlyRuntime = createRuntime({ initialRun: completed });
  const readOnlyPage = readOnlyRuntime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await readOnlyPage.onLoad({ mealRunId: completed.id, action: "start" });
  await readOnlyPage.advanceStep({ currentTarget: { dataset: { stepId: timeline.steps[0].id } } });
  await readOnlyPage.completeMeal();
  assert.equal(readOnlyRuntime.requests.filter((item) => item.method !== "GET").length, 0, "completed dinner is read-only");
}

async function verifyRetryRecovery() {
  const cooking = remoteRun({ status: "cooking" });
  let attempts = 0;
  const runtime = createRuntime({
    initialRun: cooking,
    requestHandler: ({ path: pathname, succeed }) => {
      if (!pathname.startsWith("/meal-runs/current")) throw new Error(`Unexpected request: ${pathname}`);
      attempts += 1;
      if (attempts <= 2) return succeed({ error: "request_failed" }, 500);
      return succeed({ mealRun: cooking });
    },
  });
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: cooking.id });
  assert.equal(page.data.status, "error");
  await assert.doesNotReject(() => page.retry());
  assert.equal(page.data.status, "error", "a retry failure returns to a retryable error state");
  await page.retry();
  assert.equal(page.data.status, "ready");
  assert.equal(page.data.mealRun.status, "cooking");
  assert(page._clock, "successful retry restarts the absolute-time refresh clock");
}

function verifyPresentationContracts() {
  const pageWxml = readFileSync(path.join(root, "miniprogram/packageCooking/pages/cooking/index.wxml"), "utf8");
  const pageJson = JSON.parse(readFileSync(path.join(root, "miniprogram/packageCooking/pages/cooking/index.json"), "utf8"));
  for (const [index, line] of pageWxml.split("\n").entries()) {
    if (line.includes("wx:if=") || line.includes("wx:elif=")) {
      assert.match(line, /wx:(?:if|elif)="\{\{.*\}\}"/, `WXML conditional on line ${index + 1} must close its quoted expression`);
    }
  }
  assert.match(pageWxml, /<cooking-step/);
  assert.match(pageWxml, /step="\{\{currentActiveStep\}\}"/, "the action card must render only an active step");
  assert.doesNotMatch(pageWxml, /step="\{\{currentStep\}\}"/, "the passive cursor must never masquerade as the action card");
  assert.match(pageWxml, /先等计时结束/, "a blocked passive cursor has an explicit waiting state");
  assert.match(pageWxml, /<absolute-timer/);
  assert.match(pageWxml, /<meal-feedback/);
  assert.match(pageWxml, />上桌了</);
  assert.match(pageWxml, /太累了/);
  assert.match(pageWxml, /网络/);
  assert.equal(pageJson.usingComponents["cooking-step"], "/components/cooking-step/index");
  assert.equal(pageJson.usingComponents["absolute-timer"], "/components/absolute-timer/index");
  assert.equal(pageJson.usingComponents["meal-feedback"], "/components/meal-feedback/index");
  const source = readFileSync(path.join(root, "miniprogram/packageCooking/pages/cooking/index.js"), "utf8");
  assert(!/setInterval\([^)]*remaining/i.test(source), "timers must derive remaining time from endsAt");
  assert(!/\bAI\b|generateInstruction|生成.*步骤/i.test(source), "runtime cooking instructions must not use AI");
}

function requestRouter({ getRun, setRun, calls }) {
  return ({ path: pathname, method, data, succeed }) => {
    calls.push({ path: pathname, method, data: clone(data) });
    let run = getRun();
    if (pathname.startsWith("/meal-runs/current")) return succeed({ mealRun: run });
    if (pathname.endsWith("/start")) {
      run = { ...run, status: "cooking", timeline, currentStepId: timeline.steps[0].id, timers: {}, startedAt: timeline.startedAt };
    } else if (pathname.endsWith("/progress")) {
      run = {
        ...run,
        currentStepId: data.currentStepId,
        timers: data.timer
          ? { ...(run.timers || {}), [data.timer.stepId]: data.timer }
          : run.timers || {},
        timerEndsAt: data.timer?.endsAt || run.timerEndsAt || "",
      };
    } else if (pathname.endsWith("/complete")) {
      run = { ...run, status: "completed", completedAt: "2026-07-23T10:04:00.000Z", timerEndsAt: "" };
    } else if (pathname.endsWith("/feedback")) {
      run = { ...run, feedback: [{ userId: "owner-1", value: data.value }] };
    } else if (pathname.endsWith("/abandon")) {
      run = { ...run, status: "abandoned", abandonReason: data.reason };
    } else {
      throw new Error(`Unexpected request: ${method} ${pathname}`);
    }
    setRun(run);
    succeed({ mealRun: run });
  };
}

function createRuntime({
  initialRun,
  storage = new Map(),
  userId = "owner-1",
  householdId = "home-1",
  role = "owner",
  online = true,
  now = "2026-07-23T10:00:00.000Z",
  requestHandler,
} = {}) {
  let nowMs = Date.parse(now);
  let currentRun = clone(initialRun);
  const requests = [];
  const routes = [];
  const networkListeners = [];
  const modules = new Map();
  let pageDefinition;
  const session = {
    accessToken: `token-${userId}`,
    expiresAt: Date.parse("2026-07-24T10:00:00.000Z"),
    user: { id: userId, profileStatus: "complete" },
  };
  const bootstrap = bootstrapFor({ userId, householdId, role, currentMealRun: currentRun });
  storage.set("humi:native-session:v1", session);
  const app = {
    globalData: { humiSession: session, nativeShellCandidate: true },
    setHumiSession(next) { this.globalData.humiSession = next; },
    clearHumiSession() { this.globalData.humiSession = null; },
  };
  class FakeDate extends Date {
    constructor(value) {
      super(arguments.length ? value : nowMs);
    }
    static now() { return nowMs; }
  }
  const wx = {
    getStorageSync: (key) => clone(storage.get(key)),
    setStorageSync: (key, value) => storage.set(key, clone(value)),
    removeStorageSync: (key) => storage.delete(key),
    getNetworkType: ({ success }) => success({ networkType: online ? "wifi" : "none" }),
    onNetworkStatusChange: (listener) => networkListeners.push(listener),
    offNetworkStatusChange: (listener) => {
      const index = networkListeners.indexOf(listener);
      if (index >= 0) networkListeners.splice(index, 1);
    },
    showModal: ({ success }) => success?.({ confirm: true, cancel: false }),
    navigateBack: () => routes.push({ kind: "navigateBack" }),
    reLaunch: ({ url }) => routes.push({ kind: "reLaunch", url }),
    request: (options) => {
      const url = new URL(options.url);
      const call = {
        path: `${url.pathname}${url.search}`,
        method: String(options.method || "GET").toUpperCase(),
        data: clone(options.data),
      };
      requests.push(call);
      const succeed = (data, statusCode = 200) => options.success({ data: clone(data), statusCode });
      const fail = () => options.fail({ errMsg: "request:fail network" });
      if (!online) return fail();
      if (requestHandler) return requestHandler({ ...call, succeed, fail });
      if (call.path.startsWith("/meal-runs/current")) return succeed({ mealRun: currentRun });
      if (call.path.endsWith("/progress")) {
        currentRun = {
          ...currentRun,
          currentStepId: call.data.currentStepId,
          timers: call.data.timer
            ? { ...(currentRun.timers || {}), [call.data.timer.stepId]: call.data.timer }
            : currentRun.timers || {},
          timerEndsAt: call.data.timer?.endsAt || currentRun.timerEndsAt || "",
        };
        return succeed({ mealRun: currentRun });
      }
      if (call.path.endsWith("/abandon")) {
        currentRun = {
          ...currentRun,
          status: "abandoned",
          abandonReason: call.data.reason,
          timerEndsAt: "",
        };
        return succeed({ mealRun: currentRun });
      }
      throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    },
  };

  function load(relativePath) {
    const absolutePath = resolveModule(path.join(root, relativePath));
    if (modules.has(absolutePath)) return modules.get(absolutePath).exports;
    if (absolutePath.endsWith(".json")) return JSON.parse(readFileSync(absolutePath, "utf8"));
    const record = { exports: {} };
    modules.set(absolutePath, record);
    const context = vm.createContext({
      module: record,
      exports: record.exports,
      require: (specifier) => load(path.relative(root, resolveModule(path.resolve(path.dirname(absolutePath), specifier)))),
      wx,
      getApp: () => app,
      Page: (definition) => { pageDefinition = definition; },
      Component: () => {},
      console,
      Date: FakeDate,
      Math,
      Promise,
      Map,
      Set,
      JSON,
      URL,
      Uint8Array,
      encodeURIComponent,
      decodeURIComponent,
      setTimeout,
      clearTimeout,
      setInterval: () => 1,
      clearInterval: () => {},
    });
    new vm.Script(readFileSync(absolutePath, "utf8"), { filename: absolutePath }).runInContext(context);
    return record.exports;
  }
  const appStore = load("miniprogram/utils/store.js").appStore;
  appStore.resetSessionState(session);
  appStore.replaceBootstrap(bootstrap);
  return {
    requests,
    routes,
    load,
    loadPage(relativePath) {
      load(relativePath);
      return {
        ...pageDefinition,
        data: clone(pageDefinition.data),
        setData(patch) { this.data = { ...this.data, ...clone(patch) }; },
      };
    },
    advanceClock(ms) { nowMs += ms; },
    setOnline(value) {
      online = value;
      networkListeners.forEach((listener) => listener({ isConnected: value, networkType: value ? "wifi" : "none" }));
    },
    storageEntries: () => [...storage.entries()],
    settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

function bootstrapFor({
  userId = "owner-1",
  householdId = "home-1",
  role = "owner",
  currentMealRun = null,
} = {}) {
  return {
    schemaVersion: 1,
    stateVersion: "state-1",
    user: { id: userId, profileStatus: "complete" },
    activeHouseholdId: householdId,
    households: householdId ? [{ id: householdId, ownerId: role === "owner" ? userId : "some-owner", role }] : [],
    householdState: {},
    currentMealRun,
    capabilities: { nativeShellEnabled: true, mealExecutionEnabled: true },
  };
}

function remoteRun(patch = {}) {
  return {
    id: "run-1",
    householdId: "home-1",
    dateKey: "2026-07-23",
    mealSlot: "dinner",
    effortTier: "quick_15",
    recipeIds: [...timeline.recipeIds],
    recipeSnapshot: [],
    timelineVersion: 1,
    timeline: patch.status === "planned" ? null : clone(timeline),
    currentStepId: patch.status === "planned" ? "" : timeline.steps[0].id,
    timers: {},
    timerEndsAt: "",
    readyStaple: "",
    status: "cooking",
    feedback: [],
    downgrades: [],
    localOnly: false,
    ...patch,
  };
}

function guestRun({ ownerUserId, dateKey }) {
  return {
    ...remoteRun({ status: "planned", timeline: null, currentStepId: "" }),
    id: "guest:11111111-2222-4333-8444-555555555555",
    householdId: "guest",
    ownerUserId,
    dateKey,
    recipeIds: ["tomato-egg"],
    localOnly: true,
    createdBy: ownerUserId,
  };
}

function step(id, attention, startOffsetSeconds, endOffsetSeconds, dependsOn, resources) {
  return {
    id,
    recipeId: id.split(":step:")[0],
    recipeName: id.startsWith("tomato") ? "番茄炒蛋" : "紫菜蛋花汤",
    index: Number(id.split(":").at(-1)) - 1,
    text: `${id} instruction`,
    phase: "cook",
    durationSeconds: endOffsetSeconds - startOffsetSeconds,
    attention,
    resources,
    dependsOn,
    timerLabel: attention === "passive" ? "等待入味" : "",
    rescueTip: "",
    startOffsetSeconds,
    endOffsetSeconds,
    startsAt: new Date(Date.parse("2026-07-23T10:00:00.000Z") + startOffsetSeconds * 1000).toISOString(),
    endsAt: new Date(Date.parse("2026-07-23T10:00:00.000Z") + endOffsetSeconds * 1000).toISOString(),
  };
}

function actualTimersThrough(candidateTimeline, currentStepId) {
  const currentIndex = candidateTimeline.steps.findIndex((step) => step.id === currentStepId);
  return Object.fromEntries(candidateTimeline.steps
    .slice(0, currentIndex + 1)
    .filter((step) => step.attention === "passive")
    .map((step) => [step.id, {
      stepId: step.id,
      startedAt: step.startsAt,
      endsAt: step.endsAt,
    }]));
}

function resolveModule(candidate) {
  for (const option of [candidate, `${candidate}.js`, `${candidate}.json`]) {
    if (existsSync(option)) return option;
  }
  return candidate;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
