import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SESSION_KEY = "humi:native-session:v1";
const future = Date.now() + 60 * 60 * 1000;

await verifyGuestDecisionFlow();
await verifyReminderDeepLinkEntry();
await verifyAuthenticatedServerFlowAndPendingGuards();
await verifyTimeoutFallbackAndStateConflictRefresh();
await verifyLockedRecommendationLoadsCurrentRun();
await verifyRunRecoveryAndNavigation();
await verifyForegroundRunRefresh();
await verifyOwnerAndMemberPermissions();
await verifyGuestMergeAndAccountIsolation();
await verifyGuestMergeNetworkRecovery();
await verifyCookingGuestStateMigration();
await verifyCookingGuestConflictRecovery();
await verifyMealExecutionFlagRollback();
verifyInteractiveComponents();
verifyProductionTemplateContract();

console.log("Native Tonight decision flow checks passed.");

async function verifyReminderDeepLinkEntry() {
  const runtime = createRuntime({
    session: sessionFor("reminder-entry-user"),
    bootstrap: bootstrapFor({ userId: "reminder-entry-user" }),
  });
  const today = runtime.load("miniprogram/utils/meal-run.js").formatDinnerDateKey();
  const page = runtime.loadPage("miniprogram/pages/tonight/index.js");
  await page.onLoad({
    dateKey: today,
    effortTier: "easy_30",
    mealReminder: "reminder-entry-1",
    sourceMealRunId: "meal-source-1",
  });
  assert.equal(page.data.viewState, "choose_effort");
  assert.equal(page.data.effortTier, "easy_30", "a current-day reminder preselects only its legal effort tier");
  assert.equal(page.data.recommendation, null, "a reminder entry never starts recommendation automatically");
  assert.equal(page.data.mealRun, null, "a reminder entry never starts cooking automatically");
  assert.equal(runtime.routes.length, 0);

  for (const options of [
    {
      dateKey: "2000-01-01",
      effortTier: "normal",
      mealReminder: "old-reminder",
      sourceMealRunId: "old-meal",
    },
    {
      dateKey: today,
      effortTier: "not-a-tier",
      mealReminder: "bad-tier",
      sourceMealRunId: "meal-source",
    },
    {
      dateKey: today,
      effortTier: "normal",
      mealReminder: "../unsafe",
      sourceMealRunId: "meal-source",
    },
  ]) {
    const invalidRuntime = createRuntime({
      session: sessionFor(`invalid-reminder-${options.mealReminder}`),
      bootstrap: bootstrapFor({ userId: `invalid-reminder-${options.mealReminder}` }),
    });
    const invalidPage = invalidRuntime.loadPage("miniprogram/pages/tonight/index.js");
    await invalidPage.onLoad(options);
    assert.equal(invalidPage.data.effortTier, "", "illegal reminder parameters safely fall back to today's neutral choice");
    assert.equal(invalidPage.data.viewState, "choose_effort");
    assert.equal(invalidPage.data.recommendation, null);
  }
}

async function verifyGuestDecisionFlow() {
  const runtime = createRuntime({
    session: sessionFor("guest-user"),
    bootstrap: bootstrapFor({ userId: "guest-user" }),
  });
  const page = runtime.loadPage("miniprogram/pages/tonight/index.js");

  await page.onLoad();
  assert.equal(page.data.viewState, "choose_effort");
  assert.equal(page.data.effortOptions.length, 3);
  assert.deepEqual(
    plain(page.data.effortOptions.map(({ id, title }) => [id, title])),
    [
      ["quick_15", "15 分钟·只求开饭"],
      ["easy_30", "30 分钟·简单做"],
      ["normal", "正常做·今天有精力"],
    ],
  );

  await page.selectEffort({ currentTarget: { dataset: { tier: "quick_15" } } });
  assert.equal(page.data.viewState, "recommendation");
  assert.equal(page.data.recommendation.recipeIds.length, 1);
  assert.equal(page.data.plan.totalMinutes <= 15, true);
  assert.equal(page.data.plan.activeMinutes > 0, true);
  assert.equal(page.data.plan.cookwareCount > 0, true);
  assert(Array.isArray(page.data.plan.missingIngredients));
  const firstIds = [...page.data.recommendation.recipeIds];

  await page.nextRecommendation();
  assert.notDeepEqual(plain(page.data.recommendation.recipeIds), firstIds);

  await page.acceptRecommendation();
  assert.equal(page.data.viewState, "planned");
  assert.equal(page.data.mealRun.status, "planned");
  assert.equal(page.data.mealRun.localOnly, true);
  assert.match(page.data.mealRun.id, /^guest:[0-9a-f-]{36}$/);
  assert.equal(page.data.mealRun.recipeIds[0], page.data.recommendation.recipeIds[0]);
  assert.equal(runtime.requests.length, 0, "a household-free guest must remain local-only");

  const { buildDinnerPlan } = runtime.load("miniprogram/utils/meal-run.js");
  const twoDishPlan = buildDinnerPlan(
    recommendation("two-dish-plan", ["garlic-broccoli", "garlic-sprout-pork"], "local"),
    runtime.bootstrap,
  );
  assert(
    twoDishPlan.totalMinutes >= twoDishPlan.activeMinutes,
    "a two-dish plan must never claim less total time than hands-on work",
  );
}

async function verifyAuthenticatedServerFlowAndPendingGuards() {
  const recommendationA = recommendation("server-a", ["tomato-egg"], "server-state-a");
  const recommendationB = recommendation("server-b", ["chive-egg"], "server-state-b");
  let recommendationCalls = 0;
  let createCalls = 0;
  let releaseNext;
  const nextGate = new Promise((resolve) => { releaseNext = resolve; });
  const runtime = createRuntime({
    session: sessionFor("owner-a"),
    bootstrap: bootstrapFor({ userId: "owner-a", householdId: "home-a", role: "owner" }),
    requestHandler: async ({ path: pathname, method, data, succeed }) => {
      if (pathname === "/recommendations/dinner") {
        recommendationCalls += 1;
        if (data.action === "next") await nextGate;
        succeed(data.action === "next" ? recommendationB : recommendationA);
        return;
      }
      if (pathname === "/meal-runs" && method === "POST") {
        createCalls += 1;
        succeed({
          mealRun: remoteRun({
            id: "remote-planned-a",
            householdId: "home-a",
            recipeIds: data.recipeIds,
            effortTier: data.effortTier,
          }),
        }, 201);
        return;
      }
      throw new Error(`Unexpected request: ${method} ${pathname}`);
    },
  });
  const page = runtime.loadPage("miniprogram/pages/tonight/index.js");
  await page.onLoad();
  await page.selectEffort({ currentTarget: { dataset: { tier: "quick_15" } } });
  assert.equal(recommendationCalls, 1);
  assert.equal(page.data.recommendation.recommendationId, "server-a");

  const firstNext = page.nextRecommendation();
  const duplicateNext = page.nextRecommendation();
  assert.equal(page.data.pendingAction, "next");
  releaseNext();
  await Promise.all([firstNext, duplicateNext]);
  assert.equal(recommendationCalls, 2, "rapid recommendation taps must make one request");
  assert.equal(page.data.recommendation.recommendationId, "server-b");
  const nextRecommendationRequest = runtime.requests.find((item) => (
    item.path === "/recommendations/dinner" && item.data.action === "next"
  ));
  assert.equal(
    nextRecommendationRequest.header["X-Humi-Idempotency-Key"],
    `recommendation:${nextRecommendationRequest.data.dateKey}:quick_15:next:server-state-a`,
    "a replay key must identify the exact recommendation cursor it advances",
  );

  const firstAccept = page.acceptRecommendation();
  const duplicateAccept = page.acceptRecommendation();
  await Promise.all([firstAccept, duplicateAccept]);
  assert.equal(createCalls, 1, "rapid acceptance taps must create one MealRun");
  const createRequest = runtime.requests.find((item) => item.path === "/meal-runs");
  assert.equal(createRequest.data.idempotencyKey, "recommendation:server-b");
  assert.equal(createRequest.data.recommendationId, undefined);
  assert.deepEqual(createRequest.data.recipeIds, ["chive-egg"]);
  assert.equal(page.data.viewState, "planned");
}

