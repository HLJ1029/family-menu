import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import vm from "node:vm";
import { formatBusinessDateKey } from "../api/recommendation-rotation.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const snapshotPath = resolve(root, "miniprogram/utils/share-snapshot.js");
const behaviorPath = resolve(root, "miniprogram/behaviors/shareable-page.js");

assert(
  existsSync(snapshotPath),
  "native share snapshots must be owned by miniprogram/utils/share-snapshot.js",
);

const snapshotRuntime = loadCommonJs(snapshotPath, {
  "./request": {
    requestHumi: async () => {
      throw new Error("unexpected default request");
    },
  },
  "./share-routing": {
    buildNativeSharePayload: () => {
      throw new Error("unexpected default routing");
    },
  },
  "./telemetry": { trackEvent: () => null },
});

const {
  clearPreparedShares,
  getPreparedShare,
  prepareShareSnapshot,
  snapshotKey,
} = snapshotRuntime;

clearPreparedShares();
const context = {
  householdId: "household-1",
  stateVersion: "state-v3",
  mealRunId: "meal-run-7",
};
assert.equal(
  snapshotKey("menu", context),
  "menu:household-1:state-v3:meal-run-7",
);
assert.notEqual(
  snapshotKey("meal_task", { ...context, taskId: "task-a" }),
  snapshotKey("meal_task", { ...context, taskId: "task-b" }),
  "meal-task snapshots must include taskId so selecting another task invalidates the old card",
);

let createCalls = 0;
const createSnapshot = async () => {
  createCalls += 1;
  return {
    token: "menu_snapshot_token_1234567890",
    expiresAt: Date.now() + 60_000,
    payload: {
      title: "我们家今晚菜单",
      path: "/packageShare/pages/menu/index?menuShare=menu_snapshot_token_1234567890&shareSource=menu",
    },
  };
};

const [first, concurrent] = await Promise.all([
  prepareShareSnapshot("menu", { ...context, createSnapshot }),
  prepareShareSnapshot("menu", { ...context, createSnapshot }),
]);
const repeated = await prepareShareSnapshot("menu", { ...context, createSnapshot });
assert.equal(createCalls, 1, "the same snapshot key must be prepared exactly once");
assert.equal(concurrent, first);
assert.equal(repeated, first);
assert.equal(getPreparedShare("menu", context), first);
assert.match(first.payload.path, /menuShare=[A-Za-z0-9_-]{24,64}/);

clearPreparedShares();
let failedCalls = 0;
await assert.rejects(
  prepareShareSnapshot("grocery", {
    ...context,
    createSnapshot: async () => {
      failedCalls += 1;
      throw new Error("snapshot unavailable");
    },
  }),
  /snapshot unavailable/,
);
await prepareShareSnapshot("grocery", {
  ...context,
  createSnapshot: async () => {
    failedCalls += 1;
    return {
      token: "grocery_snapshot_token_123456",
      expiresAt: Date.now() + 60_000,
      payload: {
        title: "我们家的买菜清单",
        path: "/packageShare/pages/grocery/index?groceryShare=grocery_snapshot_token_123456&shareSource=grocery",
      },
    };
  },
});
assert.equal(failedCalls, 2, "a failed preparation must be evicted for explicit retry");

assert(
  existsSync(behaviorPath),
  "share readiness must be implemented once in miniprogram/behaviors/shareable-page.js",
);

const routing = loadCommonJs(resolve(root, "miniprogram/utils/share-routing.js"));
const shareTokens = {
  menu: "menu_snapshot_token_1234567890",
  grocery: "grocery_snapshot_token_123456",
  invite: "invite_snapshot_token_123456789",
  meal_task: "meal_task_snapshot_token_123456",
};
assert.deepEqual(
  plain(routing.buildNativeSharePayload("menu", {
    token: shareTokens.menu,
    title: "今晚菜单",
  })),
  {
    title: "今晚菜单",
    path: `/packageShare/pages/menu/index?menuShare=${shareTokens.menu}&shareSource=menu`,
  },
);
assert.match(
  routing.buildNativeSharePayload("grocery", { token: shareTokens.grocery }).path,
  /^\/packageShare\/pages\/grocery\/index\?groceryShare=/,
);
assert.match(
  routing.buildNativeSharePayload("invite", { token: shareTokens.invite }).path,
  /^\/packageFamily\/pages\/invite\/index\?token=/,
);
assert.match(
  routing.buildNativeSharePayload("meal_task", { token: shareTokens.meal_task }).path,
  /^\/packageFamily\/pages\/task\/index\?mealTask=/,
);

