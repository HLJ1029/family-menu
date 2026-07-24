import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildMiniProgramPosterUrl, buildMiniProgramReminderUrl, buildMiniProgramShareUrl, requestMiniProgramPoster, requestMiniProgramReminder, requestMiniProgramShare } from "../src/lib/runtime.js";
import {
  createHouseholdInvite,
  createMenuShareRequest,
  subscribeHumiSessionInvalid,
  uploadPosterShare,
} from "../src/lib/humiApi.js";
import {
  buildPosterUploadIdempotencyKey,
  buildShareSnapshotKey,
  createAsyncSnapshotCache,
} from "../src/lib/shareSnapshot.js";
import { beginShareRecoveryReplay, clearShareRecovery, getShareRecovery, queueShareRecovery } from "../src/lib/shareRecovery.js";
import { shareLandingFixtures } from "./lib/native-share-qa-fixtures.mjs";

const {
  buildHumiUrl,
  buildNativeSharePayload,
  buildSharePayload,
  normalizeLaunchOptions,
  pathToQuery,
  shouldOpenAsGuest,
} = loadMiniProgramCommonJs("miniprogram/utils/share-routing.js");
const { validateShareLandingOptions } = loadShareLandingValidator();

const miniProgramApp = JSON.parse(readFileSync("miniprogram/app.json", "utf8"));
assert(miniProgramApp.pages.includes("pages/index/index"), "mini program app.json should include index page");
assert(miniProgramApp.pages.includes("pages/share/index"), "mini program app.json should include native share page");
assert(miniProgramApp.pages.includes("pages/poster/index"), "mini program app.json should include native poster page");
assert.deepEqual(
  miniProgramApp.subPackages.find((entry) => entry.root === "packageShare")?.pages?.sort(),
  ["pages/grocery/index", "pages/menu/index"],
  "menu and grocery recipients must land in the native share subpackage",
);
for (const [type, token, expectedPath] of [
  ["menu", "menu_native_snapshot_token_1234", "/packageShare/pages/menu/index?menuShare=menu_native_snapshot_token_1234&shareSource=menu"],
  ["grocery", "grocery_native_snapshot_123456", "/packageShare/pages/grocery/index?groceryShare=grocery_native_snapshot_123456&shareSource=grocery"],
  ["invite", "invite_native_snapshot_1234567", "/packageFamily/pages/invite/index?token=invite_native_snapshot_1234567&shareSource=invite"],
  ["meal_task", "meal_task_native_snapshot_12345", "/packageFamily/pages/task/index?mealTask=meal_task_native_snapshot_12345&shareSource=meal_task"],
]) {
  const payload = buildNativeSharePayload(type, { token });
  assert.equal(payload.path, expectedPath);
  assert.doesNotMatch(payload.path, /^\/pages\/boot\/index/, `${type} native sharing must not route recipients through WebView boot`);
}

assertMiniProgramSharePage("miniprogram/pages/legacy/index", { requiresOpenTypeButton: false, supportsTimeline: false });
assertMiniProgramSharePage("miniprogram/pages/share/index", { requiresOpenTypeButton: true, supportsTimeline: true });
assertNativeShareReceiptTemplate();
assertShareFeedbackDoesNotClaimUnverifiedSuccess();
assertMiniProgramVisibleCopyKeepsPantryInvisible();
assertMiniProgramGuestShareRouting();

const snapshotCache = createAsyncSnapshotCache();
let snapshotCreateCalls = 0;
const snapshotKey = buildShareSnapshotKey("menu", "family-1", {
  dishes: [{ id: "tomato-egg", quantity: 1 }],
  groceryCount: 3,
});