async function verifyTimeoutFallbackAndStateConflictRefresh() {
  let calls = 0;
  const runtime = createRuntime({
    session: sessionFor("owner-timeout"),
    bootstrap: bootstrapFor({ userId: "owner-timeout", householdId: "home-timeout", role: "owner" }),
    requestHandler: ({ path: pathname, data, succeed, fail }) => {
      if (pathname !== "/recommendations/dinner") throw new Error(`Unexpected request: ${pathname}`);
      calls += 1;
      if (calls === 1) {
        fail();
        return;
      }
      if (calls === 2 && data.action === "next") {
        succeed({ error: "recommendation_state_conflict", latestStateVersion: "remote-new" }, 409);
        return;
      }
      succeed(recommendation("refreshed-current", ["chive-egg"], "remote-new"));
    },
  });
  const page = runtime.loadPage("miniprogram/pages/tonight/index.js");
  await page.onLoad();
  await page.selectEffort({ currentTarget: { dataset: { tier: "quick_15" } } });
  assert.equal(page.data.viewState, "recommendation");
  assert.equal(page.data.recommendation.source, "local_fallback");
  assert.equal(page.data.errorText, "");

  await page.nextRecommendation();
  assert.equal(calls, 3, "a recommendation cursor conflict must refresh the server current group");
  assert.equal(page.data.recommendation.recommendationId, "refreshed-current");
  assert.equal(page.data.recommendation.stateVersion, "remote-new");
}

async function verifyLockedRecommendationLoadsCurrentRun() {
  for (const [errorCode, remoteStatus, expectedViewState] of [
    ["meal_run_locked", "cooking", "resuming"],
    ["state_conflict", "completed", "completed"],
  ]) {
    let recommendationCalls = 0;
    let currentCalls = 0;
    const runtime = createRuntime({
      session: sessionFor(`member-lock-${errorCode}`),
      bootstrap: bootstrapFor({
        userId: `member-lock-${errorCode}`,
        householdId: `home-lock-${errorCode}`,
        role: "member",
      }),
      requestHandler: ({ path: pathname, data, succeed }) => {
        if (pathname === "/recommendations/dinner") {
          recommendationCalls += 1;
          if (data.action === "initial") {
            succeed(recommendation(`lock-${errorCode}`, ["tomato-egg"], `lock-state-${errorCode}`));
          } else {
            succeed({ error: errorCode }, 409);
          }
          return;
        }
        if (pathname.startsWith("/meal-runs/current")) {
          currentCalls += 1;
          succeed({
            mealRun: remoteRun({
              id: `member-started-${errorCode}`,
              householdId: `home-lock-${errorCode}`,
              status: remoteStatus,
            }),
          });
          return;
        }
        throw new Error(`Unexpected request: ${pathname}`);
      },
    });
    const page = runtime.loadPage("miniprogram/pages/tonight/index.js");
    await page.onLoad();
    await page.selectEffort({ currentTarget: { dataset: { tier: "quick_15" } } });
    await page.nextRecommendation();
    assert.equal(recommendationCalls, 2, `${errorCode} must not re-request an initial recommendation`);
    assert.equal(currentCalls, 1, `${errorCode} must load the current dinner`);
    assert.equal(page.data.viewState, expectedViewState);
    assert.equal(page.data.mealRun.id, `member-started-${errorCode}`);
  }
}

async function verifyRunRecoveryAndNavigation() {
  for (const [status, expectedState, expectedAction] of [
    ["planned", "planned", "start"],
    ["cooking", "resuming", "resume"],
    ["completed", "completed", "none"],
  ]) {
    const runtime = createRuntime({
      session: sessionFor(`member-${status}`),
      bootstrap: bootstrapFor({
        userId: `member-${status}`,
        householdId: "home-recovery",
        role: "member",
        currentMealRun: remoteRun({ id: `run-${status}`, householdId: "home-recovery", status }),
      }),
    });
    const page = runtime.loadPage("miniprogram/pages/tonight/index.js");
    await page.onLoad();
    assert.equal(page.data.viewState, expectedState);
    assert.equal(page.data.mealRun.status, status);
    if (expectedAction === "start") page.startCooking();
    if (expectedAction === "resume") page.resumeCooking();
    if (expectedAction === "none") {
      await page.selectEffort({ currentTarget: { dataset: { tier: "quick_15" } } });
      await page.nextRecommendation();
      await page.acceptRecommendation();
      assert.equal(runtime.routes.length, 0);
      assert.equal(page.data.viewState, "completed", "a completed dinner is read-only");
    } else {
      assert.deepEqual(runtime.routes, [{
        kind: "navigateTo",
        url: `/packageCooking/pages/cooking/index?mealRunId=run-${status}${expectedAction === "start" ? "&action=start" : ""}`,
      }]);
    }
  }
}

async function verifyForegroundRunRefresh() {
  let currentCalls = 0;
  const bootstrap = bootstrapFor({
    userId: "foreground-member",
    householdId: "foreground-home",
    role: "member",
    currentMealRun: remoteRun({ id: "foreground-run", householdId: "foreground-home", status: "planned" }),
  });
  const runtime = createRuntime({
    session: sessionFor("foreground-member"),
    bootstrap,
    requestHandler: ({ path: pathname, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) {
        currentCalls += 1;
        succeed({ mealRun: remoteRun({ id: "foreground-run", householdId: "foreground-home", status: "cooking" }) });
        return;
      }
      throw new Error(`Unexpected request: ${pathname}`);
    },
  });
  const page = runtime.loadPage("miniprogram/pages/tonight/index.js");
  await page.onLoad();
  assert.equal(page.data.viewState, "planned");
  await page.onShow();
  assert.equal(currentCalls, 0, "the initial onShow must not duplicate onLoad recovery");
  await page.onShow();
  assert.equal(currentCalls, 1);
  assert.equal(page.data.viewState, "resuming", "returning to Tonight must refresh a run changed in the cooking subpackage");
}

async function verifyOwnerAndMemberPermissions() {
  let createCalls = 0;
  const runtime = createRuntime({
    session: sessionFor("member-only"),
    bootstrap: bootstrapFor({ userId: "member-only", householdId: "home-member", role: "member" }),
    requestHandler: ({ path: pathname, data, succeed }) => {
      if (pathname === "/recommendations/dinner") {
        succeed(recommendation("member-rec", ["tomato-egg"], "member-state"));
        return;
      }
      if (pathname === "/meal-runs") {
        createCalls += 1;
        succeed({});
        return;
      }
      throw new Error(`Unexpected request: ${pathname}`);
    },
  });
  const page = runtime.loadPage("miniprogram/pages/tonight/index.js");
  await page.onLoad();
  await page.selectEffort({ currentTarget: { dataset: { tier: "quick_15" } } });
  assert.equal(page.data.canReplacePlan, false);
  await page.acceptRecommendation();
  assert.equal(createCalls, 0);
  assert.equal(page.data.viewState, "recommendation");
  assert.equal(page.data.errorText, "请让家庭创建者确定今晚菜单。");
}

