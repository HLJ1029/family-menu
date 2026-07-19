import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const pageSource = fs.readFileSync(new URL("../miniprogram/pages/index/index.js", import.meta.url), "utf8");
const identityPageSource = fs.readFileSync(new URL("../miniprogram/pages/identity/index.js", import.meta.url), "utf8");

function createPage(wxOverrides = {}, runtimeOverrides = {}) {
  let definition;
  const app = {
    globalData: { humiSession: runtimeOverrides.appSession ?? null, humiPhoneSessionUpdatedAt: 0 },
    setHumiSession(session) {
      this.globalData.humiSession = session;
    },
    clearHumiSession() {
      this.globalData.humiSession = null;
    }
  };
  const navigations = [];
  const requestUrls = [];
  const wx = {
    getDeviceInfo: () => ({ platform: "ios" }),
    showShareMenu: () => {},
    showToast: () => {},
    navigateTo: ({ url }) => navigations.push(url),
    login: ({ success }) => success({ code: "wechat-code" }),
    request: ({ url, success, complete = () => {} }) => {
      requestUrls.push(url);
      const data = url.endsWith("/auth/h5-ticket")
        ? { ticket: "one-time-ticket" }
        : {
            accessToken: "session-token",
            expiresAt: Date.now() + 60_000,
            user: { id: "user-1", displayName: "微信用户", profileStatus: "incomplete" }
          };
      success({ statusCode: 200, data });
      complete();
    },
    ...wxOverrides
  };

  vm.runInNewContext(pageSource, {
    Page: (value) => {
      definition = value;
    },
    getApp: () => app,
    wx,
    console,
    Date,
    setTimeout: runtimeOverrides.setTimeout || setTimeout,
    clearTimeout: runtimeOverrides.clearTimeout || clearTimeout,
    require: (specifier) => {
      assert.equal(specifier, "../../utils/config");
      return {
        HUMI_WECHAT_LOGIN_ENABLED: true,
        getHumiApiBaseUrl: () => "https://api.humi-home.com",
        getHumiH5Url: () => "https://www.humi-home.com/?channel=wechat-miniprogram&h5v=1.1.62"
      };
    }
  });
  assert.ok(definition, "mini-program page definition should load");

  const changes = [];
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      changes.push(patch);
      this.data = { ...this.data, ...patch };
    }
  };
  return { page, changes, app, navigations, requestUrls };
}

function createIdentityPage(wxOverrides = {}, runtimeOverrides = {}) {
  let definition;
  const app = {
    globalData: { humiSession: runtimeOverrides.appSession ?? null },
    setHumiSession(session) {
      this.globalData.humiSession = session;
    }
  };
  const requestUrls = [];
  const relaunches = [];
  const wx = {
    login: ({ success }) => success({ code: "wechat-code" }),
    request: ({ url, success, complete = () => {} }) => {
      requestUrls.push(url);
      success({
        statusCode: 200,
        data: {
          accessToken: "identity-session-token",
          expiresAt: Date.now() + 60_000,
          user: { id: "user-1", displayName: "微信用户", profileStatus: "incomplete" }
        }
      });
      complete();
    },
    reLaunch: ({ url }) => relaunches.push(url),
    ...wxOverrides
  };

  vm.runInNewContext(identityPageSource, {
    Page: (value) => {
      definition = value;
    },
    getApp: () => app,
    wx,
    console,
    Date,
    require: (specifier) => {
      assert.equal(specifier, "../../utils/config");
      return { getHumiApiBaseUrl: () => "https://api.humi-home.com" };
    }
  });
  assert.ok(definition, "identity page definition should load");

  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      this.data = { ...this.data, ...patch };
    }
  };
  return { page, app, requestUrls, relaunches };
}

{
  let loginCalls = 0;
  const { page, changes } = createPage({
    login: () => { loginCalls += 1; }
  });
  page.onLoad({});
  assert.equal(loginCalls, 0, "normal startup must not call wx.login");
  assert.equal(changes.filter((patch) => patch.url).length, 1);
  assert.doesNotMatch(page.data.url, /humiSession=|humiTicket=/);
}

{
  let loginCalls = 0;
  const { page, changes } = createPage({
    login: () => {
      loginCalls += 1;
    }
  });
  page.onLoad({ crave: "crave-token" });
  assert.equal(loginCalls, 0, "shared landing should not wait for startup login");
  assert.equal(changes.filter((patch) => patch.url).length, 1, "shared landing should mount one URL");
  assert.match(page.data.url, /crave=crave-token/, "shared landing should preserve its token");
}

{
  let loginCalls = 0;
  const { page, app, requestUrls } = createIdentityPage({
    login: ({ success }) => {
      loginCalls += 1;
      success({ code: "wechat-code" });
    }
  });
  page.onLoad({ action: "login" });
  assert.equal(loginCalls, 1, "explicit identity route should call wx.login once");
  assert.equal(requestUrls.filter((url) => url.endsWith("/auth/wechat/login")).length, 1);
  assert.equal(app.globalData.humiSession?.accessToken, "identity-session-token");
}

{
  let loginCalls = 0;
  const completeSession = {
    accessToken: "stored-session",
    expiresAt: Date.now() + 60_000,
    user: { id: "stored-user", displayName: "小禾", profileStatus: "complete" }
  };
  const { page, requestUrls } = createPage(
    { login: () => { loginCalls += 1; } },
    { appSession: completeSession }
  );
  page.onLoad({});
  assert.equal(loginCalls, 0, "valid stored session must not call wx.login");
  assert.equal(requestUrls.filter((url) => url.endsWith("/auth/h5-ticket")).length, 1);
  assert.match(page.data.url, /humiTicket=one-time-ticket/);
  assert.doesNotMatch(page.data.url, /humiSession=/);
}

{
  const incompleteSession = {
    accessToken: "stored-session",
    expiresAt: Date.now() + 60_000,
    user: { id: "stored-user", displayName: "微信用户", profileStatus: "incomplete" }
  };
  const { page, navigations } = createPage({}, { appSession: incompleteSession });
  page.onLoad({});
  assert.deepEqual(navigations, ["/pages/identity/index"]);
}

{
  const completeSession = {
    accessToken: "stored-session",
    expiresAt: Date.now() + 60_000,
    user: { id: "stored-user", displayName: "小禾", profileStatus: "complete" }
  };
  const { page, app } = createPage({}, { appSession: completeSession });
  page.onLoad({ humiLogout: "1" });
  assert.equal(app.globalData.humiSession, null);
  assert.equal(page.data.currentSession, null);
  assert.doesNotMatch(page.data.url, /humiTicket=/);
}

{
  const { page } = createPage();
  page.openWebView("https://www.humi-home.com/?channel=wechat-miniprogram");
  page.handleError({ detail: { errMsg: "domain blocked" } });
  assert.equal(page.data.url, "", "failed web-view should be removed so the native fallback is visible");
  assert.ok(page.data.webViewError, "failed web-view should explain the failure to the user");
  page.retryWebView();
  assert.match(page.data.url, /humiRetry=/, "retry should force a fresh web-view navigation");
  assert.equal(page.data.webViewError, "", "retry should clear the native error state");
}

console.log("Mini-program entrypoint resilience checks passed.");
