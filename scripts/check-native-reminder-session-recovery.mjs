import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const scheduledAt = "2026-07-28T10:30:00.000Z";

{
  const runtime = createRuntime([
    http(401, { code: "invalid_session" }),
    http(200, freshSession()),
    http(200, { enabled: true, templateId: "template-1", existingReminder: null }),
  ]);
  runtime.seedSession(oldSession());
  const page = runtime.loadReminderPage();
  await page.onLoad({ mealRunId: "meal-1", scheduledAt, dateKey: "2026-07-28" });
  assert.equal(runtime.calls.login, 1, "reminder config performs one silent WeChat login after its first 401");
  assert.equal(runtime.calls.request.filter((call) => call.url.includes("/meal-reminders/config")).length, 2, "reminder config replays exactly once");
  assert.equal(page.data.templateId, "template-1");
}

{
  const runtime = createRuntime([
    http(200, { enabled: true, templateId: "template-1", existingReminder: null }),
    http(401, { code: "invalid_session" }),
    http(200, freshSession()),
    http(201, { reminder: { id: "reminder-1", status: "scheduled", scheduledAt } }),
  ]);
  runtime.seedSession(oldSession());
  const page = runtime.loadReminderPage();
  await page.onLoad({ mealRunId: "meal-1", scheduledAt, dateKey: "2026-07-28" });
  await page.confirmReminder();
  const creates = runtime.calls.request.filter((call) => call.url.endsWith("/meal-reminders"));
  assert.equal(creates.length, 2, "an idempotent reminder POST replays exactly once after 401");
  assert.equal(creates[0].header["X-Humi-Idempotency-Key"], creates[1].header["X-Humi-Idempotency-Key"], "the replay keeps one stable idempotency key");
  assert.equal(runtime.calls.subscribe, 1, "session recovery never asks for subscription consent again");
  assert.equal(page.data.saved, true);
}

{
  const runtime = createRuntime([
    http(401, { code: "invalid_session" }),
    http(200, freshSession()),
    http(401, { code: "invalid_session" }),
  ]);
  runtime.seedSession(oldSession());
  const page = runtime.loadReminderPage();
  await page.onLoad({ mealRunId: "meal-1", scheduledAt, dateKey: "2026-07-28" });
  assert.equal(runtime.calls.login, 1);
  assert.equal(runtime.session.getSession(), null, "a second 401 clears the expired session");
  assert.equal(page.data.needsLogin, true, "a second 401 puts the page into a recoverable login state");
  assert.match(page.data.status, /登录/);
  assert.equal(page.data.loading, false, "a second 401 never leaves the page hung");
}

{
  const runtime = createRuntime([
    http(200, { enabled: true, templateId: "template-1", existingReminder: null }),
    { fail: { errMsg: "request:fail network" } },
  ]);
  runtime.seedSession(oldSession());
  const page = runtime.loadReminderPage();
  await page.onLoad({ mealRunId: "meal-1", scheduledAt, dateKey: "2026-07-28" });
  await page.confirmReminder();
  assert.equal(page.data.permissionAccepted, true, "accepted consent survives a network save failure");
  assert.equal(page.data.pending, false);
  assert.match(page.data.status, /网络|没有保存/);
  assert.equal(runtime.calls.request.filter((call) => call.url.endsWith("/meal-reminders")).length, 1, "a network failure is not blindly replayed by the auth contract");
}

console.log("Native reminder shared session recovery checks passed.");

function createRuntime(responses) {
  const storage = new Map();
  const calls = { login: 0, request: [], subscribe: 0 };
  let pageDefinition;
  const app = {
    globalData: { humiSession: null },
    setHumiSession(value) { this.globalData.humiSession = value; },
    clearHumiSession() { this.globalData.humiSession = null; session.clearSession(); },
  };
  const wx = {
    getDeviceInfo: () => ({ platform: "ios" }),
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: (key) => storage.delete(key),
    login({ success }) { calls.login += 1; success({ code: `refresh-${calls.login}` }); },
    request(options) {
      calls.request.push({ ...options, header: { ...(options.header || {}) } });
      const response = responses.shift();
      if (!response) throw new Error(`No response fixture for ${options.method || "GET"} ${options.url}`);
      queueMicrotask(() => {
        if (response.fail) options.fail?.(response.fail);
        else options.success?.({ statusCode: response.statusCode, data: response.data });
        options.complete?.();
      });
    },
    requestSubscribeMessage({ tmplIds, success }) {
      calls.subscribe += 1;
      success({ [tmplIds[0]]: "accept" });
    },
    navigateBack() {}, reLaunch() {}, navigateTo() {},
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
      Page: (definition) => { pageDefinition = definition; },
      getApp: () => app,
      getCurrentPages: () => [{}, {}],
      wx, console, Date, Math, Promise, Map, Set, JSON, Object, String, Number,
      encodeURIComponent, setTimeout, clearTimeout, structuredClone, queueMicrotask,
    }, { filename: resolved });
    return record.exports;
  }
  const session = load(path.join(root, "miniprogram/utils/session.js"));
  return {
    calls,
    session,
    seedSession(value) { session.saveSession(value); app.setHumiSession(value); },
    loadReminderPage() {
      load(path.join(root, "miniprogram/pages/reminder/index.js"));
      assert(pageDefinition, "reminder page must register");
      return {
        ...pageDefinition,
        data: structuredClone(pageDefinition.data),
        setData(patch) { Object.assign(this.data, patch); },
      };
    },
  };
}

function http(statusCode, data) { return { statusCode, data }; }
function oldSession() { return { accessToken: "old-token", expiresAt: Date.now() + 60_000, user: { id: "user-1", displayName: "小禾", profileStatus: "complete" } }; }
function freshSession() { return { accessToken: "fresh-token", expiresAt: Date.now() + 60_000, user: { id: "user-1", displayName: "小禾", profileStatus: "complete" } }; }