async function verifyGuestMergeAndAccountIsolation() {
  const sharedStorage = new Map();
  const guestRuntime = createRuntime({
    storage: sharedStorage,
    session: sessionFor("guest-to-merge"),
    bootstrap: bootstrapFor({ userId: "guest-to-merge" }),
  });
  const guestMealRun = guestRuntime.load("miniprogram/utils/meal-run.js");
  const localRun = await guestMealRun.createMealRun({
    bootstrap: bootstrapFor({ userId: "guest-to-merge" }),
    recommendation: recommendation("guest-merge-rec", ["tomato-egg"], "local-state"),
    effortTier: "quick_15",
    dateKey: "2026-07-23",
  });

  const mergeBodies = [];
  const householdBootstrap = bootstrapFor({
    userId: "guest-to-merge",
    householdId: "new-home",
    role: "owner",
  });
  const mergeRuntime = createRuntime({
    storage: sharedStorage,
    session: sessionFor("guest-to-merge"),
    bootstrap: householdBootstrap,
    requestHandler: ({ path: pathname, method, data, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) {
        succeed({ mealRun: null });
        return;
      }
      if (pathname === "/meal-runs" && method === "POST") {
        mergeBodies.push(data);
        succeed({ mealRun: remoteRun({ id: "merged-remote", householdId: "new-home", syncedFromLocalId: data.syncedFromLocalId }) }, 201);
        return;
      }
      throw new Error(`Unexpected request: ${method} ${pathname}`);
    },
  });
  const mergeMealRun = mergeRuntime.load("miniprogram/utils/meal-run.js");
  const merged = await mergeMealRun.mergeActiveGuestMealRun({
    bootstrap: householdBootstrap,
    dateKey: "2026-07-23",
  });
  assert.equal(merged.merged, true);
  assert.equal(merged.mealRun.id, "merged-remote");
  assert.equal(mergeBodies[0].syncedFromLocalId, localRun.id);
  assert.equal(mergeBodies[0].idempotencyKey, `guest-merge:${localRun.id}`);
  assert.equal(mergeMealRun.readActiveGuestMealRun({ ownerUserId: "guest-to-merge", dateKey: "2026-07-23" }), null);

  const lockedStorage = new Map();
  const lockedGuestRuntime = createRuntime({
    storage: lockedStorage,
    session: sessionFor("guest-locked"),
    bootstrap: bootstrapFor({ userId: "guest-locked" }),
  });
  const lockedGuestMealRun = lockedGuestRuntime.load("miniprogram/utils/meal-run.js");
  const lockedLocal = await lockedGuestMealRun.createMealRun({
    bootstrap: bootstrapFor({ userId: "guest-locked" }),
    recommendation: recommendation("locked-local", ["tomato-egg"], "local-state"),
    effortTier: "quick_15",
    dateKey: "2026-07-23",
  });
  let lockedCreateCalls = 0;
  const lockedBootstrap = bootstrapFor({ userId: "guest-locked", householdId: "locked-home", role: "owner" });
  const lockedRuntime = createRuntime({
    storage: lockedStorage,
    session: sessionFor("guest-locked"),
    bootstrap: lockedBootstrap,
    requestHandler: ({ path: pathname, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) {
        succeed({ mealRun: remoteRun({ id: "remote-cooking", householdId: "locked-home", status: "cooking" }) });
        return;
      }
      if (pathname === "/meal-runs") lockedCreateCalls += 1;
    },
  });
  const lockedMealRun = lockedRuntime.load("miniprogram/utils/meal-run.js");
  const locked = await lockedMealRun.mergeActiveGuestMealRun({ bootstrap: lockedBootstrap, dateKey: "2026-07-23" });
  assert.equal(locked.merged, false);
  assert.equal(locked.reason, "remote_locked");
  assert.equal(locked.mealRun.id, "remote-cooking");
  assert.equal(locked.guestRun.id, lockedLocal.id);
  assert.equal(lockedCreateCalls, 0);
  assert.equal(
    lockedMealRun.readActiveGuestMealRun({ ownerUserId: "guest-locked", dateKey: "2026-07-23" }).id,
    lockedLocal.id,
    "a remote active dinner must retain the unmerged guest run",
  );

  const switchedRuntime = createRuntime({
    storage: lockedStorage,
    session: sessionFor("different-user"),
    bootstrap: bootstrapFor({ userId: "different-user", householdId: "other-home", role: "owner" }),
    requestHandler: ({ path: pathname, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) succeed({ mealRun: null });
      else assert.fail("another account must not merge the prior user's guest run");
    },
  });
  const switchedMealRun = switchedRuntime.load("miniprogram/utils/meal-run.js");
  const switched = await switchedMealRun.mergeActiveGuestMealRun({
    bootstrap: switchedRuntime.bootstrap,
    dateKey: "2026-07-23",
  });
  assert.equal(switched.merged, false);
  assert.equal(switched.reason, "no_guest_run");
}

async function verifyGuestMergeNetworkRecovery() {
  for (const failureStage of ["get", "post"]) {
    const storage = new Map();
    const userId = `guest-network-${failureStage}`;
    const guestRuntime = createRuntime({
      storage,
      session: sessionFor(userId),
      bootstrap: bootstrapFor({ userId }),
    });
    const guestMealRun = guestRuntime.load("miniprogram/utils/meal-run.js");
    const dateKey = guestMealRun.formatDinnerDateKey();
    const localRun = await guestMealRun.createMealRun({
      bootstrap: bootstrapFor({ userId }),
      recommendation: recommendation(`guest-network-rec-${failureStage}`, ["tomato-egg"], "local"),
      effortTier: "quick_15",
      dateKey,
    });
    let online = false;
    const postKeys = [];
    const householdBootstrap = bootstrapFor({
      userId,
      householdId: `network-home-${failureStage}`,
      role: "owner",
    });
    const runtime = createRuntime({
      storage,
      session: sessionFor(userId),
      bootstrap: householdBootstrap,
      requestHandler: ({ path: pathname, data, header, succeed, fail }) => {
        if (pathname.startsWith("/meal-runs/current")) {
          if (!online && failureStage === "get") fail();
          else succeed({ mealRun: null });
          return;
        }
        if (pathname === "/meal-runs") {
          postKeys.push(header["X-Humi-Idempotency-Key"]);
          if (!online && failureStage === "post") fail();
          else {
            succeed({
              mealRun: remoteRun({
                id: `network-merged-${failureStage}`,
                householdId: `network-home-${failureStage}`,
                recipeIds: data.recipeIds,
                syncedFromLocalId: data.syncedFromLocalId,
              }),
            }, 201);
          }
          return;
        }
        throw new Error(`Unexpected request: ${pathname}`);
      },
    });
    const page = runtime.loadPage("miniprogram/pages/tonight/index.js");
    await page.onLoad();
    assert.equal(page.data.mealRun.id, localRun.id, `${failureStage} disconnect must keep the guest dinner visible`);
    assert.equal(page.data.mealRun.localOnly, true);
    assert.equal(page.data.viewState, "planned");
    assert(
      [...storage.values()].some((value) => value?.id === localRun.id),
      `${failureStage} disconnect must retain local storage`,
    );

    online = true;
    await page.onShow();
    await page.onShow();
    assert.equal(page.data.mealRun.id, `network-merged-${failureStage}`);
    assert.equal(page.data.mealRun.localOnly, false);
    if (failureStage === "post") {
      assert.equal(postKeys.length, 2);
      assert.equal(postKeys[0], postKeys[1], "POST recovery must reuse localRunId idempotency material");
    }
  }
}

async function verifyCookingGuestStateMigration() {
  await verifyCookingGuestMergeSuccess();
  await verifyTwoTimerGuestMerge();
  await verifyRemoteAheadGuestWins();
  await verifySameStepRemoteTimerWins();
  await verifyProgressRaceRemoteWins();
  for (const failureStage of ["create", "start", "progress"]) {
    await verifyCookingGuestMergeRetry(failureStage);
  }
  for (const failureStage of ["create", "start", "progress", "complete", "feedback"]) {
    await verifyCompletedGuestMergeRetry(failureStage);
  }
  await verifySameGuestCompletedRemoteWins();
}

