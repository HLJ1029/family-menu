import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("miniprogram/pages/index/index.js", "utf8");
const pageDefinition = loadMiniProgramPage(source);
const sharePageSource = await readFile("miniprogram/pages/share/index.js", "utf8");
const shareRelay = loadShareRelay(sharePageSource);
const indexHtml = await readFile("index.html", "utf8");
if (!indexHtml.includes("https://res.wx.qq.com/open/js/jweixin-1.6.0.js")) {
  throw new Error("index.html must load the WeChat JSSDK before miniProgram share actions can navigate to the native relay page.");
}

const cases = [
  {
    name: "crave",
    message: {
      type: "humi:share-crave",
      token: "crave-token-123",
      householdName: "周末家",
      initiatorName: "小林",
      title: "周末家今晚征集口味，点一下就行",
    },
    expectedShare: {
      title: "周末家今晚征集口味，点一下就行",
      path: "/pages/index/index?crave=crave-token-123",
    },
    launchOptions: { crave: "crave-token-123" },
    expectedLaunchUrl: "https://www.humi-home.com/?crave=crave-token-123&channel=wechat-miniprogram",
    expectedLaunchShare: {
      title: "今晚征集口味，点一下就行",
      path: "/pages/index/index?crave=crave-token-123",
    },
  },
  {
    name: "invite",
    message: {
      type: "humi:share-household-invite",
      token: "invite-token-123",
      householdName: "周末家",
      inviterName: "小林",
    },
    expectedShare: {
      title: "小林邀请你加入 周末家",
      path: "/pages/index/index?invite=invite-token-123",
    },
    launchOptions: { invite: "invite-token-123" },
    expectedLaunchUrl: "https://www.humi-home.com/?invite=invite-token-123&channel=wechat-miniprogram",
    expectedLaunchShare: {
      title: "主厨邀请你加入 这个家",
      path: "/pages/index/index?invite=invite-token-123",
    },
  },
  {
    name: "grocery",
    message: {
      type: "humi:share-grocery",
      token: "grocery-token-123",
      householdName: "周末家",
      initiatorName: "小林",
      itemCount: 6,
    },
    expectedShare: {
      title: "小林发来 6 项买菜清单",
      path: "/pages/index/index?grocery=grocery-token-123",
    },
    launchOptions: { grocery: "grocery-token-123" },
    expectedLaunchUrl: "https://www.humi-home.com/?grocery=grocery-token-123&channel=wechat-miniprogram",
    expectedLaunchShare: {
      title: "主厨发来买菜清单",
      path: "/pages/index/index?grocery=grocery-token-123",
    },
  },
];

const results = cases.map((testCase) => {
  const sharePage = createPageInstance(pageDefinition);
  sharePage.handleMessage({ detail: { data: [testCase.message] } });
  const share = sharePage.onShareAppMessage();
  assertEqual(`${testCase.name} title`, share.title, testCase.expectedShare.title);
  assertEqual(`${testCase.name} path`, share.path, testCase.expectedShare.path);

  const relay = shareRelay.buildShareData({ ...testCase.message, type: testCase.name });
  assertEqual(`${testCase.name} relay title`, relay.title, testCase.expectedShare.title);
  assertEqual(`${testCase.name} relay path`, relay.path, testCase.expectedShare.path);

  const launchPage = createPageInstance(pageDefinition);
  launchPage.onLoad(testCase.launchOptions);
  assertEqual(`${testCase.name} launch url`, launchPage.data.url, testCase.expectedLaunchUrl);
  const launchShare = launchPage.onShareAppMessage();
  assertEqual(`${testCase.name} launch share title`, launchShare.title, testCase.expectedLaunchShare.title);
  assertEqual(`${testCase.name} launch share path`, launchShare.path, testCase.expectedLaunchShare.path);

  return {
    name: testCase.name,
    title: share.title,
    path: share.path,
    relayTitle: relay.title,
    relayPath: relay.path,
    launchUrl: launchPage.data.url,
    launchShareTitle: launchShare.title,
    launchSharePath: launchShare.path,
  };
});

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  results,
}, null, 2));

function loadMiniProgramPage(code) {
  let capturedPage = null;
  const context = {
    console,
    require(request) {
      if (request === "../../utils/config") {
        return {
          HUMI_WECHAT_LOGIN_ENABLED: false,
          getHumiApiBaseUrl: () => "https://api.humi-home.com",
          getHumiH5Url: () => "https://www.humi-home.com/",
        };
      }
      throw new Error(`Unexpected require: ${request}`);
    },
    getApp() {
      return { globalData: {} };
    },
    wx: {
      showShareMenu() {},
    },
    Page(definition) {
      capturedPage = definition;
    },
  };

  vm.runInNewContext(code, context, { filename: "miniprogram/pages/index/index.js" });
  if (!capturedPage) throw new Error("Mini program page definition was not captured.");
  return capturedPage;
}

function loadShareRelay(code) {
  const module = { exports: {} };
  const context = {
    console,
    module,
    exports: module.exports,
    Page() {},
    wx: {
      showShareMenu() {},
      navigateBack() {},
    },
  };

  vm.runInNewContext(code, context, { filename: "miniprogram/pages/share/index.js" });
  if (typeof module.exports.buildShareData !== "function") {
    throw new Error("Share relay buildShareData was not exported.");
  }
  return module.exports;
}

function createPageInstance(definition) {
  const instance = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      this.data = { ...this.data, ...patch };
    },
  };

  for (const [key, value] of Object.entries(definition)) {
    if (typeof value === "function") {
      instance[key] = value.bind(instance);
    }
  }

  return instance;
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch.\nExpected: ${expected}\nActual: ${actual}`);
  }
}