const posterHouseholdId = "123e4567-e89b-42d3-a456-426614174000";
const posterStateV1 = buildShareSnapshotKey("today_menu_poster_state", posterHouseholdId, {
  recipes: [{ id: "tomato-egg", quantity: 1 }],
  groceryCount: 2,
});
const posterStateV2 = buildShareSnapshotKey("today_menu_poster_state", posterHouseholdId, {
  recipes: [{ id: "tomato-egg", quantity: 2 }],
  groceryCount: 4,
});
const posterUploadKeyV1 = buildPosterUploadIdempotencyKey(posterHouseholdId, "default", posterStateV1);
const posterUploadKeyV2 = buildPosterUploadIdempotencyKey(posterHouseholdId, "default", posterStateV2);
assert(posterUploadKeyV1.length <= 100, "a poster upload key must fit the server contract without truncation");
assert(posterUploadKeyV2.length <= 100, "every poster content version must fit the server contract");
assert.notEqual(posterUploadKeyV1, posterUploadKeyV2, "poster content changes must produce a new upload key");
const createSnapshot = async () => {
  snapshotCreateCalls += 1;
  return { request: { token: "menu-snapshot-token" } };
};
const [firstSnapshot, concurrentSnapshot] = await Promise.all([
  snapshotCache.getOrCreate(snapshotKey, createSnapshot),
  snapshotCache.getOrCreate(snapshotKey, createSnapshot),
]);
const repeatedSnapshot = await snapshotCache.getOrCreate(snapshotKey, createSnapshot);
assert.equal(snapshotCreateCalls, 1, "the same share snapshot must be created exactly once");
assert.equal(firstSnapshot.request.token, "menu-snapshot-token");
assert.equal(concurrentSnapshot, firstSnapshot);
assert.equal(repeatedSnapshot, firstSnapshot);

let failedSnapshotCalls = 0;
await assert.rejects(
  snapshotCache.getOrCreate("menu:failed", async () => {
    failedSnapshotCalls += 1;
    throw new Error("first creation failed");
  }),
  /first creation failed/,
);
await snapshotCache.getOrCreate("menu:failed", async () => {
  failedSnapshotCalls += 1;
  return { request: { token: "retry-token" } };
});
assert.equal(failedSnapshotCalls, 2, "a failed snapshot must be evicted so one user retry can create it again");
assert.notEqual(
  buildShareSnapshotKey("menu", "family-1", { dishes: [{ id: "tomato-egg", quantity: 2 }], groceryCount: 3 }),
  snapshotKey,
  "a changed menu must produce a fresh snapshot key",
);

const recoveryStorage = createMemoryStorage();
assert.equal(queueShareRecovery("today_menu", recoveryStorage, 1_000), true, "the first 401 may schedule one silent recovery");
assert.equal(queueShareRecovery("today_menu", recoveryStorage, 1_050), false, "a concurrent caller must join the pending recovery");
assert.deepEqual(
  getShareRecovery(recoveryStorage, 1_050),
  { action: "today_menu", attempts: 1, state: "pending", context: null },
  "a duplicate original 401 must not cancel the pending recovery",
);
assert.deepEqual(
  beginShareRecoveryReplay(recoveryStorage, 1_100),
  { action: "today_menu", attempts: 1, context: null },
  "the refreshed H5 session should replay the queued share once",
);
assert.equal(queueShareRecovery("today_menu", recoveryStorage, 1_200), false, "a replayed 401 must not schedule a third request");
assert.equal(getShareRecovery(recoveryStorage, 1_200)?.state, "replaying");
clearShareRecovery(recoveryStorage);
assert.equal(beginShareRecoveryReplay(recoveryStorage, 1_300), null);
for (const action of ["invite", "poster_share", "poster_save"]) {
  const actionStorage = createMemoryStorage();
  const context = action.startsWith("poster_")
    ? {
        posterType: "grocery_list",
        styleId: "theme",
        stateVersion: "grocery_poster_state:family-1:content-v1",
      }
    : null;
  assert.equal(
    queueShareRecovery(action, actionStorage, 2_000, context),
    true,
    `${action} should permit one silent recovery`,
  );
  assert.deepEqual(
    beginShareRecoveryReplay(actionStorage, 2_100),
    { action, attempts: 1, context },
    `${action} recovery must survive a new WebView through storage`,
  );
  assert.equal(queueShareRecovery(action, actionStorage, 2_200), false, `${action} must not schedule a third request`);
}