async function verifyCompletedGuestMergeRetry(failureStage) {
  const fixture = await createCookingGuestFixture(`completed-retry-${failureStage}`);
  fixture.localRun.status = "completed";
  fixture.localRun.completedAt = "2026-07-23T10:30:00.000Z";
  fixture.localRun.feedback = [{
    userId: "guest",
    value: "want_again",
    createdAt: "2026-07-23T10:31:00.000Z",
    updatedAt: "2026-07-23T10:31:00.000Z",
  }];
  const guestKey = [...fixture.storage.keys()].find((key) => key.startsWith("humi:meal-run:guest:v1:"));
  fixture.storage.set(guestKey, clone(fixture.localRun));
  let remote = null;
  let failed = false;
  let successfulCompletions = 0;
  const stageCalls = { create: 0, start: 0, progress: 0, complete: 0, feedback: 0 };
  const requestHandler = ({ path: pathname, method, data, succeed, fail }) => {
    if (pathname.startsWith("/meal-runs/current")) return succeed({ mealRun: remote });
    let stage = "";
    if (pathname === "/meal-runs" && method === "POST") stage = "create";
    if (pathname.endsWith("/start")) stage = "start";
    if (pathname.endsWith("/progress")) stage = "progress";
    if (pathname.endsWith("/complete")) stage = "complete";
    if (pathname.endsWith("/feedback")) stage = "feedback";
    if (!stage) throw new Error(`Unexpected completed merge request: ${method} ${pathname}`);
    stageCalls[stage] += 1;
    if (failureStage === stage && !failed) {
      failed = true;
      fail();
      return;
    }
    if (stage === "create") {
      assert.equal(data.syncedFromLocalId, fixture.localRun.id);
      assert.equal(data.syncedStartedAt, fixture.localRun.startedAt);
      remote = remoteRun({
        id: fixture.remoteId,
        householdId: fixture.householdId,
        syncedFromLocalId: fixture.localRun.id,
        syncedStartedAt: fixture.localRun.startedAt,
      });
    }
    if (stage === "start") {
      remote = {
        ...remote,
        status: "cooking",
        timelineVersion: fixture.localRun.timelineVersion,
        timeline: clone(fixture.localRun.timeline),
        currentStepId: fixture.localRun.timeline.steps[0].id,
        timers: {},
        startedAt: fixture.localRun.startedAt,
      };
    }
    if (stage === "progress") {
      assert.equal(data.timelineVersion, remote.timelineVersion);
      remote = {
        ...remote,
        currentStepId: data.currentStepId,
        timers: data.timer
          ? { ...(remote.timers || {}), [data.timer.stepId]: data.timer }
          : remote.timers || {},
      };
    }
    if (stage === "complete") {
      if (remote.status !== "completed") successfulCompletions += 1;
      remote = { ...remote, status: "completed", completedAt: fixture.localRun.completedAt };
    }
    if (stage === "feedback") {
      remote = {
        ...remote,
        feedback: [{ userId: fixture.userId, value: data.value }],
      };
    }
    succeed({ mealRun: remote }, stage === "create" ? 201 : 200);
  };
  const firstRuntime = createRuntime({
    storage: fixture.storage,
    session: sessionFor(fixture.userId),
    bootstrap: fixture.householdBootstrap,
    requestHandler,
  });
  const firstMealRuns = firstRuntime.load("miniprogram/utils/meal-run.js");
  const first = await firstMealRuns.mergeActiveGuestMealRun({
    bootstrap: fixture.householdBootstrap,
    dateKey: fixture.dateKey,
  });
  assert.equal(first.merged, false, `${failureStage}: interrupted completed merge stays local`);
  assert.equal(first.reason, "offline");
  assert.equal(
    firstMealRuns.readActiveGuestMealRun({ ownerUserId: fixture.userId, dateKey: fixture.dateKey }).status,
    "completed",
  );

  const restartedRuntime = createRuntime({
    storage: fixture.storage,
    session: sessionFor(fixture.userId),
    bootstrap: fixture.householdBootstrap,
    requestHandler,
  });
  const restartedMealRuns = restartedRuntime.load("miniprogram/utils/meal-run.js");
  const second = await restartedMealRuns.mergeActiveGuestMealRun({
    bootstrap: fixture.householdBootstrap,
    dateKey: fixture.dateKey,
  });
  assert.equal(second.merged, true, `${failureStage}: App restart converges the completed guest run`);
  assert.equal(second.mealRun.status, "completed");
  assert.deepEqual(plain(second.mealRun.timers), plain(fixture.localRun.timers));
  assert.equal(second.mealRun.feedback.find((entry) => entry.userId === fixture.userId)?.value, "want_again");
  assert.equal(successfulCompletions, 1, "a completed guest dinner is counted exactly once");
  assert.equal(
    restartedMealRuns.readActiveGuestMealRun({ ownerUserId: fixture.userId, dateKey: fixture.dateKey }),
    null,
    "the local completed run is archived only after remote completion and feedback converge",
  );
  const repeated = await restartedMealRuns.mergeActiveGuestMealRun({
    bootstrap: fixture.householdBootstrap,
    dateKey: fixture.dateKey,
  });
  assert.equal(repeated.reason, "no_guest_run");
  assert.equal(successfulCompletions, 1);
  assert.equal(stageCalls[failureStage], 2, `${failureStage}: only the interrupted stage is retried`);
}

async function verifyTwoTimerGuestMerge() {
  const storage = new Map();
  const userId = "guest-two-timers";
  const householdId = "home-two-timers";
  const remoteId = "remote-two-timers";
  const dateKey = "2026-07-23";
  const guestRuntime = createRuntime({
    storage,
    session: sessionFor(userId),
    bootstrap: bootstrapFor({ userId }),
  });
  const guestMealRuns = guestRuntime.load("miniprogram/utils/meal-run.js");
  const planned = await guestMealRuns.createMealRun({
    bootstrap: bootstrapFor({ userId }),
    recommendation: recommendation("rec-two-timers", ["cola-wings", "shiitake-steamed-chicken"], "local"),
    effortTier: "normal",
    dateKey,
  });
  const { buildMealTimeline } = guestRuntime.load("miniprogram/utils/meal-timeline.js");
  const timeline = buildMealTimeline(planned.recipeIds, { startedAt: "2026-07-23T10:00:00.000Z" });
  const timerSteps = [
    timeline.steps.find((step) => step.id === "cola-wings:step:4"),
    timeline.steps.find((step) => step.id === "shiitake-steamed-chicken:step:3"),
  ];
  const timers = Object.fromEntries(timerSteps.map((step, index) => {
    const startedAt = `2026-07-23T10:${index ? "25" : "20"}:00.000Z`;
    return [step.id, {
      stepId: step.id,
      startedAt,
      endsAt: new Date(Date.parse(startedAt) + step.durationSeconds * 1000).toISOString(),
    }];
  }));
  const localRun = {
    ...planned,
    status: "cooking",
    timelineVersion: timeline.version,
    timeline,
    currentStepId: timerSteps[1].id,
    timers,
    timerEndsAt: timers[timerSteps[1].id].endsAt,
    startedAt: timeline.startedAt,
    updatedAt: "2026-07-23T10:25:00.000Z",
  };
  const guestKey = [...storage.keys()].find((key) => key.startsWith("humi:meal-run:guest:v1:"));
  storage.set(guestKey, clone(localRun));
  let remote = {
    ...remoteRun({ id: remoteId, householdId, status: "cooking", syncedFromLocalId: localRun.id }),
    timelineVersion: timeline.version,
    timeline: clone(timeline),
    currentStepId: timeline.steps[0].id,
    timers: {},
  };
  const timerCalls = [];
  const householdBootstrap = bootstrapFor({ userId, householdId, role: "owner" });
  const runtime = createRuntime({
    storage,
    session: sessionFor(userId),
    bootstrap: householdBootstrap,
    requestHandler: ({ path: pathname, data, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) return succeed({ mealRun: remote });
      if (pathname.endsWith("/progress")) {
        if (data.timer) timerCalls.push(clone(data.timer));
        remote = {
          ...remote,
          currentStepId: timeline.steps.findIndex((step) => step.id === data.currentStepId)
            > timeline.steps.findIndex((step) => step.id === remote.currentStepId)
            ? data.currentStepId
            : remote.currentStepId,
          timers: data.timer
            ? { ...remote.timers, [data.timer.stepId]: remote.timers[data.timer.stepId] || data.timer }
            : remote.timers,
        };
        return succeed({ mealRun: remote });
      }
      throw new Error(`Unexpected two-timer guest merge request: ${pathname}`);
    },
  });
  const mealRuns = runtime.load("miniprogram/utils/meal-run.js");
  const merged = await mealRuns.mergeActiveGuestMealRun({ bootstrap: householdBootstrap, dateKey });
  assert.equal(merged.merged, true);
  assert.deepEqual(plain(timerCalls.map((timer) => timer.stepId)), plain(timerSteps.map((step) => step.id)));
  assert.deepEqual(Object.keys(plain(merged.mealRun.timers)).sort(), timerSteps.map((step) => step.id).sort());
}