const appJson = JSON.parse(readFileSync(resolve(root, "miniprogram/app.json"), "utf8"));
const packageShare = appJson.subPackages.find((item) => item.root === "packageShare");
assert(packageShare, "app.json must register the native packageShare subpackage");
assert.deepEqual(packageShare.pages.sort(), ["pages/grocery/index", "pages/menu/index"]);

for (const [page, shareType] of [
  ["miniprogram/pages/tonight/index", "menu"],
  ["miniprogram/pages/grocery/index", "grocery"],
  ["miniprogram/pages/family/index", "meal_task"],
  ["miniprogram/packageFamily/pages/invite/index", "invite"],
]) {
  const js = readFileSync(resolve(root, `${page}.js`), "utf8");
  const wxml = readFileSync(resolve(root, `${page}.wxml`), "utf8");
  const config = JSON.parse(readFileSync(resolve(root, `${page}.json`), "utf8"));
  assert.match(js, /shareable-page/, `${page} must use the shared native share readiness behavior`);
  assert.doesNotMatch(js, /async\s+onShareAppMessage/, `${page} share callback must stay synchronous`);
  assert.match(wxml, /open-type="share"/, `${page} must render a real WeChat share button`);
  assert.match(wxml, /disabled="\{\{[^}]*preparedShares/, `${page} must disable sharing until prepared`);
  assert.match(wxml, /loading="\{\{[^}]*sharePreparing/, `${page} must expose share preparation loading`);
  assert.match(wxml, /分享内容没准备好，点这里重试/, `${page} must expose a clickable preparation retry`);
  assert.match(wxml, /bindtap="(?:retryNativeShare|retryInviteShare)"/, `${page} share preparation error must have a handler`);
  assert.equal(config.enableShareAppMessage, true, `${page} must enable WeChat app-message sharing`);
}

for (const page of [
  "miniprogram/packageShare/pages/menu/index",
  "miniprogram/packageShare/pages/grocery/index",
  "miniprogram/packageFamily/pages/task/index",
]) {
  for (const extension of ["js", "json", "wxml", "wxss"]) {
    assert(existsSync(resolve(root, `${page}.${extension}`)), `${page}.${extension} must exist`);
  }
}

const telemetrySource = readFileSync(resolve(root, "miniprogram/utils/telemetry.js"), "utf8");
assert.match(telemetrySource, /shareSource/, "shareSource must be an allowlisted telemetry dimension");
assert.doesNotMatch(
  telemetrySource.match(/EVENT_FIELDS\s*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1] || "",
  /token/i,
  "opaque share tokens must never enter telemetry",
);

await assertDynamicNativeSharePages();
await assertNativeShareApiContracts();

console.log("Native sharing validation passed.");

function loadCommonJs(filename, mocks = {}) {
  const module = { exports: {} };
  const source = readFileSync(filename, "utf8");
  const context = vm.createContext({
    module,
    exports: module.exports,
    require(specifier) {
      if (Object.prototype.hasOwnProperty.call(mocks, specifier)) return mocks[specifier];
      throw new Error(`Unexpected dependency ${specifier} from ${filename}`);
    },
    Date,
    Promise,
    Map,
    Set,
    console,
    setTimeout,
    clearTimeout,
  });
  new vm.Script(source, { filename }).runInContext(context);
  return module.exports;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

async function nextTurn() {
  await new Promise((resolveTurn) => setTimeout(resolveTurn, 0));
}

async function assertDynamicNativeSharePages() {
  await assertTonightSharePage();
  await assertGroceryShareRetry();
  await assertInviteSharePage();
  await assertMealTaskSharePage();
  await assertGuestShareLandings();
}

async function assertTonightSharePage() {
  let createCalls = 0;
  const events = [];
  const bootstrap = nativeBootstrap();
  const replacementRun = {
    id: "meal-run-2",
    status: "planned",
    effortTier: "quick_15",
    recipeIds: ["mapo-tofu"],
    recipeSnapshot: [{ id: "mapo-tofu", title: "麻婆豆腐", totalMinutes: 20 }],
  };
  const runtime = createMiniRuntime({
    mocks: {
      "miniprogram/utils/native-shell-guard.js": { guardNativeTab: () => true },
      "miniprogram/utils/store.js": { appStore: { getState: () => ({ bootstrap }) } },
      "miniprogram/utils/recommendation.js": { recommendDinner: async () => null },
      "miniprogram/utils/meal-run.js": {
        buildDinnerPlan: () => ({ missingIngredients: [] }),
        canReplaceHouseholdPlan: () => true,
        createMealRun: async () => replacementRun,
        currentHouseholdRole: () => "member",
        formatDinnerDateKey: () => "2026-07-24",
        loadCurrentMealRun: async () => null,
        mergeActiveGuestMealRun: async () => ({}),
      },
      "miniprogram/utils/request.js": {
        requestHumi: async (options) => {
          if (options.path === "/menu-share-requests") {
            createCalls += 1;
            const isReplacement = options.data?.dishes?.some((dish) => dish.id === "mapo-tofu");
            return {
              request: {
                token: isReplacement
                  ? "menu_replacement_snapshot_123456"
                  : "menu_dynamic_snapshot_token_1234",
                title: "今晚菜单",
                householdName: "分享测试家",
              },
            };
          }
          throw new Error(`unexpected request ${options.path}`);
        },
      },
      "miniprogram/utils/telemetry.js": { trackEvent: (name, fields) => events.push({ name, fields }) },
    },
  });
  const page = runtime.loadPage("miniprogram/pages/tonight/index.js");
  page._initialized = true;
  page._skipFirstShow = false;
  page.refreshVisibleMealRun = async () => null;
  page.setData({
    householdRole: "member",
    mealRun: {
      id: "meal-run-1",
      status: "planned",
      recipeSnapshot: [{ id: "tomato-egg", title: "西红柿炒鸡蛋", totalMinutes: 15 }],
    },
    plan: { missingIngredients: [] },
  });
  await page.onShow();
  await page.onShow();
  assert.equal(createCalls, 1, "Tonight onShow must prepare one menu snapshot for one stable key");
  const beforeShare = createCalls;
  const payload = page.onShareAppMessage({ from: "menu" });
  assert.match(payload.path, /^\/packageShare\/pages\/menu\/index\?menuShare=/);
  assert.equal(createCalls, beforeShare, "the system menu share callback must stay synchronous");
  assert.equal(events.filter((event) => event.name === "share_snapshot_created").length, 1);
  assert.equal(events.find((event) => event.name === "share_snapshot_created").fields.shareSource, "menu");
  assert.equal(JSON.stringify(events).includes("menu_dynamic_snapshot_token_1234"), false);

  page.setData({
    recommendation: { recommendationId: "recommendation-2", recipeIds: ["mapo-tofu"] },
    effortTier: "quick_15",
    canReplacePlan: true,
  });
  await page.acceptRecommendation();
  assert.equal(page.data.mealRun.id, "meal-run-2");
  assert.equal(createCalls, 2, "accepting a new dinner without leaving Tonight must prepare its new snapshot");
  assert.match(
    page.onShareAppMessage({ from: "menu" }).path,
    /menuShare=menu_replacement_snapshot_123456/,
    "the immediate system share after confirmation must use the newly accepted dinner",
  );
}

async function assertGroceryShareRetry() {
  let createCalls = 0;
  let bootstrap = nativeBootstrap();
  let offline = false;
  let conflict = false;
  const runtime = createMiniRuntime({
    mocks: {
      "miniprogram/utils/native-shell-guard.js": { guardNativeTab: () => true },
      "miniprogram/utils/store.js": {
        appStore: {
          getState: () => ({ bootstrap }),
          replaceBootstrap: (next) => { bootstrap = next; },
        },
      },
      "miniprogram/utils/request.js": {
        requestHumi: async (options) => {
          if (options.path !== "/grocery-share-requests") throw new Error(`unexpected request ${options.path}`);
          createCalls += 1;
          if (createCalls === 1) throw new Error("first preparation failed");
          return {
            request: {
              token: `grocery_state_${createCalls}_snapshot_123456`,
              householdName: "分享测试家",
            },
          };
        },
      },
      "miniprogram/utils/telemetry.js": { trackEvent: () => null },
      "miniprogram/utils/offline-queue.js": { enqueueMutation: () => null },
      "miniprogram/utils/household-state.js": {
        applyGroceryState: (items) => items,
        createMutationId: () => "grocery-action",
        deriveGroceryItems: () => [{ id: "egg", name: "鸡蛋", amount: "3 个", checked: false }],
        getActiveHousehold: () => bootstrap.households[0],
        getHouseholdRole: () => "member",
        saveHouseholdStatePatch: async (patch) => {
          if (offline) {
            const error = new Error("offline");
            error.status = 0;
            throw error;
          }
          if (conflict) {
            conflict = false;
            const error = new Error("state version conflict");
            error.status = 409;
            error.code = "state_version_conflict";
            error.latestEnvelope = {
              ...bootstrap,
              stateVersion: "state-v4",
              householdState: {
                ...bootstrap.householdState,
                checkedItems: { egg: false },
              },
            };
            throw error;
          }
          const isClaim = Boolean(patch?.groceryClaims);
          return {
            ...bootstrap,
            stateVersion: isClaim ? "state-v3" : "state-v2",
            householdState: {
              ...bootstrap.householdState,
              ...(isClaim
                ? { groceryClaims: patch.groceryClaims }
                : { checkedItems: { egg: true } }),
            },
          };
        },
      },
    },
  });
  const page = runtime.loadPage("miniprogram/pages/grocery/index.js");
  await page.onShow();
  assert.equal(createCalls, 1);
  assert.equal(page.data.preparedShares.grocery, null);
  assert.equal(page.data.shareErrors.grocery, "分享内容没准备好，点这里重试");
  await page.retryNativeShare({ currentTarget: { dataset: { shareType: "grocery" } } });
  assert.equal(createCalls, 2);
  assert(page.data.preparedShares.grocery);
  await page.onShow();
  assert.equal(createCalls, 2, "successful retry must be reused by later Grocery onShow");
  const payload = page.onShareAppMessage({ from: "menu" });
  assert.match(payload.path, /^\/packageShare\/pages\/grocery\/index\?groceryShare=/);
  assert.equal(createCalls, 2);

  bootstrap = { ...bootstrap, cacheState: "cached" };
  await page.onShow();
  assert.equal(
    page.data.preparedShares.grocery,
    null,
    "entering a cached background state must invalidate the previously prepared online grocery card",
  );
  assert.equal(
    page.onShareAppMessage({ from: "menu" }).path,
    "/pages/grocery/index",
    "a cached Grocery onShow must fall back instead of sharing the stale online snapshot",
  );
  bootstrap = { ...bootstrap, cacheState: "" };
  await page.onShow();
  assert.equal(createCalls, 2, "returning online may reuse the still-current server snapshot");

  await page.checkItem({ detail: { itemId: "egg", checked: true } });
  assert.equal(createCalls, 3, "a successful grocery mutation must prepare a snapshot for the latest stateVersion");
  assert.match(page.onShareAppMessage({ from: "menu" }).path, /grocery_state_3_snapshot_123456/);

  await page.claimItem({ detail: { itemId: "egg" } });
  assert.equal(createCalls, 4, "a successful claim must prepare a snapshot for its new stateVersion");
  assert.match(page.onShareAppMessage({ from: "menu" }).path, /grocery_state_4_snapshot_123456/);

  conflict = true;
  await page.checkItem({ detail: { itemId: "egg", checked: false } });
  assert.equal(createCalls, 5, "a 409 reload must prepare the authoritative latest stateVersion");
  assert.match(page.onShareAppMessage({ from: "menu" }).path, /grocery_state_5_snapshot_123456/);

  offline = true;
  await page.checkItem({ detail: { itemId: "egg", checked: true } });
  assert.equal(page.data.preparedShares.grocery, null, "an offline grocery mutation must invalidate the old online card");
  assert.equal(
    page.data.shareErrors.grocery,
    "",
    "offline invalidation must not advertise a retry after its online snapshot context was cleared",
  );
  assert.equal(
    page.onShareAppMessage({ from: "menu" }).path,
    "/pages/grocery/index",
    "offline state must never share a stale prepared snapshot",
  );
}

async function assertInviteSharePage() {
  let createCalls = 0;
  const bootstrap = nativeBootstrap({ role: "owner" });
  const runtime = createMiniRuntime({
    mocks: {
      "miniprogram/utils/bootstrap.js": { loadBootstrap: async () => bootstrap },
      "miniprogram/utils/request.js": {
        rawRequest: async () => ({}),
        requestHumi: async (options) => {
          if (options.path !== "/household-invites") throw new Error(`unexpected request ${options.path}`);
          createCalls += 1;
          return {
            invite: {
              token: "invite_dynamic_snapshot_1234567",
              householdName: "分享测试家",
              inviterName: "主厨",
              status: "open",
            },
          };
        },
      },
      "miniprogram/utils/session.js": { getSession: () => ({ user: bootstrap.user }) },
      "miniprogram/utils/store.js": { appStore: { getState: () => ({ bootstrap }), replaceBootstrap: () => {} } },
      "miniprogram/utils/telemetry.js": { trackEvent: () => null },
    },
  });
  const page = runtime.loadPage("miniprogram/packageFamily/pages/invite/index.js");
  await page.onLoad({ mode: "prepare", householdId: bootstrap.activeHouseholdId });
  await page.prepareInvite();
  await page.prepareInvite();
  assert.equal(createCalls, 1, "explicit invite preparation must be exactly once");
  const payload = page.onShareAppMessage({ from: "button" });
  assert.match(payload.path, /^\/packageFamily\/pages\/invite\/index\?token=/);
  assert.equal(createCalls, 1);
}

async function assertMealTaskSharePage() {
  let createCalls = 0;
  const bootstrap = nativeBootstrap();
  bootstrap.currentMealRun = {
    id: "meal-run-1",
    tasks: [
      { id: "task-a", label: "请家人买鸡蛋", type: "buy", status: "open", createdBy: "owner-1" },
      { id: "task-b", label: "帮忙洗青菜", type: "prep", status: "open", createdBy: "owner-1" },
    ],
  };
  const pendingTaskShares = new Map();
  const runtime = createMiniRuntime({
    mocks: {
      "miniprogram/utils/bootstrap.js": { loadBootstrap: async () => bootstrap },
      "miniprogram/utils/native-shell-guard.js": { guardNativeTab: () => true },
      "miniprogram/utils/request.js": {
        requestHumi: async (options) => {
          if (options.path.endsWith("/collaborations?limit=5")) return { events: [] };
          if (options.path.endsWith("/tasks")) return { tasks: bootstrap.currentMealRun.tasks };
          if (options.path.startsWith("/meal-tasks/") && options.path.endsWith("/share")) {
            createCalls += 1;
            return new Promise((resolveShare) => pendingTaskShares.set(options.path, resolveShare));
          }
          throw new Error(`unexpected request ${options.path}`);
        },
      },
      "miniprogram/utils/store.js": { appStore: { getState: () => ({ bootstrap }), replaceBootstrap: () => {} } },
      "miniprogram/utils/telemetry.js": { trackEvent: () => null },
    },
  });
  const page = runtime.loadPage("miniprogram/pages/family/index.js");
  const firstShow = page.onShow();
  await nextTurn();
  assert.equal(createCalls, 1);
  const switchToB = page.prepareMealTaskShare({ currentTarget: { dataset: { taskId: "task-b" } } });
  await nextTurn();
  assert.equal(createCalls, 2, "switching tasks while A is pending must prepare B independently");
  pendingTaskShares.get("/meal-tasks/task-b/share")({
    snapshot: {
      token: "meal_task_b_snapshot_12345678",
      cacheExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  await switchToB;
  pendingTaskShares.get("/meal-tasks/task-a/share")({
    snapshot: {
      token: "meal_task_a_snapshot_12345678",
      cacheExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  await firstShow;
  await page.onShow();
  assert.equal(createCalls, 2, "Family onShow must reuse the stable selected task snapshot");
  const payload = page.onShareAppMessage({ from: "menu" });
  assert.match(payload.path, /mealTask=meal_task_b_snapshot_12345678/);
  assert.equal(page.data.shareableMealTask.id, "task-b");
  assert.equal(createCalls, 2);
}

async function assertGuestShareLandings() {
  for (const fixture of [
    {
      page: "miniprogram/packageShare/pages/menu/index.js",
      option: "menuShare",
      source: "menu",
      pathPrefix: "/menu-share-requests/",
      response: { request: { status: "open", dishes: [], householdName: "分享测试家" } },
    },
    {
      page: "miniprogram/packageShare/pages/grocery/index.js",
      option: "groceryShare",
      source: "grocery",
      pathPrefix: "/grocery-share-requests/",
      response: { request: { status: "open", items: [], householdName: "分享测试家" } },
    },
    {
      page: "miniprogram/packageFamily/pages/invite/index.js",
      option: "token",
      source: "invite",
      pathPrefix: "/household-invites/",
      response: { invite: { status: "open", householdName: "分享测试家", inviterName: "主厨" } },
    },
    {
      page: "miniprogram/packageFamily/pages/task/index.js",
      option: "mealTask",
      source: "meal_task",
      pathPrefix: "/meal-tasks/",
      response: {
        task: {
          status: "open",
          type: "buy",
          label: "请家人买鸡蛋",
          householdName: "分享测试家",
          updatedAt: "2026-07-24T08:00:00.000Z",
        },
      },
    },
  ]) {
    let getCalls = 0;
    const events = [];
    const runtime = createMiniRuntime({
      mocks: {
        "miniprogram/utils/request.js": {
          rawRequest: async (options) => {
            assert.match(options.path, new RegExp(`^${fixture.pathPrefix}`));
            getCalls += 1;
            return fixture.response;
          },
          requestHumi: async () => {
            throw new Error("guest landing must not use an authenticated request");
          },
        },
        "miniprogram/utils/telemetry.js": { trackEvent: (name, fields) => events.push({ name, fields }) },
      },
    });
    const invalid = runtime.loadPage(fixture.page);
    await invalid.onLoad({ [fixture.option]: "javascript:alert(1)", shareSource: fixture.source });
    assert.equal(getCalls, 0, "malformed guest share tokens must not reach the network");
    const page = runtime.loadPage(fixture.page);
    await page.onLoad({
      [fixture.option]: `${fixture.source}_guest_landing_token_123456`,
      shareSource: fixture.source,
    });
    page.onShow();
    page.onShow();
    assert.equal(getCalls, 1, "a valid native share landing performs one guest GET");
    assert.equal(events.filter((event) => event.name === "native_share_page_visible").length, 1);
    assert.equal(events[0].fields.shareSource, fixture.source);
    assert.equal(JSON.stringify(events).includes("guest_landing_token"), false);
    if (fixture.source === "meal_task") {
      const secondToken = "meal_task_second_landing_token_123456";
      const secondPage = runtime.loadPage(fixture.page);
      await secondPage.onLoad({
        [fixture.option]: secondToken,
        shareSource: fixture.source,
      });
      secondPage.onShow();
      assert.equal(getCalls, 2);
      assert.match(
        secondPage.onShareAppMessage({ from: "button" }).path,
        new RegExp(`mealTask=${secondToken}`),
        "different meal-task landing tokens with the same updatedAt must not collide in share cache",
      );
      assert.equal(JSON.stringify(events).includes(secondToken), false);
    }
  }
}

function nativeBootstrap({ role = "member" } = {}) {
  return {
    schemaVersion: 1,
    stateVersion: "state-v1",
    activeHouseholdId: "household-1",
    user: { id: "member-1", displayName: "家人", profileStatus: "complete" },
    households: [{
      id: "household-1",
      name: "分享测试家",
      role,
      members: [{ memberId: "member-1", nickname: "家人", role }],
    }],
    householdState: { mealPlan: {}, pantryItems: [], groceryClaims: {} },
    currentMealRun: null,
  };
}

function createMiniRuntime({ mocks = {}, wx: wxOverride = {} } = {}) {
  const modules = new Map();
  const wx = {
    getStorageSync: () => "",
    setStorageSync: () => {},
    removeStorageSync: () => {},
    navigateTo: () => {},
    redirectTo: () => {},
    switchTab: () => {},
    showModal: ({ success }) => success?.({ confirm: false }),
    stopPullDownRefresh: () => {},
    ...wxOverride,
  };
  let pageDefinition = null;
  const pageDefinitions = new Map();

  function load(filename) {
    const absolute = resolveModule(filename);
    const projectPath = relative(root, absolute).replaceAll("\\", "/");
    if (Object.prototype.hasOwnProperty.call(mocks, projectPath)) return mocks[projectPath];
    if (modules.has(absolute)) return modules.get(absolute).exports;
    const record = { exports: {} };
    modules.set(absolute, record);
    const source = readFileSync(absolute, "utf8");
    const context = vm.createContext({
      module: record,
      exports: record.exports,
      require(specifier) {
        return load(resolve(dirname(absolute), specifier));
      },
      Page(definition) {
        pageDefinition = definition;
        pageDefinitions.set(absolute, definition);
      },
      Behavior(definition) {
        return definition;
      },
      getApp: () => ({ globalData: {}, setHumiSession: () => {} }),
      wx,
      console,
      Date,
      Promise,
      Map,
      Set,
      Math,
      JSON,
      structuredClone,
      encodeURIComponent,
      decodeURIComponent,
      setTimeout,
      clearTimeout,
    });
    new vm.Script(source, { filename: absolute }).runInContext(context);
    return record.exports;
  }

  return {
    loadPage(filename) {
      pageDefinition = null;
      const absolute = resolveModule(resolve(root, filename));
      load(absolute);
      pageDefinition = pageDefinitions.get(absolute) || pageDefinition;
      assert(pageDefinition, `${filename} must register a Page`);
      const behaviorMethods = Object.assign(
        {},
        ...(pageDefinition.behaviors || []).map((behavior) => behavior.methods || {}),
      );
      const behaviorData = Object.assign(
        {},
        ...(pageDefinition.behaviors || []).map((behavior) => behavior.data || {}),
      );
      return {
        ...behaviorMethods,
        ...pageDefinition,
        data: plain({ ...behaviorData, ...pageDefinition.data }),
        setData(patch) {
          this.data = { ...this.data, ...plain(patch) };
        },
      };
    },
  };
}

function resolveModule(filename) {
  for (const candidate of [filename, `${filename}.js`, `${filename}.json`]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot resolve ${filename}`);
}

async function assertNativeShareApiContracts() {
  const scratch = await mkdtemp(join(tmpdir(), "humi-native-sharing-"));
  process.env.HUMI_API_DATA_FILE = join(scratch, "data.json");
  process.env.HUMI_SESSION_SECRET = "native-sharing-test-secret";
  process.env.HUMI_WECHAT_MOCK = "1";
  process.env.HUMI_MEAL_EXECUTION_ENABLED = "1";
  process.env.HUMI_MEAL_EXECUTION_HOUSEHOLDS = "*";
  const { createHumiApiServer } = await import("../api/server.js");
  const server = createHumiApiServer();
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const owner = await api(origin, "/auth/wechat/login", {
      method: "POST",
      body: { code: "native-share-owner" },
      expectedStatus: 200,
    });
    const member = await api(origin, "/auth/wechat/login", {
      method: "POST",
      body: { code: "native-share-member" },
      expectedStatus: 200,
    });
    const outsider = await api(origin, "/auth/wechat/login", {
      method: "POST",
      body: { code: "native-share-outsider" },
      expectedStatus: 200,
    });
    const household = await api(origin, "/households", {
      method: "POST",
      token: owner.accessToken,
      expectedStatus: 201,
      body: { householdName: "分享测试家", memberName: "主厨" },
    });
    const invite = await api(origin, "/household-invites", {
      method: "POST",
      token: owner.accessToken,
      expectedStatus: 201,
      body: {
        householdId: household.family.id,
        inviterName: "伪造邀请人",
        idempotencyKey: "owner-invite-share-v1",
      },
    });
    assert.equal(
      invite.invite.inviterName,
      household.family.members.find((entry) => entry.memberId === owner.user.id)?.nickname,
      "invite identity must come from the canonical household member profile",
    );
    const repeatedInvite = await api(origin, "/household-invites", {
      method: "POST",
      token: owner.accessToken,
      expectedStatus: 201,
      body: {
        householdId: household.family.id,
        inviterName: "另一个伪造邀请人",
        idempotencyKey: "owner-invite-share-v1",
      },
    });
    assert.equal(repeatedInvite.invite.token, invite.invite.token, "invite retries must converge on one snapshot");
    const joined = await api(origin, `/household-invites/${invite.invite.token}/join`, {
      method: "POST",
      token: member.accessToken,
      expectedStatus: 200,
      body: {},
    });
    const memberName = joined.family.members.find((entry) => entry.memberId === member.user.id)?.nickname;

    const menuBody = {
      householdId: household.family.id,
      householdName: "伪造家庭名",
      initiatorName: "伪造发起人",
      title: "今晚菜单",
      idempotencyKey: "member-menu-share-v1",
      dishes: [{ id: "tomato-egg", name: "西红柿炒鸡蛋", timeMinutes: 15 }],
    };
    const memberMenu = await api(origin, "/menu-share-requests", {
      method: "POST",
      token: member.accessToken,
      expectedStatus: 201,
      body: menuBody,
    });
    const memberMenuRepeat = await api(origin, "/menu-share-requests", {
      method: "POST",
      token: member.accessToken,
      expectedStatus: 201,
      body: { ...menuBody, title: "不能覆盖的菜单" },
    });
    assert.equal(memberMenuRepeat.request.token, memberMenu.request.token);
    const publicMenu = await api(origin, `/menu-share-requests/${memberMenu.request.token}`);
    assert.equal(publicMenu.request.dishes[0].name, "西红柿炒鸡蛋");
    assert.equal(publicMenu.request.householdName, household.family.name);
    assert.equal(publicMenu.request.initiatorName, memberName);
    for (const internalField of ["token", "ownerId", "householdId", "id"]) {
      assert.equal(Object.hasOwn(publicMenu.request, internalField), false);
    }
    assert.equal(Object.hasOwn(publicMenu.request.dishes[0], "recipeId"), false);

    const memberGrocery = await api(origin, "/grocery-share-requests", {
      method: "POST",
      token: member.accessToken,
      expectedStatus: 201,
      body: {
        householdId: household.family.id,
        householdName: "伪造清单家庭",
        initiatorName: "伪造清单发起人",
        mode: "read_only",
        idempotencyKey: "member-grocery-share-v1",
        items: [{ id: "egg", name: "鸡蛋", amount: "3 个" }],
      },
    });
    const publicGrocery = await api(origin, `/grocery-share-requests/${memberGrocery.request.token}`);
    assert.equal(publicGrocery.request.mode, "read_only");
    assert.equal(publicGrocery.request.items[0].name, "鸡蛋");
    assert.equal(publicGrocery.request.householdName, household.family.name);
    assert.equal(publicGrocery.request.initiatorName, memberName);
    for (const internalField of ["token", "ownerId", "householdId"]) {
      assert.equal(Object.hasOwn(publicGrocery.request, internalField), false);
    }

    const dinnerDateKey = formatBusinessDateKey(new Date(), "Asia/Shanghai");
    assert.equal(
      formatBusinessDateKey(new Date("2026-07-23T15:59:59.000Z"), "Asia/Shanghai"),
      "2026-07-23",
    );
    assert.equal(
      formatBusinessDateKey(new Date("2026-07-23T16:00:00.000Z"), "Asia/Shanghai"),
      "2026-07-24",
      "native sharing fixtures must cross at Shanghai midnight, not UTC midnight",
    );
    const mealRun = await api(origin, "/meal-runs", {
      method: "POST",
      token: owner.accessToken,
      expectedStatus: 201,
      body: {
        householdId: household.family.id,
        dateKey: dinnerDateKey,
        mealSlot: "dinner",
        effortTier: "quick_15",
        recipeIds: ["tomato-egg"],
        idempotencyKey: "native-share-meal-run",
      },
    });
    const task = await api(origin, `/meal-runs/${mealRun.mealRun.id}/tasks`, {
      method: "POST",
      token: owner.accessToken,
      expectedStatus: 201,
      body: { type: "buy", ingredientName: "鸡蛋" },
    });
    const summaries = await api(origin, `/meal-runs/${mealRun.mealRun.id}/tasks`, {
      token: member.accessToken,
    });
    assert.equal(Object.hasOwn(summaries.tasks[0], "token"), false, "task lists must stay token-free");
    const taskShare = await api(origin, `/meal-tasks/${task.task.id}/share`, {
      method: "POST",
      token: member.accessToken,
      expectedStatus: 201,
      body: { idempotencyKey: "member-task-share-v1" },
    });
    assert.deepEqual(
      Object.keys(taskShare.snapshot).sort(),
      ["cacheExpiresAt", "token"].sort(),
      "task share preparation must return only the token and expiry",
    );
    const repeatedTaskShare = await api(origin, `/meal-tasks/${task.task.id}/share`, {
      method: "POST",
      token: member.accessToken,
      expectedStatus: 201,
      body: { idempotencyKey: "member-task-share-v1" },
    });
    assert.equal(repeatedTaskShare.snapshot.token, taskShare.snapshot.token);
    const publicTask = await api(origin, `/meal-tasks/${taskShare.snapshot.token}`);
    assert.equal(publicTask.task.label, task.task.label, "task recipients can view the native landing before login");
    for (const internalField of ["token", "householdId", "mealRunId", "claimedBy", "createdBy", "completedBy"]) {
      assert.equal(Object.hasOwn(publicTask.task, internalField), false, `public task must omit ${internalField}`);
    }
    await api(origin, `/meal-tasks/${task.task.id}/share`, {
      method: "POST",
      token: outsider.accessToken,
      expectedStatus: 404,
      body: { idempotencyKey: "outsider-task-share" },
    });
    await api(origin, "/meal-tasks/javascript:alert(1)", { expectedStatus: 404 });

    await api(origin, "/household-invites", {
      method: "POST",
      token: member.accessToken,
      expectedStatus: 403,
      body: { householdId: household.family.id },
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(scratch, { recursive: true, force: true });
  }
}

async function api(origin, pathname, options = {}) {
  const headers = { "content-type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${origin}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json();
  const expectedStatus = options.expectedStatus ?? 200;
  assert.equal(response.status, expectedStatus, `${options.method || "GET"} ${pathname}: ${JSON.stringify(data)}`);
  return data;
}
