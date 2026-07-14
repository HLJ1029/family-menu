import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const pageSource = fs.readFileSync(new URL("../miniprogram/pages/index/index.js", import.meta.url), "utf8");

function createPage(wxOverrides = {}, runtimeOverrides = {}) {
  let definition;
  const app = { globalData: { humiSession: null, humiPhoneSessionUpdatedAt: 0 } };
  const wx = {
    getDeviceInfo: () => ({ platform: "ios" }),
    showShareMenu: () => {},
    showToast: () => {},
    login: ({ success }) => success({ code: "wechat-code" }),
    request: ({ success, complete }) => {
      success({
        statusCode: 200,
        data: { accessToken: "session-token", user: { id: "user-1", displayName: "测试用户" } }
      });
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
  return { page, changes };
}

{
  const { page, changes } = createPage();
  page.onLoad({});
  const mountedUrls = changes.filter((patch) => patch.url).map((patch) => patch.url);
  assert.equal(mountedUrls.length, 1, "normal startup should mount web-view only once");
  assert.match(mountedUrls[0], /humiSession=/, "successful startup login should reach H5 in the first URL");
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
  let timeoutCallback;
  const { page } = createPage(
    { login: () => {} },
    {
      setTimeout: (callback) => {
        timeoutCallback = callback;
        return 1;
      },
      clearTimeout: () => {}
    }
  );
  page.onLoad({});
  assert.equal(page.data.url, "", "web-view should wait while startup login is still inside its budget");
  timeoutCallback();
  assert.match(page.data.url, /^https:\/\/www\.humi-home\.com\//, "startup timeout should continue as a guest");
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