const mainSource = readFileSync("src/main.jsx", "utf8");
assert.match(
  mainSource,
  /rebuildPosterPreviewForRecovery/,
  "a fresh H5 WebView must rebuild the lost poster Blob before replaying share or save",
);
assert.match(
  mainSource,
  /handoffPosterToMiniProgram\((?:action|["'](?:share|save)["']),\s*rebuiltPreview\)/,
  "poster recovery must hand off the rebuilt preview instead of the destroyed React state",
);

let recoveryInvalidations = 0;
let recoveryRequestBody = null;
const unsubscribeRecoveryInvalidation = subscribeHumiSessionInvalid(() => {
  recoveryInvalidations += 1;
});
const originalFetch = globalThis.fetch;
const uploadedPosterTokens = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const idempotencyKey = new Headers(options.headers).get("X-Humi-Idempotency-Key");
  const token = uploadedPosterTokens.get(idempotencyKey) || `poster-token-${uploadedPosterTokens.size + 1}`;
  uploadedPosterTokens.set(idempotencyKey, token);
  return new Response(JSON.stringify({
    poster: {
      token,
      format: "png",
      styleId: "default",
    },
  }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
};
try {
  const posterSession = { accessToken: "poster-session", user: { provider: "wechat" } };
  const firstVersion = await uploadPosterShare(
    posterSession,
    new Blob(["poster-version-one"], { type: "image/png" }),
    { styleId: "default", idempotencyKey: posterUploadKeyV1 },
  );
  const secondVersion = await uploadPosterShare(
    posterSession,
    new Blob(["poster-version-two"], { type: "image/png" }),
    { styleId: "default", idempotencyKey: posterUploadKeyV2 },
  );
  assert.notEqual(
    firstVersion.poster.token,
    secondVersion.poster.token,
    "two poster content versions must upload without a 409 key collision and receive different tokens",
  );
} finally {
  globalThis.fetch = originalFetch;
}

globalThis.fetch = async (_url, options = {}) => {
  recoveryRequestBody = JSON.parse(options.body || "{}");
  return new Response(JSON.stringify({ error: "invalid_session", message: "expired" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
};
const expiredSession = { accessToken: "expired", user: { provider: "wechat" } };
try {
  await assert.rejects(
    createMenuShareRequest(
      { dishes: [] },
      expiredSession,
      { notifySessionInvalid: false, idempotencyKey: snapshotKey },
    ),
    (error) => error.status === 401 && error.code === "invalid_session",
  );
  assert.equal(
    recoveryRequestBody.idempotencyKey,
    snapshotKey,
    "a silently replayable share create must send its stable snapshot idempotency key",
  );
  assert.equal(recoveryInvalidations, 0, "a recoverable snapshot 401 must not race the global logout handler");
  await assert.rejects(createMenuShareRequest({ dishes: [] }, expiredSession));
  assert.equal(recoveryInvalidations, 1, "normal authenticated 401s must keep the global invalidation behavior");
} finally {
  unsubscribeRecoveryInvalidation();
  globalThis.fetch = originalFetch;
}

let inviteRequestBody = null;
let posterRequestHeaders = null;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).endsWith("/household-invites")) {
    inviteRequestBody = JSON.parse(options.body || "{}");
  } else if (String(url).endsWith("/poster-shares")) {
    posterRequestHeaders = new Headers(options.headers);
  }
  return new Response(JSON.stringify({ error: "invalid_session", message: "expired" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
};
try {
  await assert.rejects(
    createHouseholdInvite(
      expiredSession,
      { householdId: "family-1" },
      { notifySessionInvalid: false, idempotencyKey: "invite:family-1" },
    ),
    (error) => error.status === 401 && error.code === "invalid_session",
  );
  assert.equal(inviteRequestBody.idempotencyKey, "invite:family-1", "an invite retry must reuse its stable household key");
  await assert.rejects(
    uploadPosterShare(
      expiredSession,
      new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }),
      { styleId: "theme", idempotencyKey: "poster:family-1:theme:state-v1" },
    ),
    (error) => error.status === 401 && error.code === "invalid_session",
  );
  assert.equal(
    posterRequestHeaders.get("X-Humi-Idempotency-Key"),
    "poster:family-1:theme:state-v1",
    "a poster retry must reuse its stable household/style/state key",
  );
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(
  buildMiniProgramShareUrl({
    type: "crave",
    token: "abc 123",
    householdName: "我家",
    empty: "",
  }),
  "/pages/share/index?type=crave&token=abc+123&householdName=%E6%88%91%E5%AE%B6",
);

[
  ["crave", "crave-token"],
  ["invite", "invite-token"],
  ["grocery", "grocery-token"],
  ["wish", "wish-token"],
  ["today_menu", "menu-token"],
  ["meal_task", "meal-task-token"],
].forEach(([type, token]) => {
  assert.equal(
    buildMiniProgramShareUrl({ type, token }),
    `/pages/share/index?type=${type}&token=${token}`,
    `${type} should open the tokenized native share page`,
  );
});

assert.equal(
  buildMiniProgramReminderUrl({
    scheduledAt: "2026-07-25T10:30:00.000Z",
    dateKey: "2026-07-25",
    effortTier: "quick_15",
    mealRunId: "meal 1",
  }),
  "/pages/reminder/index?scheduledAt=2026-07-25T10%3A30%3A00.000Z&dateKey=2026-07-25&effortTier=quick_15&mealRunId=meal+1",
);

const reminderNavigation = createRuntimeWindow({
  navigateTo({ url, success, leavePage }) {
    assert.equal(url, "/pages/reminder/index?scheduledAt=2026-07-25T10%3A30%3A00.000Z&dateKey=2026-07-25&effortTier=quick_15&mealRunId=meal-1");
    success?.();
    leavePage();
  },
});
globalThis.window = reminderNavigation.window;
assert.equal(await requestMiniProgramReminder({
  scheduledAt: "2026-07-25T10:30:00.000Z",
  dateKey: "2026-07-25",
  effortTier: "quick_15",
  mealRunId: "meal-1",
}, { timeoutMs: 100 }), "handoff");
assert.deepEqual(reminderNavigation.calls, ["navigateTo"]);

assert.equal(
  buildMiniProgramPosterUrl({ token: "poster-token", format: "jpg", title: "今晚菜单", action: "share" }),
  "/pages/poster/index?token=poster-token&format=jpg&title=%E4%BB%8A%E6%99%9A%E8%8F%9C%E5%8D%95&action=share",
);

const primaryNavigation = createRuntimeWindow({
  navigateTo({ url, success, leavePage }) {
    assert.equal(url, "/pages/share/index?type=grocery&token=grocery-token&itemCount=3");
    success?.();
    leavePage();
  },
  redirectTo() {
    assert.fail("redirectTo should not run after navigateTo succeeds");
  },
});
globalThis.window = primaryNavigation.window;
assert.equal(
  await requestMiniProgramShare(
    { type: "grocery", token: "grocery-token", itemCount: 3 },
    { timeoutMs: 100 },
  ),
  "handoff",
);
assert.deepEqual(primaryNavigation.calls, ["navigateTo"]);

const posterNavigation = createRuntimeWindow({
  navigateTo({ url, success, leavePage }) {
    assert.equal(url, "/pages/poster/index?token=poster-token&format=jpg&title=%E4%BB%8A%E6%99%9A%E8%8F%9C%E5%8D%95&action=save");
    success?.();
    leavePage();
  },
});
globalThis.window = posterNavigation.window;
assert.equal(
  await requestMiniProgramPoster(
    { token: "poster-token", format: "jpg", title: "今晚菜单", action: "save" },
    { timeoutMs: 100 },
  ),
  "handoff",
);
assert.deepEqual(posterNavigation.calls, ["navigateTo"]);

const explicitFailureFallback = createRuntimeWindow({
  navigateTo({ url, fail }) {
    assert.equal(url, "/pages/share/index?type=crave&token=retry-token");
    fail?.({ errMsg: "navigateTo:fail page stack limit" });
  },
  redirectTo({ url, success, leavePage }) {
    assert.equal(url, "/pages/share/index?type=crave&token=retry-token");
    success?.();
    leavePage();
  },
});
globalThis.window = explicitFailureFallback.window;
assert.equal(
  await requestMiniProgramShare(
    { type: "crave", token: "retry-token" },
    { timeoutMs: 100 },
  ),
  "handoff",
);
assert.deepEqual(
  explicitFailureFallback.calls,
  ["navigateTo", "redirectTo"],
  "redirectTo should only run after navigateTo explicitly fails",
);

const callbacklessPageLeave = createRuntimeWindow({
  navigateTo({ leavePage }) {
    leavePage();
  },
});
globalThis.window = callbacklessPageLeave.window;
assert.equal(
  await requestMiniProgramShare(
    { type: "today_menu", token: "menu-token", title: "今晚菜单" },
    { timeoutMs: 80 },
  ),
  "handoff",
  "leaving the web-view should confirm a handoff when the bridge omits callbacks",
);

const callbacklessNavigationFallback = createRuntimeWindow({
  navigateTo() {
    // iOS WeChat can accept this call without firing success, fail, or page-leave.
  },
  redirectTo({ fail }) {
    fail?.({ errMsg: "redirectTo:fail callbackless navigateTo recovery" });
  },
  reLaunch({ url, success, leavePage }) {
    assert.equal(url, "/pages/share/index?type=invite&token=invite-token");
    success?.();
    leavePage();
  },
});
globalThis.window = callbacklessNavigationFallback.window;
assert.equal(
  await requestMiniProgramShare(
    { type: "invite", token: "invite-token" },
    { timeoutMs: 180, confirmationMs: 20 },
  ),
  "handoff",
  "a callbackless navigateTo should advance through redirectTo to reLaunch",
);
assert.deepEqual(
  callbacklessNavigationFallback.calls,
  ["navigateTo", "redirectTo", "reLaunch"],
  "native share fallback should not stop after a callbackless bridge call",
);

const callbackReceiptIsNotVisibility = createRuntimeWindow({
  navigateTo({ success }) {
    success?.();
  },
  redirectTo({ success }) {
    success?.();
  },
  reLaunch({ success, leavePage }) {
    success?.();
    leavePage();
  },
});
const bridgeStages = [];
globalThis.window = callbackReceiptIsNotVisibility.window;
assert.equal(
  await requestMiniProgramShare(
    { type: "today_menu", token: "sensitive-menu-token", title: "今晚菜单" },
    {
      timeoutMs: 180,
      confirmationMs: 20,
      onStage: (event) => bridgeStages.push(event),
    },
  ),
  "handoff",
  "bridge success callbacks must not replace page visibility confirmation",
);
assert.deepEqual(
  callbackReceiptIsNotVisibility.calls,
  ["navigateTo", "redirectTo", "reLaunch"],
  "an unconfirmed success callback must continue through the native fallback chain",
);
assert(bridgeStages.some((event) => event.stage === "callback_received" && event.method === "navigateTo"));
assert(bridgeStages.some((event) => event.stage === "page_hidden" && event.method === "reLaunch"));
assert(!JSON.stringify(bridgeStages).includes("sensitive-menu-token"), "bridge telemetry must not contain share tokens");
assert(bridgeStages.every((event) => Number.isFinite(event.elapsedMs) && event.elapsedMs >= 0));

const allFailed = createRuntimeWindow({
  navigateTo() {
    throw new Error("navigateTo bridge unavailable");
  },
  redirectTo({ fail }) {
    fail?.({ errMsg: "redirectTo:fail" });
  },
});
globalThis.window = allFailed.window;
assert.equal(
  await requestMiniProgramShare(
    { type: "wish", token: "wish-token", householdName: "小家" },
    { timeoutMs: 80, confirmationMs: 10 },
  ),
  "unavailable",
);

delete globalThis.window;
assert.equal(await requestMiniProgramShare({ type: "crave", token: "abc" }, { timeoutMs: 20 }), "unavailable");

globalThis.window = createRuntimeWindow({
  navigateTo() {
    assert.fail("a share without a token must not enter the native bridge");
  },
}).window;
assert.equal(await requestMiniProgramShare({ type: "today_menu", title: "今晚菜单" }), "unavailable");
delete globalThis.window;

globalThis.window = {
  location: { search: "" },
  setTimeout,
  clearTimeout,
  wx: {
    miniProgram: {
      navigateTo() {
        throw new Error("plain H5 should not invoke mini-program navigation");
      },
    },
  },
};
assert.equal(await requestMiniProgramShare({ type: "grocery", token: "h5-token" }, { timeoutMs: 20 }), "unavailable");
delete globalThis.window;

console.log("Mini-program share runtime validation passed.");

function assertMiniProgramSharePage(basePath, { requiresOpenTypeButton, supportsTimeline }) {
  const js = readFileSync(`${basePath}.js`, "utf8");
  const json = JSON.parse(readFileSync(`${basePath}.json`, "utf8"));
  const wxml = readFileSync(`${basePath}.wxml`, "utf8");
  assert.match(js, /onShareAppMessage\s*\(/, `${basePath}.js should define onShareAppMessage`);
  if (supportsTimeline) {
    assert.match(js, /onShareTimeline\s*\(/, `${basePath}.js should define onShareTimeline`);
  } else {
    assert.doesNotMatch(js, /onShareTimeline\s*\(/, `${basePath}.js should not advertise unsupported web-view timeline sharing`);
  }
  assert.match(js, /showShareMenu\s*\(/, `${basePath}.js should call wx.showShareMenu`);
  assert.match(js, /onShow\s*\(/, `${basePath}.js should re-enable share menu on show`);
  if (basePath.endsWith("/index/index")) {
    assert.match(js, /humi:share/, `${basePath}.js should receive H5 share bridge messages`);
  }
  assert.equal("enableShareAppMessage" in json, false, `${basePath}.json should not use unsupported enableShareAppMessage config`);
  assert.equal("enableShareTimeline" in json, false, `${basePath}.json should not use unsupported enableShareTimeline config`);
  if (requiresOpenTypeButton) {
    assert.match(wxml, /open-type="share"/, `${basePath}.wxml should include a native share button`);
    assert.match(wxml, /hero-share-button[^"]*"\s+open-type="share"/, `${basePath}.wxml should keep the native share button in the first-screen hero`);
  }
}

function assertNativeShareReceiptTemplate() {
  const js = readFileSync("miniprogram/pages/share/index.js", "utf8");
  const wxml = readFileSync("miniprogram/pages/share/index.wxml", "utf8");
  const wxss = readFileSync("miniprogram/pages/share/index.wxss", "utf8");
  assert.match(wxml, /detailRows/, "native share page should explain what the recipient and sender can do");
  assert.match(wxml, /detail-label/, "native share page should render plain-language detail labels");
  assert.match(wxss, /\.detail-row/, "native share page should style detail rows");
  ["不用登录，点一个感觉就行", "刷新就能看到大家的回复", "可以直接查看，不用先登录", "刷新就能看到谁来买、买了什么", "对应的买菜清单", "不用登录，写一道菜就行", "刷新“最近想吃”就能看到"].forEach((copy) => {
    assert.match(js, new RegExp(copy), `native share template should include: ${copy}`);
  });
  ["登录一次就能加入这个家", "菜单、清单和回复都在一起"].forEach((copy) => {
    assert.match(js, new RegExp(copy), `native household invite template should include: ${copy}`);
  });
  ["选择家人发送", "选择家人发清单", "选择家人发菜单", "选择家人发邀请"].forEach((copy) => {
    assert.match(js, new RegExp(copy), `native share template should include primary action: ${copy}`);
  });
  assert.match(js, /再点一下，就能选择发给哪位家人/, "native share page should explain the required second native share tap");
  assert.doesNotMatch(js, /右上角|当前页面不可分享|点下方按钮/, "native share page should not guide users to the web-view menu or the wrong button position");
  assert.doesNotMatch(wxml, /右上角|当前页面不可分享|点下方按钮/, "native share markup should not guide users to the web-view menu or the wrong button position");
}

function assertShareFeedbackDoesNotClaimUnverifiedSuccess() {
  const main = readFileSync("src/main.jsx", "utf8");
  const todayMenu = readFileSync("src/components/TodayMenu.jsx", "utf8");
  const groceryList = readFileSync("src/components/GroceryList.jsx", "utf8");
  const posterPage = readFileSync("miniprogram/pages/poster/index.js", "utf8");
  assert.doesNotMatch(main, /已打开分享面板|清单已打开分享面板/, "share feedback must not claim that a system panel opened");
  assert.doesNotMatch(main, /图片已开始保存/, "poster feedback must not claim a browser download reached the photo album");
  assert.match(main, /没能打开微信发送页，请再试一次/, "native share failures should be explicit and retryable");
  assert.match(main, /requestMiniProgramPoster/, "mini-program posters should hand off to a native poster page");
  assert.match(posterPage, /saveImageToPhotosAlbum/, "native poster page should save through the WeChat album API");
  assert.match(posterPage, /showShareImageMenu/, "native poster page should share through the WeChat image menu");
  assert.match(todayMenu, /去微信发菜单/, "mini-program menu sharing should set the native handoff expectation");
  assert.match(groceryList, /去微信发清单/, "mini-program grocery sharing should set the native handoff expectation");
}

function createRuntimeWindow({ redirectTo, navigateTo, reLaunch }) {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const calls = [];
  const document = {
    visibilityState: "visible",
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || new Set();
      listeners.add(listener);
      documentListeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      documentListeners.get(type)?.delete(listener);
    },
  };
  const runtimeWindow = {
    location: { search: "?channel=wechat-miniprogram" },
    document,
    setTimeout,
    clearTimeout,
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || new Set();
      listeners.add(listener);
      windowListeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      windowListeners.get(type)?.delete(listener);
    },
    wx: {
      miniProgram: {},
    },
  };
  const leavePage = () => {
    document.visibilityState = "hidden";
    documentListeners.get("visibilitychange")?.forEach((listener) => listener());
    windowListeners.get("pagehide")?.forEach((listener) => listener());
  };
  if (redirectTo) {
    runtimeWindow.wx.miniProgram.redirectTo = (options) => {
      calls.push("redirectTo");
      redirectTo({ ...options, leavePage });
    };
  }
  if (navigateTo) {
    runtimeWindow.wx.miniProgram.navigateTo = (options) => {
      calls.push("navigateTo");
      navigateTo({ ...options, leavePage });
    };
  }
  if (reLaunch) {
    runtimeWindow.wx.miniProgram.reLaunch = (options) => {
      calls.push("reLaunch");
      reLaunch({ ...options, leavePage });
    };
  }
  return { window: runtimeWindow, calls };
}

function assertMiniProgramVisibleCopyKeepsPantryInvisible() {
  [
    "miniprogram/pages/legacy/index.wxml",
    "miniprogram/pages/share/index.wxml",
    "miniprogram/pages/share/index.js",
    "miniprogram/pages/poster/index.wxml",
    "miniprogram/pages/poster/index.js",
  ].forEach((filePath) => {
    const source = readFileSync(filePath, "utf8");
    assert.doesNotMatch(
      source,
      /库存|常备项|后台食材记录|后台已有项|后台已记/,
      `${filePath} should keep pantry state invisible in user-facing copy`,
    );
  });
}

function assertMiniProgramGuestShareRouting() {
  const baseUrl = "https://www.humi-home.com/?channel=wechat-miniprogram";
  const labels = {
    crave: "小家今晚要做饭，你想吃点啥？",
    grocery: "Humi 买菜清单：5 项",
    wish: "小家最近想吃什么？写一道给 Humi",
    today_menu: "Humi 今晚菜单：番茄鸡蛋 + 青菜",
    invite: "邀请你加入 小家，一起用 Humi",
    meal_task: "请家人买鸡蛋",
  };
  const details = {
    crave: { householdName: "小家" },
    grocery: { itemCount: 5 },
    wish: { householdName: "小家" },
    today_menu: { title: "番茄鸡蛋 + 青菜" },
    invite: { householdName: "小家" },
    meal_task: { label: "请家人买鸡蛋" },
  };

  for (const fixture of shareLandingFixtures) {
    const landing = validateShareLandingOptions({ type: fixture.type, token: fixture.token });
    assert.deepEqual(JSON.parse(JSON.stringify(landing)), { type: fixture.type, token: fixture.token }, `${fixture.type} guest bypass must use a valid native landing first`);
    const share = buildSharePayload({ type: fixture.type, token: fixture.token, ...details[fixture.type] });
    assert.equal(share.title, labels[fixture.type]);
    assert.equal(share.path, fixture.guestPath);
    const launchOptions = normalizeLaunchOptions(Object.fromEntries(new URLSearchParams(pathToQuery(share.path))));
    assert.equal(shouldOpenAsGuest(launchOptions), true, `${fixture.type} card should bypass login only after strict landing validation`);
    assert.equal(buildHumiUrl(baseUrl, launchOptions), `${baseUrl}&${pathToQuery(fixture.guestPath)}`);
  }

  const legacyMenuShare = buildSharePayload({
    type: "today_menu",
    title: "番茄鸡蛋 + 青菜",
  });
  assert.equal(legacyMenuShare.path, "/pages/boot/index?view=today&shareSource=today_menu");
  const legacyMenuOptions = normalizeLaunchOptions(Object.fromEntries(new URLSearchParams(pathToQuery(legacyMenuShare.path))));
  assert.equal(shouldOpenAsGuest(legacyMenuOptions), true, "legacy today menu card should bypass login into the menu view");

}

function loadMiniProgramCommonJs(path) {
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(path, "utf8"), {
    module,
    exports: module.exports,
  }, { filename: path });
  return module.exports;
}

function loadShareLandingValidator() {
  const module = { exports: {} };
  vm.runInNewContext(readFileSync("miniprogram/utils/bootstrap.js", "utf8"), {
    module,
    exports: module.exports,
    require(request) {
      if (request === "./cache" || request === "./request") return {};
      throw new Error(`Unexpected bootstrap dependency: ${request}`);
    },
  }, { filename: "miniprogram/utils/bootstrap.js" });
  return module.exports;
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}