async function verifyCookingGuestMergeSuccess() {
  const fixture = await createCookingGuestFixture("cooking-merge-success");
  let remote = null;
  const stageKeys = { create: [], start: [], progress: [] };
  const runtime = createRuntime({
    storage: fixture.storage,
    session: sessionFor(fixture.userId),
    bootstrap: fixture.householdBootstrap,
    requestHandler: ({ path: pathname, method, data, header, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) {
        succeed({ mealRun: remote });
        return;
      }
      if (pathname === "/meal-runs" && method === "POST") {
        stageKeys.create.push(header["X-Humi-Idempotency-Key"]);
        remote = remoteRun({
          id: fixture.remoteId,
          householdId: fixture.householdId,
          syncedFromLocalId: data.syncedFromLocalId,
        });
        succeed({ mealRun: remote }, 201);
        return;
      }
      if (pathname === `/meal-runs/${fixture.remoteId}/start` && method === "POST") {
        stageKeys.start.push(header["X-Humi-Idempotency-Key"]);
        remote = {
          ...remote,
          status: "cooking",
          timelineVersion: fixture.localRun.timelineVersion,
          timeline: clone(fixture.localRun.timeline),
          currentStepId: fixture.localRun.timeline.steps[0].id,
          timers: {},
          timerEndsAt: "",
        };
        succeed({ mealRun: remote });
        return;
      }
      if (pathname === `/meal-runs/${fixture.remoteId}/progress` && method === "PUT") {
        stageKeys.progress.push(header["X-Humi-Idempotency-Key"]);
        assert.equal(data.currentStepId, fixture.localRun.currentStepId);
        assert.deepEqual(plain(data.timer), plain(fixture.localRun.timers[data.currentStepId]));
        remote = {
          ...remote,
          currentStepId: data.currentStepId,
          timers: { ...(remote.timers || {}), [data.timer.stepId]: data.timer },
          timerEndsAt: data.timer.endsAt,
        };
        succeed({ mealRun: remote });
        return;
      }
      throw new Error(`Unexpected cooking merge request: ${method} ${pathname}`);
    },
  });
  const mealRuns = runtime.load("miniprogram/utils/meal-run.js");
  const merged = await mealRuns.mergeActiveGuestMealRun({
    bootstrap: fixture.householdBootstrap,
    dateKey: fixture.dateKey,
  });
  assert.equal(merged.merged, true);
  assert.equal(merged.mealRun.status, "cooking", "cooking guest must not be downgraded to remote planned");
  assert.equal(merged.mealRun.currentStepId, fixture.localRun.currentStepId);
  assert.deepEqual(plain(merged.mealRun.timers), plain(fixture.localRun.timers));
  assert.deepEqual(
    plain(merged.mealRun.timeline.steps.map((step) => step.id)),
    plain(fixture.localRun.timeline.steps.map((step) => step.id)),
  );
  assert.deepEqual(stageKeys, {
    create: [`guest-merge:${fixture.localRun.id}`],
    start: [`guest-merge:${fixture.localRun.id}:start`],
    progress: [`guest-merge:${fixture.localRun.id}:timer:${fixture.localRun.currentStepId}`],
  });
  assert.equal(mealRuns.readActiveGuestMealRun({ ownerUserId: fixture.userId, dateKey: fixture.dateKey }), null);
}

async function verifyRemoteAheadGuestWins() {
  const fixture = await createCookingGuestFixture("remote-ahead");
  const currentIndex = fixture.localRun.timeline.steps.findIndex((step) => step.id === fixture.localRun.currentStepId);
  const remoteStep = fixture.localRun.timeline.steps[currentIndex + 1];
  const remote = {
    ...remoteRun({
      id: fixture.remoteId,
      householdId: fixture.householdId,
      status: "cooking",
      syncedFromLocalId: fixture.localRun.id,
    }),
    timelineVersion: fixture.localRun.timelineVersion,
    timeline: clone(fixture.localRun.timeline),
    currentStepId: remoteStep.id,
    timers: clone(fixture.localRun.timers),
    timerEndsAt: fixture.localRun.timerEndsAt,
  };
  let progressCalls = 0;
  const runtime = createRuntime({
    storage: fixture.storage,
    session: sessionFor(fixture.userId),
    bootstrap: fixture.householdBootstrap,
    requestHandler: ({ path: pathname, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) succeed({ mealRun: remote });
      else if (pathname.endsWith("/progress")) {
        progressCalls += 1;
        assert.fail("a later remote step must not receive a stale progress PUT");
      }
      else throw new Error(`Unexpected remote-ahead request: ${pathname}`);
    },
  });
  const mealRuns = runtime.load("miniprogram/utils/meal-run.js");
  const merged = await mealRuns.mergeActiveGuestMealRun({
    bootstrap: fixture.householdBootstrap,
    dateKey: fixture.dateKey,
  });
  assert.equal(merged.merged, true);
  assert.equal(merged.mealRun.currentStepId, remoteStep.id, "a later remote step must win over stale guest progress");
  assert.deepEqual(plain(merged.mealRun.timers), plain(fixture.localRun.timers));
  assert.equal(progressCalls, 0, "a later remote step must never receive a stale progress PUT");
  assert.equal(mealRuns.readActiveGuestMealRun({ ownerUserId: fixture.userId, dateKey: fixture.dateKey }), null);
}

