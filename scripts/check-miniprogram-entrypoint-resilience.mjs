import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const pageSource = fs.readFileSync(new URL("../miniprogram/pages/legacy/index.js", import.meta.url), "utf8");
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
  let sharedLoginCalls = 0;
  let clearSessionCalls = 0;
  const app = {
    globalData: { humiSession: runtimeOverrides.appSession ?? null },
    setHumiSession(session) {
      this.globalData.humiSession = session;
    },
    clearHumiSession() {
      clearSessionCalls += 1;
      this.globalData.humiSession = null;
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
      if (specifier === "../../utils/session") {
        return {
          loginWithWechat: async () => {
            sharedLoginCalls += 1;
            return runtimeOverrides.loginResult || {
              accessToken: "identity-session-token",
              expiresAt: Date.now() + 60_000,
              user: { id: "user-1", displayName: "微信用户", profileStatus: "incomplete" }
            };
          }
        };
      }
      if (specifier === "../../utils/request") return { requestHumi: async () => ({}) };
      if (specifier === "../../utils/bootstrap") return { clearBootstrapCacheForUser: () => {} };
      if (specifier === "../../utils/telemetry") return { startSpan: () => ({ end: () => {} }) };
      if (specifier === "../../utils/user-message") return { toHumiUserMessage: (_error, fallback) => fallback };
      if (specifier === "../../data/approved-avatar-keys.json") return ["humi-avatar-parent-f-01"];
      assert.fail(`Unexpected identity dependency: ${specifier}`);
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
  return { page, app, requestUrls, relaunches, getSharedLoginCalls: () => sharedLoginCalls, getClearSessionCalls: () => clearSessionCalls };
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
  let rawWxLoginCalls = 0;
  const revokedSession = {
    accessToken: "revoked-native-session",
    expiresAt: Date.now() + 60_000,
    user: { id: "revoked-user", displayName: "旧用户", profileStatus: "complete" }
  };
  const { page, app, requestUrls, getSharedLoginCalls, getClearSessionCalls } = createIdentityPage(
    {
      login: ({ success }) => {
        rawWxLoginCalls += 1;
        success({ code: "wechat-code" });
      }
    },
    { appSession: revokedSession }
  );
  await page.onLoad({ action: "login" });
  assert.equal(getClearSessionCalls(), 1, "explicit identity route must clear the stale native session before shared login");
  assert.equal(getSharedLoginCalls(), 1, "explicit identity route must trigger exactly one shared login");
  assert.equal(rawWxLoginCalls, 0, "identity page must not duplicate wx.login outside the shared session foundation");
  assert.deepEqual(requestUrls, [], "identity page must not issue a raw /auth/wechat/login request");
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
  const completeSession = {
    accessToken: "revoked-session",
    expiresAt: Date.now() + 60_000,
    user: { id: "revoked-user", displayName: "旧用户", profileStatus: "complete" }
  };
  const { page, app } = createPage({}, { appSession: completeSession });
  page.onLoad({ humiLogout: "1", humiExpired: "1" });
  assert.equal(app.globalData.humiSession, null);
  assert.match(page.data.url, /humiExpired=1/);
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
