import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SESSION_KEY = "humi:native-session:v1";
const future = Date.now() + 60 * 60 * 1000;

await verifyGuestDecisionFlow();
await verifyAuthenticatedServerFlowAndPendingGuards();
await verifyTimeoutFallbackAndStateConflictRefresh();
await verifyRunRecoveryAndNavigation();
await verifyForegroundRunRefresh();
await verifyOwnerAndMemberPermissions();
await verifyGuestMergeAndAccountIsolation();
verifyInteractiveComponents();

console.log("Native Tonight decision flow checks passed.");

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
  resume.primaryAction();
  assert.equal(resume.events[0].name, "start");
  resume.data.mealRun = { status: "cooking" };
  resume.primaryAction();
  assert.equal(resume.events[1].name, "resume");
  resume.data.mealRun = { status: "completed" };
  resume.primaryAction();
  assert.equal(resume.events.length, 2, "completed dinner must stay read-only");
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
    const methods = isComponent ? definition.methods || {} : definition;
    const instance = {
      ...methods,
      data: clone(definition.data || {}),
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

function bootstrapFor({ userId = "", householdId = "", role = "", currentMealRun = null } = {}) {
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
    capabilities: { nativeShellEnabled: true, mealExecutionEnabled: true },
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