async function verifySameStepRemoteTimerWins() {
  const fixture = await createCookingGuestFixture("same-step-remote-timer");
  const localTimer = fixture.localRun.timers[fixture.localRun.currentStepId];
  const remoteTimer = {
    ...localTimer,
    startedAt: new Date(Date.parse(localTimer.startedAt) + 60_000).toISOString(),
    endsAt: new Date(Date.parse(localTimer.endsAt) + 60_000).toISOString(),
  };
  const remote = {
    ...remoteRun({
      id: fixture.remoteId,
      householdId: fixture.householdId,
      status: "cooking",
      syncedFromLocalId: fixture.localRun.id,
    }),
    timelineVersion: fixture.localRun.timelineVersion,
    timeline: clone(fixture.localRun.timeline),
    currentStepId: fixture.localRun.currentStepId,
    timers: { [remoteTimer.stepId]: remoteTimer },
    timerEndsAt: remoteTimer.endsAt,
  };
  let progressCalls = 0;
  const runtime = createRuntime({
    storage: fixture.storage,
    session: sessionFor(fixture.userId),
    bootstrap: fixture.householdBootstrap,
    requestHandler: ({ path: pathname, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) succeed({ mealRun: remote });
      else if (pathname.endsWith("/progress")) {
        progressCalls += 1;
        assert.fail("the same remote step must keep its current timer without a progress PUT");
      }
      else throw new Error(`Unexpected same-step request: ${pathname}`);
    },
  });
  const mealRuns = runtime.load("miniprogram/utils/meal-run.js");
  const merged = await mealRuns.mergeActiveGuestMealRun({
    bootstrap: fixture.householdBootstrap,
    dateKey: fixture.dateKey,
  });
  assert.equal(merged.merged, true);
  assert.equal(merged.mealRun.currentStepId, fixture.localRun.currentStepId);
  assert.deepEqual(plain(merged.mealRun.timers[remoteTimer.stepId]), plain(remoteTimer), "the remote first-written timer wins when both runs are on the same step");
  assert.equal(progressCalls, 0);
}

async function verifyProgressRaceRemoteWins() {
  const fixture = await createCookingGuestFixture("progress-race");
  const firstStep = fixture.localRun.timeline.steps[0];
  const guestIndex = fixture.localRun.timeline.steps.findIndex((step) => step.id === fixture.localRun.currentStepId);
  const memberStep = fixture.localRun.timeline.steps[guestIndex + 1];
  const localTimer = fixture.localRun.timers[fixture.localRun.currentStepId];
  let remote = {
    ...remoteRun({
      id: fixture.remoteId,
      householdId: fixture.householdId,
      status: "cooking",
      syncedFromLocalId: fixture.localRun.id,
    }),
    timelineVersion: fixture.localRun.timelineVersion,
    timeline: clone(fixture.localRun.timeline),
    currentStepId: firstStep.id,
    timers: {},
    timerEndsAt: "",
  };
  let progressCalls = 0;
  const runtime = createRuntime({
    storage: fixture.storage,
    session: sessionFor(fixture.userId),
    bootstrap: fixture.householdBootstrap,
    requestHandler: ({ path: pathname, data, succeed }) => {
      if (pathname.startsWith("/meal-runs/current")) {
        succeed({ mealRun: remote });
        return;
      }
      if (pathname.endsWith("/progress")) {
        progressCalls += 1;
        assert.equal(data.currentStepId, fixture.localRun.currentStepId, "client may PUT only because GET observed remote behind");
        remote = {
          ...remote,
          currentStepId: memberStep.id,
          timers: { [localTimer.stepId]: localTimer },
          timerEndsAt: localTimer.endsAt,
        };
        succeed({ mealRun: remote });
        return;
      }
      throw new Error(`Unexpected progress-race request: ${pathname}`);
    },
  });
  const mealRuns = runtime.load("miniprogram/utils/meal-run.js");
  const merged = await mealRuns.mergeActiveGuestMealRun({
    bootstrap: fixture.householdBootstrap,
    dateKey: fixture.dateKey,
  });
  assert.equal(progressCalls, 1);
  assert.equal(merged.merged, true, "a server response advanced by another member must safely converge");
  assert.equal(merged.mealRun.currentStepId, memberStep.id);
  assert.deepEqual(plain(merged.mealRun.timers[localTimer.stepId]), plain(localTimer));
  assert.equal(mealRuns.readActiveGuestMealRun({ ownerUserId: fixture.userId, dateKey: fixture.dateKey }), null);
}

async function verifyCookingGuestMergeRetry(failureStage) {
  const fixture = await createCookingGuestFixture(`cooking-retry-${failureStage}`);
  let remote = null;
  let failed = false;
  const stageKeys = { create: [], start: [], progress: [] };
  const runtime = createRuntime({
    storage: fixture.storage,
    session: sessionFor(fixture.userId),
    bootstrap: fixture.householdBootstrap,
    requestHandler: ({ path: pathname, method, data, header, succeed, fail }) => {
      if (pathname.startsWith("/meal-runs/current")) {
        succeed({ mealRun: remote });
        return;
      }
      if (pathname === "/meal-runs" && method === "POST") {
        stageKeys.create.push(header["X-Humi-Idempotency-Key"]);
        if (failureStage === "create" && !failed) {
          failed = true;
          fail();
          return;
        }
        remote = remoteRun({
          id: fixture.remoteId,
          householdId: fixture.householdId,
          syncedFromLocalId: data.syncedFromLocalId,
        });
        succeed({ mealRun: remote }, 201);
        return;
      }
      if (pathname === `/meal-runs/${fixture.remoteId}/start` && method === "POST") {
        stageKeys.start.push(header["X-Humi-Idempotency-Key"]);
        if (failureStage === "start" && !failed) {
          failed = true;
          fail();
          return;
        }
        remote = {
          ...remote,
          status: "cooking",
          timelineVersion: fixture.localRun.timelineVersion,
          timeline: clone(fixture.localRun.timeline),
          currentStepId: fixture.localRun.timeline.steps[0].id,
          timers: {},
          timerEndsAt: "",
        };
        succeed({ mealRun: remote });
        return;
      }
      if (pathname === `/meal-runs/${fixture.remoteId}/progress` && method === "PUT") {
        stageKeys.progress.push(header["X-Humi-Idempotency-Key"]);
        if (failureStage === "progress" && !failed) {
          failed = true;
          fail();
          return;
        }
        remote = {
          ...remote,
          currentStepId: data.currentStepId,
          timers: data.timer
            ? { ...(remote.timers || {}), [data.timer.stepId]: data.timer }
            : remote.timers || {},
          timerEndsAt: data.timer?.endsAt || remote.timerEndsAt || "",
        };
        succeed({ mealRun: remote });
        return;
      }
      throw new Error(`Unexpected ${failureStage} retry request: ${method} ${pathname}`);
    },
  });
  const mealRuns = runtime.load("miniprogram/utils/meal-run.js");
  const first = await mealRuns.mergeActiveGuestMealRun({
    bootstrap: fixture.householdBootstrap,
    dateKey: fixture.dateKey,
  });
  assert.equal(first.merged, false);
  assert.equal(first.reason, "offline");
  assert.equal(first.guestRun.id, fixture.localRun.id);
  assert.equal(first.guestRun.status, "cooking");
  assert.equal(
    mealRuns.readActiveGuestMealRun({ ownerUserId: fixture.userId, dateKey: fixture.dateKey }).id,
    fixture.localRun.id,
    `${failureStage} disconnect must retain the cooking guest run`,
  );

  const second = await mealRuns.mergeActiveGuestMealRun({
    bootstrap: fixture.householdBootstrap,
    dateKey: fixture.dateKey,
  });
  assert.equal(second.merged, true);
  assert.equal(second.mealRun.status, "cooking");
  assert.equal(second.mealRun.currentStepId, fixture.localRun.currentStepId);
  assert.deepEqual(plain(second.mealRun.timers), plain(fixture.localRun.timers));
  assert.equal(mealRuns.readActiveGuestMealRun({ ownerUserId: fixture.userId, dateKey: fixture.dateKey }), null);
  assert.equal(stageKeys[failureStage].length, 2, `${failureStage} must be retried`);
  assert.equal(stageKeys[failureStage][0], stageKeys[failureStage][1], `${failureStage} retry must reuse its idempotency key`);
}

