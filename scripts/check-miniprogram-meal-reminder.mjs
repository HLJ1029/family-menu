import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const appConfig = JSON.parse(readFileSync("miniprogram/app.json", "utf8"));
assert(appConfig.pages.includes("pages/reminder/index"), "app.json must register the native reminder page");

const pageSource = readFileSync("miniprogram/pages/reminder/index.js", "utf8");
const markup = readFileSync("miniprogram/pages/reminder/index.wxml", "utf8");
const taskPageSource = readFileSync("miniprogram/packageFamily/pages/task/index.js", "utf8");
assert.match(markup, /bindtap="confirmReminder"/, "subscription authorization must be attached to the explicit scheduling confirmation");
assert.match(markup, /mode="date"/, "the user must actively choose a reminder date");
assert.match(markup, /mode="time"/, "the user must actively choose a reminder time");
assert.doesNotMatch(pageSource, /onLoad[\s\S]{0,500}requestSubscribeMessage/, "onLoad must never open WeChat subscription authorization");
assert.doesNotMatch(pageSource, /onShow[\s\S]{0,500}requestSubscribeMessage/, "onShow must never open WeChat subscription authorization");
assert.doesNotMatch(pageSource, /wx\.request\s*\(/, "reminder APIs must use the shared authenticated request boundary");
assert.doesNotMatch(taskPageSource, /Date\\.now|Math\\.random/, "task claim and completion retries must use stable idempotency keys");

const scheduledAt = "2026-07-25T10:30:00.000Z";
const decisionKey = "humi:meal-reminder-consent:v3:meal-1";

{
  const runtime = createReminderPage({ subscriptionResult: "accept" });
  await runtime.page.onLoad({ effortTier: "quick_15", mealRunId: "meal-1" });
  await runtime.page.confirmReminder();
  assert.equal(runtime.subscribeCalls.length, 0, "authorization cannot open before the user chooses date and time");
  runtime.page.onDateChange({ detail: { value: "2026-07-26" } });
  runtime.page.onTimeChange({ detail: { value: "18:30" } });
  assert.equal(runtime.page.data.scheduledAt, "2026-07-26T10:30:00.000Z");
  await runtime.page.confirmReminder();
  assert.equal(runtime.subscribeCalls.length, 1);
}

{
  const runtime = createReminderPage({ subscriptionResult: "accept" });
  await runtime.page.onLoad({ scheduledAt, dateKey: "2026-07-25", effortTier: "quick_15", mealRunId: "meal-1" });
  runtime.page.onShow?.();
  assert.equal(runtime.subscribeCalls.length, 0, "opening the page must not request subscription permission");
  assert.equal(runtime.requests.filter((item) => item.method === "GET").length, 1, "the page should fetch the server-owned template ID");
  assert.match(runtime.requests[0].path, /mealRunId=meal-1/, "reminder eligibility must be scoped to the completed source meal");
  await runtime.page.confirmReminder();
  assert.equal(runtime.subscribeCalls.length, 1, `one user tap should request permission once: ${JSON.stringify(runtime.page.data)}`);
  assert.equal(Array.from(runtime.subscribeCalls[0]).join(","), "template-1");
  const creates = runtime.requests.filter((item) => item.method === "POST");
  assert.equal(creates.length, 1, "accepted permission should create exactly one reminder");
  assert.deepEqual(JSON.parse(JSON.stringify(creates[0].data)), {
    scheduledAt,
    dateKey: "2026-07-25",
    effortTier: "quick_15",
    sourceMealRunId: "meal-1",
    templateId: "template-1",
    accepted: true,
  });
  await runtime.page.confirmReminder();
  assert.equal(runtime.subscribeCalls.length, 1, "a saved reminder must not request permission twice");
  assert.equal(runtime.requests.filter((item) => item.method === "POST").length, 1);
  assert.match(runtime.requests.find((item) => item.method === "POST").idempotencyKey, /meal-1/, "reminder save retries use one stable key");
}

{
  const runtime = createReminderPage({ subscriptionResult: "reject" });
  await runtime.page.onLoad({ scheduledAt, dateKey: "2026-07-25", effortTier: "easy_30", mealRunId: "meal-1" });
  await runtime.page.confirmReminder();
  assert.equal(runtime.requests.filter((item) => item.method === "POST").length, 0, "rejected permission must not create a reminder");
  assert.equal(runtime.storage.get(decisionKey)?.state, "rejected");
  await runtime.page.confirmReminder();
  assert.equal(runtime.subscribeCalls.length, 1, "rejection must not trigger another permission request");
}

{
  const runtime = createReminderPage({ subscriptionFailure: true });
  await runtime.page.onLoad({ scheduledAt, dateKey: "2026-07-25", effortTier: "normal", mealRunId: "meal-1" });
  await runtime.page.confirmReminder();
  assert.equal(runtime.requests.filter((item) => item.method === "POST").length, 0, "cancelled authorization must not create a reminder");
  assert.match(runtime.page.data.status, /没有设置|取消/);
  assert.equal(runtime.storage.get(decisionKey)?.state, "cancelled");
  await runtime.page.confirmReminder();
  assert.equal(runtime.subscribeCalls.length, 1, "cancellation must not reopen authorization for the same first-completion flow");
}

{
  const sharedStorage = new Map();
  const runtime = createReminderPage({ subscriptionResult: "accept", postStatusCode: 503, storage: sharedStorage });
  await runtime.page.onLoad({ scheduledAt, dateKey: "2026-07-25", effortTier: "normal", mealRunId: "meal-1" });
  await runtime.page.confirmReminder();
  assert.equal(runtime.subscribeCalls.length, 1);
  assert.equal(runtime.requests.filter((item) => item.method === "POST").length, 1);
  assert.match(runtime.page.data.status, /没有保存|重试/);
  await runtime.page.confirmReminder();
  assert.equal(runtime.subscribeCalls.length, 1, "an API save retry must reuse accepted permission without reopening WeChat authorization");
  assert.equal(runtime.requests.filter((item) => item.method === "POST").length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(sharedStorage.get(decisionKey))), {
    state: "accepted_pending",
    scheduledAt,
  });

  const reopened = createReminderPage({ subscriptionResult: "accept", postStatusCode: 503, storage: sharedStorage });
  await reopened.page.onLoad({ effortTier: "normal", mealRunId: "meal-1" });
  reopened.page.onDateChange({ detail: { value: "2026-07-27" } });
  reopened.page.onTimeChange({ detail: { value: "19:00" } });
  await reopened.page.confirmReminder();
  assert.equal(
    reopened.subscribeCalls.length,
    1,
    "accepted permission from another schedule cannot be reused after reopening to create a new schedule",
  );
}

