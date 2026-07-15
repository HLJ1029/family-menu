import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildMiniProgramShareUrl, requestMiniProgramShare } from "../src/lib/runtime.js";

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

assertMiniProgramSharePage("miniprogram/pages/index/index", { requiresOpenTypeButton: false, supportsTimeline: false });
assertMiniProgramSharePage("miniprogram/pages/share/index", { requiresOpenTypeButton: true, supportsTimeline: true });
assertNativeShareReceiptTemplate();
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

globalThis.window = {
  location: { search: "?channel=wechat-miniprogram" },
  setTimeout,
  clearTimeout,
  postedMessages: [],
  wx: {
    miniProgram: {
      postMessage(message) {
        globalThis.window.postedMessages.push(message);
      },
      navigateTo({ url, success }) {
        assert.equal(url, "/pages/share/index?type=grocery&token=grocery-token&itemCount=3");
        success?.();
      },
    },
  },
};

assert.equal(
  await requestMiniProgramShare({ type: "grocery", token: "grocery-token", itemCount: 3 }, { timeoutMs: 20 }),
  "opened",
);
assert.deepEqual(
  globalThis.window.postedMessages[0],
  {
    data: {
      type: "humi:share",
      payload: { type: "grocery", token: "grocery-token", itemCount: 3 },
    },
  },
  "mini-program share should post payload to the host page before opening native share page",
);

globalThis.window.wx.miniProgram.navigateTo = ({ fail }) => {
  fail?.({ errMsg: "navigateTo:fail" });
};

assert.equal(
  await requestMiniProgramShare({ type: "crave", token: "bad-token" }, { timeoutMs: 20 }),
  "unavailable",
);

globalThis.window.wx.miniProgram.redirectTo = ({ url, success }) => {
  assert.equal(url, "/pages/share/index?type=crave&token=retry-token");
  success?.();
};

assert.equal(
  await requestMiniProgramShare({ type: "crave", token: "retry-token" }, { timeoutMs: 20 }),
  "opened",
);

globalThis.window.wx.miniProgram.navigateTo = () => {
  throw new Error("navigateTo bridge unavailable");
};
globalThis.window.wx.miniProgram.redirectTo = ({ url, success }) => {
  assert.equal(url, "/pages/share/index?type=grocery&token=throw-token&itemCount=2");
  success?.();
};

assert.equal(
  await requestMiniProgramShare({ type: "grocery", token: "throw-token", itemCount: 2 }, { timeoutMs: 20 }),
  "opened",
);

delete globalThis.window.wx.miniProgram.redirectTo;

globalThis.window.wx.miniProgram.navigateTo = ({ url }) => {
  assert.equal(url, "/pages/share/index?type=today_menu&title=%E4%BB%8A%E6%99%9A%E8%8F%9C%E5%8D%95");
};

assert.equal(
  await requestMiniProgramShare({ type: "today_menu", title: "今晚菜单" }, { timeoutMs: 20 }),
  "unavailable",
);

globalThis.window.wx.miniProgram.navigateTo = ({ url, success }) => {
  assert.equal(url, "/pages/share/index?type=today_menu&title=%E4%BB%8A%E6%99%9A%E8%8F%9C%E5%8D%95");
  success?.();
};

assert.equal(
  await requestMiniProgramShare({ type: "today_menu", title: "今晚菜单" }, { timeoutMs: 20 }),
  "opened",
);

globalThis.window.wx.miniProgram.navigateTo = ({ url, success }) => {
  assert.equal(url, "/pages/share/index?type=wish&token=wish-token&householdName=%E5%B0%8F%E5%AE%B6");
  success?.();
};

assert.equal(
  await requestMiniProgramShare({ type: "wish", token: "wish-token", householdName: "小家" }, { timeoutMs: 20 }),
  "opened",
);

delete globalThis.window;
assert.equal(await requestMiniProgramShare({ type: "crave", token: "abc" }, { timeoutMs: 20 }), "unavailable");

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
    assert.match(js, /openSharePage\(params\)/, `${basePath}.js should route share messages through a share-page helper`);
    assert.match(js, /wx\.navigateTo\s*\(/, `${basePath}.js should try native navigation to the share page`);
    assert.match(js, /wx\.redirectTo\s*\(/, `${basePath}.js should fall back when native share-page navigation fails`);
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
  assert.match(wxml, /receiptRows/, "native share page should render receipt rows");
  assert.match(wxml, /receipt-label/, "native share page should render receipt labels");
  assert.match(wxss, /\.receipt-row/, "native share page should style receipt rows");
  ["家人免登录点感觉", "回复会回到这张征集单", "家人免登录打开清单", "主厨刷新后看到认领和已买", "菜单会继续联动买菜清单", "家人免登录写想吃", "主厨刷新后收进想吃池"].forEach((copy) => {
    assert.match(js, new RegExp(copy), `native share template should include: ${copy}`);
  });
  ["家人打开家庭邀请", "登录后成为正式成员", "共享菜单、清单和征集"].forEach((copy) => {
    assert.match(js, new RegExp(copy), `native household invite template should include: ${copy}`);
  });
  ["转发给家人", "转发清单给家人", "转发菜单给家人", "转发想吃入口"].forEach((copy) => {
    assert.match(js, new RegExp(copy), `native share template should include primary action: ${copy}`);
  });
  assert.match(js, /点黑色转发按钮发出小程序卡片/, "native share page should point users to the visible native share button");
  assert.doesNotMatch(js, /右上角|当前页面不可分享|点下方按钮/, "native share page should not guide users to the web-view menu or the wrong button position");
  assert.doesNotMatch(wxml, /右上角|当前页面不可分享|点下方按钮/, "native share markup should not guide users to the web-view menu or the wrong button position");
}

function assertMiniProgramVisibleCopyKeepsPantryInvisible() {
  [
    "miniprogram/pages/index/index.wxml",
    "miniprogram/pages/share/index.wxml",
    "miniprogram/pages/share/index.js",
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