async function verifySameGuestCompletedRemoteWins() {
  const fixture = await createCookingGuestFixture("cooking-remote-completed");
  const runtime = createRuntime({
    storage: fixture.storage,
    session: sessionFor(fixture.userId),
    bootstrap: fixture.householdBootstrap,
    requestHandler: ({ path: pathname, succeed }) => {
      if (!pathname.startsWith("/meal-runs/current")) throw new Error(`Unexpected completed merge request: ${pathname}`);
      succeed({
        mealRun: remoteRun({
          id: fixture.remoteId,
          householdId: fixture.householdId,
          status: "completed",
          syncedFromLocalId: fixture.localRun.id,
        }),
      });
    },
  });
  const mealRuns = runtime.load("miniprogram/utils/meal-run.js");
  const merged = await mealRuns.mergeActiveGuestMealRun({
    bootstrap: fixture.householdBootstrap,
    dateKey: fixture.dateKey,
  });
  assert.equal(merged.merged, true);
  assert.equal(merged.mealRun.status, "completed");
  assert.equal(mealRuns.readActiveGuestMealRun({ ownerUserId: fixture.userId, dateKey: fixture.dateKey }), null);
}

async function verifyCookingGuestConflictRecovery() {
  const fixture = await createCookingGuestFixture("cooking-conflict-get-offline");
  let currentCalls = 0;
  const runtime = createRuntime({
    storage: fixture.storage,
    session: sessionFor(fixture.userId),
    bootstrap: fixture.householdBootstrap,
    requestHandler: ({ path: pathname, succeed, fail }) => {
      if (pathname.startsWith("/meal-runs/current")) {
        currentCalls += 1;
        if (currentCalls === 1) succeed({ mealRun: null });
        else fail();
        return;
      }
      if (pathname === "/meal-runs") {
        succeed({ error: "state_conflict" }, 409);
        return;
      }
      throw new Error(`Unexpected conflict recovery request: ${pathname}`);
    },
  });
  const page = runtime.loadPage("miniprogram/pages/tonight/index.js");
  await page.onLoad();
  assert.equal(page.data.viewState, "resuming", "409 recovery GET disconnect must keep showing the cooking guest");
  assert.equal(page.data.mealRun.id, fixture.localRun.id);
  assert.equal(page.data.mealRun.currentStepId, fixture.localRun.currentStepId);
  assert.equal(page.data.errorText, "");
  const mealRuns = runtime.load("miniprogram/utils/meal-run.js");
  assert.equal(
    mealRuns.readActiveGuestMealRun({ ownerUserId: fixture.userId, dateKey: fixture.dateKey }).id,
    fixture.localRun.id,
  );
}

async function verifyMealExecutionFlagRollback() {
  const runtime = createRuntime({
    session: sessionFor("disabled-user"),
    bootstrap: bootstrapFor({
      userId: "disabled-user",
      householdId: "disabled-home",
      role: "owner",
      mealExecutionEnabled: false,
    }),
    requestHandler: () => assert.fail("a disabled household must not call recommendation or MealRun APIs"),
  });
  const page = runtime.loadPage("miniprogram/pages/tonight/index.js");
  await page.onLoad();
  assert.deepEqual(runtime.routes, [{
    kind: "reLaunch",
    url: "/pages/legacy/index",
  }]);
  assert.equal(runtime.requests.length, 0);

  const guestEnabled = createRuntime({
    session: sessionFor("enabled-guest"),
    bootstrap: bootstrapFor({ userId: "enabled-guest", mealExecutionEnabled: true }),
  });
  const guestPage = guestEnabled.loadPage("miniprogram/pages/tonight/index.js");
  await guestPage.onLoad();
  assert.equal(guestPage.data.viewState, "choose_effort", "an explicitly enabled household-free guest may use local certified dinners");
}

async function createCookingGuestFixture(label) {
  const storage = new Map();
  const userId = `guest-${label}`;
  const householdId = `home-${label}`;
  const remoteId = `remote-${label}`;
  const guestRuntime = createRuntime({
    storage,
    session: sessionFor(userId),
    bootstrap: bootstrapFor({ userId }),
  });
  const mealRuns = guestRuntime.load("miniprogram/utils/meal-run.js");
  const dateKey = mealRuns.formatDinnerDateKey();
  const planned = await mealRuns.createMealRun({
    bootstrap: bootstrapFor({ userId }),
    recommendation: recommendation(`rec-${label}`, ["cola-wings"], "local"),
    effortTier: "normal",
    dateKey,
  });
  const { buildMealTimeline } = guestRuntime.load("miniprogram/utils/meal-timeline.js");
  const timeline = buildMealTimeline(planned.recipeIds, { startedAt: "2026-07-23T10:00:00.000Z" });
  const progressStep = timeline.steps.find((step) => step.attention === "passive");
  const actualTimer = {
    stepId: progressStep.id,
    startedAt: "2026-07-23T10:05:00.000Z",
    endsAt: new Date(Date.parse("2026-07-23T10:05:00.000Z") + progressStep.durationSeconds * 1000).toISOString(),
  };
  const localRun = {
    ...planned,
    status: "cooking",
    timelineVersion: timeline.version,
    timeline,
    currentStepId: progressStep.id,
    timers: { [progressStep.id]: actualTimer },
    timerEndsAt: actualTimer.endsAt,
    startedAt: timeline.startedAt,
    updatedAt: "2026-07-23T10:05:00.000Z",
  };
  const guestKey = [...storage.keys()].find((key) => key.startsWith("humi:meal-run:guest:v1:"));
  storage.set(guestKey, clone(localRun));
  return {
    storage,
    userId,
    householdId,
    remoteId,
    dateKey,
    localRun,
    householdBootstrap: bootstrapFor({ userId, householdId, role: "owner" }),
  };
}

function verifyInteractiveComponents() {
  const runtime = createRuntime();
  const picker = runtime.loadComponent("miniprogram/components/effort-picker/index.js");
  picker.selectEffort({ currentTarget: { dataset: { tier: "easy_30" } } });
  assert.deepEqual(picker.events, [{ name: "select", detail: { tier: "easy_30" } }]);
  picker.selectEffort({ currentTarget: { dataset: { tier: "unknown" } } });
  assert.equal(picker.events.length, 1, "effort picker must ignore unknown tiers");

  const plan = runtime.loadComponent("miniprogram/components/dinner-plan-card/index.js");
  plan.accept();
  plan.next();
  assert.deepEqual(plan.events.map((event) => event.name), ["accept", "next"]);

  const resume = runtime.loadComponent("miniprogram/components/meal-run-resume/index.js");
  resume.data.mealRun = { status: "planned" };
  resume.data.canReplacePlan = false;
  resume.replace();
  assert.equal(resume.events.length, 0, "a member must not trigger planned-menu replacement");
  resume.primaryAction();
  assert.equal(resume.events[0].name, "start");
  resume.data.mealRun = { status: "cooking" };
  resume.primaryAction();
  assert.equal(resume.events[1].name, "resume");
  resume.data.mealRun = { status: "completed" };
  resume.primaryAction();
  assert.equal(resume.events.length, 2, "completed dinner must stay read-only");
}

function verifyProductionTemplateContract() {
  const pageConfig = JSON.parse(readFileSync(path.join(root, "miniprogram/pages/tonight/index.json"), "utf8"));
  assert.deepEqual(pageConfig.usingComponents, {
    "page-state": "/components/page-state/index",
    "effort-picker": "/components/effort-picker/index",
    "dinner-plan-card": "/components/dinner-plan-card/index",
    "meal-run-resume": "/components/meal-run-resume/index",
  });
  const pageTemplate = readFileSync(path.join(root, "miniprogram/pages/tonight/index.wxml"), "utf8");
  for (const binding of [
    'bind:select="selectEffort"',
    'bind:accept="acceptRecommendation"',
    'bind:next="nextRecommendation"',
    'bind:start="startCooking"',
    'bind:resume="resumeCooking"',
    'bind:replace="replacePlannedMeal"',
    'can-replace-plan="{{canReplacePlan}}"',
  ]) assert(pageTemplate.includes(binding), `Tonight production WXML must wire ${binding}`);

  const planTemplate = readFileSync(path.join(root, "miniprogram/components/dinner-plan-card/index.wxml"), "utf8");
  assert.equal((planTemplate.match(/<button\b/g) || []).length, 2, "production recommendation card must have exactly two buttons");
  assert(planTemplate.includes('bindtap="accept"'));
  assert(planTemplate.includes('bindtap="next"'));

  const resumeTemplate = readFileSync(path.join(root, "miniprogram/components/meal-run-resume/index.wxml"), "utf8");
  assert(
    /wx:if="{{mealRun\.status === 'planned' && canReplacePlan}}".*bindtap="replace"/s.test(resumeTemplate),
    "production resume template must render replacement only for an owner",
  );
}