{
  const runtime = createReminderPage({
    existingReminder: {
      id: "existing-reminder",
      status: "scheduled",
      scheduledAt,
      dateKey: "2026-07-25",
      effortTier: "quick_15",
    },
  });
  await runtime.page.onLoad({ effortTier: "quick_15", mealRunId: "meal-1" });
  assert.equal(runtime.page.data.saved, true, "server reminder truth makes a reopened page read-only");
  assert.equal(runtime.page.data.scheduledAt, scheduledAt);
  await runtime.page.confirmReminder();
  assert.equal(runtime.subscribeCalls.length, 0);
  assert.equal(runtime.requests.filter((item) => item.method === "POST").length, 0);
}

for (const [status, label] of [
  ["sent", "已发送"],
  ["cancelled", "已取消"],
  ["failed", "未能发送"],
  ["delivery_unknown", "发送未确认"],
]) {
  const runtime = createReminderPage({
    existingReminder: {
      id: `existing-${status}`,
      status,
      scheduledAt,
      dateKey: "2026-07-25",
      effortTier: "quick_15",
    },
  });
  await runtime.page.onLoad({ mealRunId: "meal-1" });
  assert.equal(runtime.page.data.saved, true);
  assert.equal(runtime.page.data.reminderButtonLabel, label, `${status} remains read-only without claiming it is scheduled`);
}

{
  const storage = new Map([[decisionKey, { state: "rejected" }]]);
  const runtime = createReminderPage({ configStatusCode: 503, storage });
  await runtime.page.onLoad({ scheduledAt, mealRunId: "meal-1" });
  assert.match(runtime.page.data.status, /拒绝/, "a config HTTP failure must not overwrite the stored rejection");
}

{
  const storage = new Map([[decisionKey, { state: "cancelled" }]]);
  const runtime = createReminderPage({ configFailure: true, storage });
  await runtime.page.onLoad({ scheduledAt, mealRunId: "meal-1" });
  assert.match(runtime.page.data.status, /不会再次索取授权/, "a config network failure must not overwrite the stored cancellation");
}

{
  const runtime = createReminderPage({ session: null });
  await runtime.page.onLoad({ scheduledAt, dateKey: "2026-07-25", effortTier: "quick_15" });
  assert.equal(runtime.requests.length, 0, "a signed-out user must not call reminder APIs");
  assert.equal(runtime.page.data.needsLogin, true);
}

{
  const runtime = createReminderPage({ subscriptionResult: "accept" });
  runtime.page.goBack();
  assert.deepEqual(runtime.navigations, ["navigateBack"], "the reminder page should return to the existing H5 stack");
}

console.log("Mini-program meal reminder checks passed.");

function createReminderPage({
  subscriptionResult = "accept",
  subscriptionFailure = false,
  postStatusCode = 201,
  configStatusCode = 200,
  configFailure = false,
  session = defaultSession(),
  existingReminder = null,
  storage = new Map(),
} = {}) {
  let definition;
  const requests = [];
  const subscribeCalls = [];
  const navigations = [];
  const wx = {
    getStorageSync(key) {
      return storage.get(key);
    },
    setStorageSync(key, value) {
      storage.set(key, value);
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
  vm.runInNewContext(pageSource, {
    Page(value) { definition = value; },
    getCurrentPages: () => [{}, {}],
    wx,
    console,
    Date,
    require(specifier) {
      if (specifier === "../../utils/session") return { getSession: () => session };
      if (specifier === "../../utils/request") return {
        requestHumi: async (options) => {
          requests.push({ ...structuredClone(options), method: options.method || "GET" });
          if ((options.method || "GET") === "GET") {
            if (configFailure) {
              const error = new Error("network_error"); error.status = 0; error.code = "network_error"; throw error;
            }
            if (configStatusCode < 200 || configStatusCode >= 300) {
              const error = new Error("request_failed"); error.status = configStatusCode; throw error;
            }
            return { enabled: true, templateId: "template-1", existingReminder };
          }
          if (postStatusCode < 200 || postStatusCode >= 300) {
            const error = new Error("temporary_failure"); error.status = postStatusCode; throw error;
          }
          return { reminder: { id: "reminder-1", status: "scheduled" } };
        },
      };
      throw new Error(`Unexpected reminder dependency: ${specifier}`);
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
