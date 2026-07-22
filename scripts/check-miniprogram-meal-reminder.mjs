import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const appConfig = JSON.parse(readFileSync("miniprogram/app.json", "utf8"));
assert(appConfig.pages.includes("pages/reminder/index"), "app.json must register the native reminder page");

const pageSource = readFileSync("miniprogram/pages/reminder/index.js", "utf8");
const markup = readFileSync("miniprogram/pages/reminder/index.wxml", "utf8");
assert.match(markup, /bindtap="requestReminder"/, "subscription authorization must be attached to an explicit user-tap button");
assert.doesNotMatch(pageSource, /onLoad[\s\S]{0,500}requestSubscribeMessage/, "onLoad must never open WeChat subscription authorization");

const scheduledAt = "2026-07-25T10:30:00.000Z";

{
  const runtime = createReminderPage({ subscriptionResult: "accept" });
  runtime.page.onLoad({ scheduledAt, dateKey: "2026-07-25", effortTier: "quick_15", mealRunId: "meal-1" });
  assert.equal(runtime.subscribeCalls.length, 0, "opening the page must not request subscription permission");
  assert.equal(runtime.requests.filter((item) => item.method === "GET").length, 1, "the page should fetch the server-owned template ID");
  runtime.page.requestReminder();
  assert.equal(runtime.subscribeCalls.length, 1, `one user tap should request permission once: ${JSON.stringify(runtime.page.data)}`);
  assert.equal(Array.from(runtime.subscribeCalls[0]).join(","), "template-1");
  const creates = runtime.requests.filter((item) => item.method === "POST");
  assert.equal(creates.length, 1, "accepted permission should create exactly one reminder");
  assert.deepEqual(JSON.parse(JSON.stringify(creates[0].data)), {
    scheduledAt,
    dateKey: "2026-07-25",
    effortTier: "quick_15",
    mealRunId: "meal-1",
    templateId: "template-1",
    accepted: true,
  });
  runtime.page.requestReminder();
  assert.equal(runtime.subscribeCalls.length, 1, "a saved reminder must not request permission twice");
  assert.equal(runtime.requests.filter((item) => item.method === "POST").length, 1);
}

{
  const runtime = createReminderPage({ subscriptionResult: "reject" });
  runtime.page.onLoad({ scheduledAt, dateKey: "2026-07-25", effortTier: "easy_30" });
  runtime.page.requestReminder();
  assert.equal(runtime.requests.filter((item) => item.method === "POST").length, 0, "rejected permission must not create a reminder");
  assert.equal(runtime.storage.get("humi:meal-reminder-consent:v1"), "rejected");
  runtime.page.requestReminder();
  assert.equal(runtime.subscribeCalls.length, 1, "rejection must not trigger another permission request");
}

{
  const runtime = createReminderPage({ subscriptionFailure: true });
  runtime.page.onLoad({ scheduledAt, dateKey: "2026-07-25", effortTier: "normal" });
  runtime.page.requestReminder();
  assert.equal(runtime.requests.filter((item) => item.method === "POST").length, 0, "cancelled authorization must not create a reminder");
  assert.match(runtime.page.data.status, /没有设置|取消/);
}

{
  const runtime = createReminderPage({ session: null });
  runtime.page.onLoad({ scheduledAt, dateKey: "2026-07-25", effortTier: "quick_15" });
  assert.equal(runtime.requests.length, 0, "a signed-out user must not call reminder APIs");
  assert.equal(runtime.page.data.needsLogin, true);
}

{
  const runtime = createReminderPage({ subscriptionResult: "accept" });
  runtime.page.goBack();
  assert.deepEqual(runtime.navigations, ["navigateBack"], "the reminder page should return to the existing H5 stack");
}

console.log("Mini-program meal reminder checks passed.");

function createReminderPage({ subscriptionResult = "accept", subscriptionFailure = false, session = defaultSession() } = {}) {
  let definition;
  const requests = [];
  const subscribeCalls = [];
  const navigations = [];
  const storage = new Map();
  const wx = {
    getStorageSync(key) {
      return storage.get(key);
    },
    setStorageSync(key, value) {
      storage.set(key, value);
    },
    request({ url, method = "GET", data, success, complete = () => {} }) {
      requests.push({ url, method, data });
      if (method === "GET") success?.({ statusCode: 200, data: { enabled: true, templateId: "template-1" } });
      else success?.({ statusCode: 201, data: { reminder: { id: "reminder-1", status: "scheduled" } } });
      complete();
    },
    requestSubscribeMessage({ tmplIds, success, fail }) {
      subscribeCalls.push(tmplIds);
      if (subscriptionFailure) fail?.({ errMsg: "requestSubscribeMessage:fail cancel" });
      else success?.({ [tmplIds[0]]: subscriptionResult });
    },
    navigateBack() {
      navigations.push("navigateBack");
    },
    reLaunch({ url }) {
      navigations.push(url);
    },
  };
  const app = { globalData: { humiSession: session } };
  vm.runInNewContext(pageSource, {
    Page(value) { definition = value; },
    getApp: () => app,
    getCurrentPages: () => [{}, {}],
    wx,
    console,
    Date,
    require(specifier) {
      assert.equal(specifier, "../../utils/config");
      return { getHumiApiBaseUrl: () => "https://api.humi-home.com" };
    },
  });
  assert(definition, "reminder page should register");
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      this.data = { ...this.data, ...patch };
    },
  };
  return { page, requests, subscribeCalls, navigations, storage };
}

function defaultSession() {
  return {
    accessToken: "session-token",
    expiresAt: Date.now() + 60_000,
    user: { id: "user-1", profileStatus: "complete" },
  };
}