function createRuntime({ storage = new Map(), session = null, bootstrap = null, requestHandler } = {}) {
  const modules = new Map();
  const routes = [];
  const requests = [];
  let randomCounter = 1;
  let registeredPage = null;
  let registeredComponent = null;
  const app = {
    globalData: {
      humiSession: session,
      nativeShellCandidate: true,
    },
    setHumiSession(next) {
      this.globalData.humiSession = next;
      storage.set(SESSION_KEY, next);
    },
    clearHumiSession() {
      this.globalData.humiSession = null;
      storage.delete(SESSION_KEY);
    },
  };
  if (session) storage.set(SESSION_KEY, session);

  const wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, clone(value)),
    removeStorageSync: (key) => storage.delete(key),
    navigateTo: ({ url }) => routes.push({ kind: "navigateTo", url }),
    reLaunch: ({ url }) => routes.push({ kind: "reLaunch", url }),
    switchTab: ({ url }) => routes.push({ kind: "switchTab", url }),
    getRandomValues: (array) => {
      for (let index = 0; index < array.length; index += 1) array[index] = (randomCounter++ * 17) % 256;
      return array;
    },
    request: (options) => {
      const url = new URL(options.url);
      const record = {
        path: `${url.pathname}${url.search}`,
        pathname: url.pathname,
        method: options.method,
        data: clone(options.data),
        header: clone(options.header),
      };
      requests.push(record);
      const succeed = (data, statusCode = 200) => options.success({ statusCode, data: clone(data) });
      const fail = () => options.fail({ errMsg: "request:fail timeout" });
      if (record.pathname === "/menu-share-requests") {
        succeed({
          request: {
            token: "menu_test_snapshot_1234567890",
            cacheExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }, 201);
        return;
      }
      Promise.resolve(requestHandler?.({ ...record, path: record.pathname, succeed, fail }))
        .catch((error) => options.fail({ errMsg: error.message }));
    },
    getDeviceInfo: () => ({ platform: "devtools" }),
  };

  function load(relativePath) {
    const absolutePath = resolveModulePath(path.resolve(root, relativePath));
    if (modules.has(absolutePath)) return modules.get(absolutePath).exports;
    if (absolutePath.endsWith(".json")) {
      const parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
      modules.set(absolutePath, { exports: parsed });
      return parsed;
    }
    const module = { exports: {} };
    modules.set(absolutePath, module);
    const source = readFileSync(absolutePath, "utf8");
    const context = vm.createContext({
      module,
      exports: module.exports,
      require: (specifier) => {
        if (!specifier.startsWith(".")) throw new Error(`Unsupported native module dependency: ${specifier}`);
        const dependency = resolveModulePath(path.resolve(path.dirname(absolutePath), specifier));
        return load(path.relative(root, dependency));
      },
      wx,
      getApp: () => app,
      Page: (definition) => { registeredPage = definition; },
      Behavior: (definition) => definition,
      Component: (definition) => { registeredComponent = definition; },
      console,
      URL,
      Uint8Array,
      Date,
      Math,
      Promise,
      setTimeout,
      clearTimeout,
    });
    new vm.Script(source, { filename: absolutePath }).runInContext(context);
    return module.exports;
  }

  function primeStore() {
    if (!bootstrap) return;
    const { appStore } = load("miniprogram/utils/store.js");
    appStore.resetSessionState(session);
    appStore.replaceBootstrap(bootstrap);
  }

  function loadPage(relativePath) {
    registeredPage = null;
    primeStore();
    load(relativePath);
    assert(registeredPage, `${relativePath} must register a Page`);
    return instantiateDefinition(registeredPage);
  }

  function loadComponent(relativePath) {
    registeredComponent = null;
    load(relativePath);
    assert(registeredComponent, `${relativePath} must register a Component`);
    return instantiateDefinition(registeredComponent, true);
  }

  function instantiateDefinition(definition, isComponent = false) {
    const events = [];
    const behaviors = isComponent ? [] : (definition.behaviors || []);
    const behaviorMethods = Object.assign(
      {},
      ...behaviors.map((behavior) => behavior?.methods || {}),
    );
    const behaviorData = Object.assign(
      {},
      ...behaviors.map((behavior) => behavior?.data || {}),
    );
    const methods = isComponent
      ? definition.methods || {}
      : { ...behaviorMethods, ...definition };
    const instance = {
      ...methods,
      data: clone({ ...behaviorData, ...(definition.data || {}) }),
      events,
      setData(patch) {
        this.data = { ...this.data, ...clone(patch) };
      },
      triggerEvent(name, detail) {
        events.push({ name, detail: clone(detail) });
      },
    };
    if (isComponent) {
      for (const [key, descriptor] of Object.entries(definition.properties || {})) {
        instance.data[key] = clone(descriptor?.value);
      }
    }
    return instance;
  }

  return { app, bootstrap, load, loadPage, loadComponent, requests, routes, storage, wx };
}

function resolveModulePath(candidate) {
  for (const pathCandidate of [candidate, `${candidate}.js`, `${candidate}.json`]) {
    try {
      readFileSync(pathCandidate);
      return pathCandidate;
    } catch (_) {
      // Try the next supported CommonJS mini-program extension.
    }
  }
  return candidate;
}

function bootstrapFor({
  userId = "",
  householdId = "",
  role = "",
  currentMealRun = null,
  mealExecutionEnabled = true,
} = {}) {
  return {
    schemaVersion: 1,
    stateVersion: `bootstrap-${userId || "guest"}`,
    user: { id: userId, profileStatus: "complete" },
    activeHouseholdId: householdId,
    households: householdId ? [{
      id: householdId,
      ownerId: role === "owner" ? userId : "household-owner",
      role: role || "member",
      members: [],
    }] : [],
    householdState: {
      familyProfile: { familySize: 2, allergies: [], dislikes: [] },
      familyMembers: [],
      pantryItems: [],
      wantToEatItems: [],
      dislikedRecipeIds: [],
    },
    currentMealRun,
    capabilities: { nativeShellEnabled: true, mealExecutionEnabled },
  };
}

function recommendation(id, recipeIds, stateVersion) {
  return {
    recommendationId: id,
    recipeIds,
    cycle: 0,
    groupIndex: 0,
    exhausted: false,
    reasonCode: "balanced_unseen",
    stateVersion,
  };
}

function remoteRun({
  id = "remote-run",
  householdId = "home",
  status = "planned",
  recipeIds = ["tomato-egg"],
  effortTier = "quick_15",
  syncedFromLocalId = "",
} = {}) {
  return {
    id,
    householdId,
    dateKey: "2026-07-23",
    mealSlot: "dinner",
    status,
    recipeIds,
    effortTier,
    syncedFromLocalId,
    localOnly: false,
    createdAt: "2026-07-23T10:00:00.000Z",
    updatedAt: "2026-07-23T10:00:00.000Z",
  };
}

function sessionFor(userId) {
  return {
    accessToken: `token-${userId}`,
    refreshToken: `token-${userId}`,
    expiresAt: future,
    user: { id: userId, profileStatus: "complete" },
  };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
