import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const token = "t".repeat(32);
const task = {
  id: "task-1", householdId: "household-1", mealRunId: "run-1", label: "帮忙洗青菜", type: "prep",
  status: "open", claimedBy: null, claimedByName: "", viewerClaimed: false, viewerCanComplete: false,
};
const runtime = createRuntime([
  { statusCode: 401, data: { code: "invalid_session" } },
  { statusCode: 200, data: freshSession() },
  { statusCode: 200, data: { task } },
]);
runtime.session.saveSession(oldSession());
const page = runtime.loadTaskPage();
await page.onLoad({ token });
assert.equal(runtime.calls.login, 1, "an expired task-page session performs one silent login");
const taskLoads = runtime.calls.request.filter((call) => call.url.endsWith(`/meal-tasks/${token}`));
assert.equal(taskLoads.length, 2, "the authenticated task load replays exactly once after 401");
assert.equal(taskLoads[0].header.Authorization, "Bearer old-token");
assert.equal(taskLoads[1].header.Authorization, "Bearer fresh-token");
assert.equal(page.data.status, "ready");
assert.equal(page.data.currentUserId, "member-1", "the recovered page renders the refreshed formal identity");

console.log("Native meal-task shared session recovery check passed.");

function createRuntime(responses) {
  const storage = new Map();
  const calls = { login: 0, request: [] };
  let taskDefinition;
  const app = { setHumiSession() {}, clearHumiSession() { session.clearSession(); } };
  const wx = {
    getDeviceInfo: () => ({ platform: "ios" }),
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: (key) => storage.delete(key),
    login({ success }) { calls.login += 1; success({ code: `refresh-${calls.login}` }); },
    request(options) {
      calls.request.push({ ...options, header: { ...(options.header || {}) } });
      const response = responses.shift();
      if (!response) throw new Error(`Missing response for ${options.url}`);
      queueMicrotask(() => {
        options.success({ statusCode: response.statusCode, data: response.data });
        options.complete?.();
      });
    },
    navigateTo() {},
  };
  const modules = new Map();
  function load(filename) {
    const resolved = path.resolve(filename);
    if (modules.has(resolved)) return modules.get(resolved).exports;
    const record = { exports: {} };
    modules.set(resolved, record);
    vm.runInNewContext(fs.readFileSync(resolved, "utf8"), {
      module: record,
      exports: record.exports,
      require: (specifier) => load(path.resolve(path.dirname(resolved), `${specifier}.js`)),
      getApp: () => app,
      wx, console, Date, Math, Promise, Map, Set, JSON, Object, String, Number,
      encodeURIComponent, setTimeout, clearTimeout, structuredClone, queueMicrotask,
    }, { filename: resolved });
    return record.exports;
  }
  const session = load(path.join(root, "miniprogram/utils/session.js"));
  const request = load(path.join(root, "miniprogram/utils/request.js"));
  return {
    calls,
    session,
    loadTaskPage() {
      const filename = path.join(root, "miniprogram/packageFamily/pages/task/index.js");
      const record = { exports: {} };
      vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
        Page: (definition) => { taskDefinition = definition; },
        module: record,
        exports: record.exports,
        require: (specifier) => {
          if (specifier === "../../../utils/request") return request;
          if (specifier === "../../../utils/session") return session;
          if (specifier === "../../../utils/telemetry") return { trackEvent() {} };
          if (specifier === "../../../behaviors/shareable-page") return {
            data: { preparedShares: {}, sharePreparing: {}, shareErrors: {} },
            methods: { prepareNativeShare: async () => null, getNativeSharePayload: (_event, fallback) => fallback },
          };
          throw new Error(`Unexpected task dependency: ${specifier}`);
        },
        getApp: () => app,
        wx, console, Date, Math, Promise, Map, encodeURIComponent,
      }, { filename });
      const behaviorMethods = Object.assign({}, ...(taskDefinition.behaviors || []).map((behavior) => behavior.methods || {}));
      const behaviorData = Object.assign({}, ...(taskDefinition.behaviors || []).map((behavior) => behavior.data || {}));
      return {
        ...behaviorMethods,
        ...taskDefinition,
        data: structuredClone({ ...behaviorData, ...taskDefinition.data }),
        setData(patch) { Object.assign(this.data, patch); },
      };
    },
  };
}

function oldSession() { return { accessToken: "old-token", expiresAt: Date.now() + 60_000, user: { id: "member-1", displayName: "小米", profileStatus: "complete" } }; }
function freshSession() { return { accessToken: "fresh-token", expiresAt: Date.now() + 60_000, user: { id: "member-1", displayName: "小米", profileStatus: "complete" } }; }
