import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildMiniProgramPosterUrl, buildMiniProgramShareUrl, requestMiniProgramPoster, requestMiniProgramShare } from "../src/lib/runtime.js";

const {
  buildHumiUrl,
  buildSharePayload,
  normalizeLaunchOptions,
  pathToQuery,
  shouldOpenAsGuest,
} = loadMiniProgramCommonJs("miniprogram/utils/share-routing.js");

const miniProgramApp = JSON.parse(readFileSync("miniprogram/app.json", "utf8"));
assert(miniProgramApp.pages.includes("pages/index/index"), "mini program app.json should include index page");
assert(miniProgramApp.pages.includes("pages/share/index"), "mini program app.json should include native share page");
assert(miniProgramApp.pages.includes("pages/poster/index"), "mini program app.json should include native poster page");

assertMiniProgramSharePage("miniprogram/pages/index/index", { requiresOpenTypeButton: false, supportsTimeline: false });
assertMiniProgramSharePage("miniprogram/pages/share/index", { requiresOpenTypeButton: true, supportsTimeline: true });
assertNativeShareReceiptTemplate();
assertShareFeedbackDoesNotClaimUnverifiedSuccess();
assertMiniProgramVisibleCopyKeepsPantryInvisible();
assertMiniProgramGuestShareRouting();

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
].forEach(([type, token]) => {
  assert.equal(
    buildMiniProgramShareUrl({ type, token }),
    `/pages/share/index?type=${type}&token=${token}`,
    `${type} should open the tokenized native share page`,
  );
});

assert.equal(
  buildMiniProgramPosterUrl({ token: "poster-token", format: "jpg", title: "今晚菜单", action: "share" }),
  "/pages/poster/index?token=poster-token&format=jpg&title=%E4%BB%8A%E6%99%9A%E8%8F%9C%E5%8D%95&action=share",
);

const primaryNavigation = createRuntimeWindow({
  navigateTo({ url, success }) {
    assert.equal(url, "/pages/share/index?type=grocery&token=grocery-token&itemCount=3");
    success?.();
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
  navigateTo({ url, success }) {
    assert.equal(url, "/pages/poster/index?token=poster-token&format=jpg&title=%E4%BB%8A%E6%99%9A%E8%8F%9C%E5%8D%95&action=save");
    success?.();
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
  redirectTo({ url, success }) {
    assert.equal(url, "/pages/share/index?type=crave&token=retry-token");
    success?.();
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
  reLaunch({ url, success }) {
    assert.equal(url, "/pages/share/index?type=invite&token=invite-token");
    success?.();
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
    "miniprogram/pages/index/index.wxml",
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
  const craveShare = buildSharePayload({
    type: "crave",
    token: "crave-token",
    householdName: "小家",
  });
  assert.equal(craveShare.title, "小家今晚要做饭，你想吃点啥？");
  assert.equal(craveShare.path, "/pages/index/index?crave=crave-token&shareSource=crave");
  const craveOptions = normalizeLaunchOptions(Object.fromEntries(new URLSearchParams(pathToQuery(craveShare.path))));
  assert.equal(shouldOpenAsGuest(craveOptions), true, "crave card should bypass login as a guest landing");
  assert.equal(
    buildHumiUrl(baseUrl, craveOptions),
    "https://www.humi-home.com/?channel=wechat-miniprogram&crave=crave-token&shareSource=crave",
  );

  const groceryShare = buildSharePayload({
    type: "grocery",
    token: "grocery-token",
    itemCount: 5,
  });
  assert.equal(groceryShare.title, "Humi 买菜清单：5 项");
  assert.equal(groceryShare.path, "/pages/index/index?groceryShare=grocery-token&shareSource=grocery");
  const groceryOptions = normalizeLaunchOptions(Object.fromEntries(new URLSearchParams(pathToQuery(groceryShare.path))));
  assert.equal(shouldOpenAsGuest(groceryOptions), true, "grocery card should bypass login as a guest landing");
  assert.equal(
    buildHumiUrl(baseUrl, groceryOptions),
    "https://www.humi-home.com/?channel=wechat-miniprogram&groceryShare=grocery-token&shareSource=grocery",
  );

  const wishShare = buildSharePayload({
    type: "wish",
    token: "wish-token",
    householdName: "小家",
  });
  assert.equal(wishShare.title, "小家最近想吃什么？写一道给 Humi");
  assert.equal(wishShare.path, "/pages/index/index?wishShare=wish-token&shareSource=wish");
  const wishOptions = normalizeLaunchOptions(Object.fromEntries(new URLSearchParams(pathToQuery(wishShare.path))));
  assert.equal(shouldOpenAsGuest(wishOptions), true, "wish card should bypass login as a guest landing");
  assert.equal(
    buildHumiUrl(baseUrl, wishOptions),
    "https://www.humi-home.com/?channel=wechat-miniprogram&wishShare=wish-token&shareSource=wish",
  );

  const menuShare = buildSharePayload({
    type: "today_menu",
    title: "番茄鸡蛋 + 青菜",
    token: "menu-token",
  });
  assert.equal(menuShare.path, "/pages/index/index?menuShare=menu-token&shareSource=today_menu");
  const menuOptions = normalizeLaunchOptions(Object.fromEntries(new URLSearchParams(pathToQuery(menuShare.path))));
  assert.equal(shouldOpenAsGuest(menuOptions), true, "today menu card should bypass login into a tokenized menu view");
  assert.equal(
    buildHumiUrl(baseUrl, menuOptions),
    "https://www.humi-home.com/?channel=wechat-miniprogram&menuShare=menu-token&shareSource=today_menu",
  );

  const legacyMenuShare = buildSharePayload({
    type: "today_menu",
    title: "番茄鸡蛋 + 青菜",
  });
  assert.equal(legacyMenuShare.path, "/pages/index/index?view=today&shareSource=today_menu");
  const legacyMenuOptions = normalizeLaunchOptions(Object.fromEntries(new URLSearchParams(pathToQuery(legacyMenuShare.path))));
  assert.equal(shouldOpenAsGuest(legacyMenuOptions), true, "legacy today menu card should bypass login into the menu view");

  const inviteShare = buildSharePayload({
    type: "invite",
    token: "invite-token",
    householdName: "小家",
  });
  assert.equal(inviteShare.title, "邀请你加入 小家，一起用 Humi");
  assert.equal(inviteShare.path, "/pages/index/index?invite=invite-token&shareSource=invite");
  const inviteOptions = normalizeLaunchOptions(Object.fromEntries(new URLSearchParams(pathToQuery(inviteShare.path))));
  assert.equal(shouldOpenAsGuest(inviteOptions), true, "household invite should open its landing before normal app login");
  assert.equal(
    buildHumiUrl(baseUrl, inviteOptions),
    "https://www.humi-home.com/?channel=wechat-miniprogram&invite=invite-token&shareSource=invite",
  );
}

function loadMiniProgramCommonJs(path) {
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(path, "utf8"), {
    module,
    exports: module.exports,
  }, { filename: path });
  return module.exports;
}
