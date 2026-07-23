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
await verifyPassiveConcurrencyAndBackgroundRestore();
await verifyRapidTapAndMonotonicProgress();
await verifyOfflineRecoveryAndAccountIsolation();
await verifyNetworkRaceQueuesMutation();
await verifyOfflinePlannedRunStaysActionable();
await verifyAllDowngrades();
await verifyConflictFreezeAndReload();
await verifyGuestLifecycle();
await verifyMemberPermissionsAndCompletedReadOnly();
verifyPresentationContracts();

console.log("Native whole-meal cooking checks passed.");

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
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: active.id, action: "start" });
  assert.equal(page.data.mealRun.status, "cooking");
  assert.equal(page.data.currentActiveStep.id, timeline.steps[0].id);
  assert.equal(calls.filter((call) => call.path.endsWith("/start")).length, 1);

  await page.advanceStep({ currentTarget: { dataset: { stepId: timeline.steps[0].id } } });
  assert.equal(page.data.mealRun.currentStepId, timeline.steps[1].id);
  assert.equal(page.data.runningTimers.length, 1);
  await page.advanceStep({ currentTarget: { dataset: { stepId: timeline.steps[1].id } } });
  assert.equal(page.data.mealRun.currentStepId, timeline.steps[2].id);

  await page.completeMeal();
  await page.completeMeal();
  assert.equal(page.data.mealRun.status, "completed");
  assert.equal(calls.filter((call) => call.path.endsWith("/complete")).length, 1, "serve must be exactly once");

  await page.saveFeedback({ detail: { value: "want_again" } });
  await page.saveFeedback({ detail: { value: "want_again" } });
  assert.equal(page.data.feedbackValue, "want_again");
  assert.equal(calls.filter((call) => call.path.endsWith("/feedback")).length, 1, "feedback must write once per value");
}

async function verifyPassiveConcurrencyAndBackgroundRestore() {
  const cooking = remoteRun({
    status: "cooking",
    currentStepId: timeline.steps[2].id,
    timerEndsAt: timeline.steps[1].endsAt,
  });
  const runtime = createRuntime({
    initialRun: cooking,
    now: "2026-07-23T10:01:30.000Z",
  });
  const timelineHelpers = runtime.load("miniprogram/utils/meal-timeline.js");
  assert.equal(
    timelineHelpers.nextAvailableTimelineStep(timeline, timeline.steps[1].id, "2026-07-23T10:01:30.000Z").id,
    timeline.steps[2].id,
    "an independent active step can start while a passive timer runs on another resource",
  );
  assert.equal(
    timelineHelpers.nextAvailableTimelineStep(timeline, timeline.steps[2].id, "2026-07-23T10:02:00.000Z"),
    null,
    "a step cannot bypass an unfinished passive dependency",
  );
  assert.equal(
    timelineHelpers.nextAvailableTimelineStep(timeline, timeline.steps[2].id, "2026-07-23T10:03:00.000Z").id,
    timeline.steps[3].id,
    "the dependent step unlocks from the passive endsAt timestamp",
  );
  const page = runtime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await page.onLoad({ mealRunId: cooking.id });
  assert.equal(page.data.currentActiveStep.id, timeline.steps[2].id, "only one active step is shown");
  assert.deepEqual(page.data.runningTimers.map((item) => item.id), [timeline.steps[1].id], "passive work may run beside an active step");
  assert.equal(page.data.runningTimers[0].remainingSeconds, 90);
  page.onHide();
  runtime.advanceClock(90_000);
  await page.onShow();
  assert.equal(page.data.runningTimers[0].remainingSeconds, 0, "foreground recovery derives from endsAt");
  assert(!JSON.stringify(runtime.storageEntries()).includes('"remainingCounter"'), "a decrementing timer is never persisted");
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
            timerEndsAt: data.timerEndsAt,
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

  runtime.setOnline(true);
  await page.onShow();
  await runtime.settle();
  assert.equal(sharedStorage.get("humi:offline-queue:v1:member-a").length, 1, "the old account runtime cannot replay after account B became active");

  const resumedA = createRuntime({
    initialRun: cooking,
    storage: sharedStorage,
    userId: "member-a",
    online: true,
  });
  const resumedPage = resumedA.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await resumedPage.onLoad({ mealRunId: cooking.id });
  await resumedPage.onShow();
  await resumedPage.onShow();
  await resumedA.settle();
  assert.equal(resumedPage.data.unsyncedCount, 0);
  assert.equal(resumedPage.data.showBackWarning, false);
  assert(
    resumedA.requests.some((request) => request.path.endsWith("/progress") && request.data.currentStepId === timeline.steps[1].id),
    `reconnecting replays the allowlisted progress endpoint: ${JSON.stringify(resumedA.requests)}`,
  );
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

  const completed = remoteRun({ status: "completed", completedAt: "2026-07-23T10:04:00.000Z" });
  const readOnlyRuntime = createRuntime({ initialRun: completed });
  const readOnlyPage = readOnlyRuntime.loadPage("miniprogram/packageCooking/pages/cooking/index.js");
  await readOnlyPage.onLoad({ mealRunId: completed.id, action: "start" });
  await readOnlyPage.advanceStep({ currentTarget: { dataset: { stepId: timeline.steps[0].id } } });
  await readOnlyPage.completeMeal();
  assert.equal(readOnlyRuntime.requests.filter((item) => item.method !== "GET").length, 0, "completed dinner is read-only");
}

function verifyPresentationContracts() {
  const pageWxml = readFileSync(path.join(root, "miniprogram/packageCooking/pages/cooking/index.wxml"), "utf8");
  const pageJson = JSON.parse(readFileSync(path.join(root, "miniprogram/packageCooking/pages/cooking/index.json"), "utf8"));
  assert.match(pageWxml, /<cooking-step/);
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
      run = { ...run, status: "cooking", timeline, currentStepId: timeline.steps[0].id, startedAt: timeline.startedAt };
    } else if (pathname.endsWith("/progress")) {
      run = { ...run, currentStepId: data.currentStepId, timerEndsAt: data.timerEndsAt || "" };
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
          timerEndsAt: call.data.timerEndsAt || "",
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

function resolveModule(candidate) {
  for (const option of [candidate, `${candidate}.js`, `${candidate}.json`]) {
    if (existsSync(option)) return option;
  }
  return candidate;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
