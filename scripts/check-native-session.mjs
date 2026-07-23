import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const utilDirectory = path.join(root, "miniprogram/utils");
for (const name of ["errors.js", "session.js", "request.js", "cache.js", "telemetry.js", "store.js"]) {
  const file = path.join(utilDirectory, name);
  if (!fs.existsSync(file)) throw new Error(`Cannot find module '${file}'`);
}

function createRuntime({ responses = [], loginCode = "wechat-code", asyncResponses = false } = {}) {
  const storage = new Map();
  const calls = { login: 0, request: [] };
  const wx = {
    getDeviceInfo: () => ({ platform: "ios" }),
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: (key) => storage.delete(key),
    login: ({ success, fail }) => {
      calls.login += 1;
      if (loginCode === null) fail?.(new Error("login unavailable"));
      else success?.({ code: loginCode });
    },
    request: (options) => {
      calls.request.push({ ...options, header: { ...(options.header || {}) } });
      const response = responses.shift() || { statusCode: 200, data: {} };
      const respond = () => {
        if (response.fail) {
          options.fail?.(response.fail);
        } else {
          options.success?.({ statusCode: response.statusCode, data: response.data, header: response.header || {} });
        }
        options.complete?.();
      };
      if (asyncResponses) queueMicrotask(respond);
      else respond();
    }
  };
  const modules = new Map();
  function load(file) {
    const resolved = path.resolve(file);
    if (modules.has(resolved)) return modules.get(resolved).exports;
    const record = { exports: {} };
    modules.set(resolved, record);
    const source = fs.readFileSync(resolved, "utf8");
    const context = vm.createContext({
      module: record,
      exports: record.exports,
      require: (specifier) => load(path.resolve(path.dirname(resolved), `${specifier}.js`)),
      wx,
      console,
      Date,
      Promise,
      JSON,
      Math,
      setTimeout,
      clearTimeout,
      structuredClone
    });
    new vm.Script(source, { filename: resolved }).runInContext(context);
    return record.exports;
  }
  return { ...load(path.join(utilDirectory, "request.js")), session: load(path.join(utilDirectory, "session.js")), storage, calls };
}

{
  const runtime = createRuntime({
    asyncResponses: true,
    responses: [
      { statusCode: 401, data: { error: "unauthorized" } },
      { statusCode: 401, data: { error: "unauthorized" } },
      { statusCode: 200, data: { accessToken: "fresh-token", expiresAt: Date.now() + 60_000 } },
      { statusCode: 200, data: { stateVersion: "v2-a" } },
      { statusCode: 200, data: { stateVersion: "v2-b" } }
    ]
  });
  runtime.session.saveSession({ accessToken: "old-token", expiresAt: Date.now() + 60_000 });
  const [first, second] = await Promise.all([runtime.requestHumi({ path: "/bootstrap" }), runtime.requestHumi({ path: "/bootstrap" })]);
  assert.deepEqual([first.stateVersion, second.stateVersion].sort(), ["v2-a", "v2-b"]);
  assert.equal(runtime.calls.login, 1, "concurrent 401 recoveries share one wx.login");
  assert.equal(runtime.calls.request.filter((call) => call.url.endsWith("/bootstrap")).length, 4, "each concurrent request receives one replay only");
}

{
  const runtime = createRuntime();
  const now = Date.now();
  assert.equal(runtime.session.restoreSession({ accessToken: "x", expiresAt: now + 60_000 }).accessToken, "x");
  assert.equal(runtime.session.restoreSession({ accessToken: "x", expiresAt: now - 1 }), null);
}

{
  const runtime = createRuntime({
    responses: [
      { statusCode: 401, data: { error: "unauthorized" } },
      { statusCode: 200, data: { accessToken: "fresh-token", expiresAt: Date.now() + 60_000 } },
      { statusCode: 200, data: { schemaVersion: 1, stateVersion: "v2" } }
    ]
  });
  runtime.session.saveSession({ accessToken: "old-token", expiresAt: Date.now() + 60_000 });
  const envelope = await runtime.requestHumi({ path: "/bootstrap" });
  assert.equal(envelope.stateVersion, "v2");
  assert.equal(runtime.calls.login, 1, "a first 401 should make exactly one silent wx.login attempt");
  assert.equal(runtime.calls.request.filter((call) => call.url.endsWith("/bootstrap")).length, 2, "a GET should replay once");
  assert.equal(runtime.calls.request[0].header.Authorization, "Bearer old-token");
  assert.equal(runtime.calls.request[2].header.Authorization, "Bearer fresh-token");
}

{
  const runtime = createRuntime({
    responses: [
      { statusCode: 401, data: { error: "unauthorized" } },
      { statusCode: 200, data: { accessToken: "fresh-token", expiresAt: Date.now() + 60_000 } },
      { statusCode: 401, data: { error: "unauthorized" } }
    ]
  });
  runtime.session.saveSession({ accessToken: "old-token", expiresAt: Date.now() + 60_000 });
  await assert.rejects(() => runtime.requestHumi({ path: "/bootstrap" }), (error) => {
    assert.equal(error.code, "invalid_session");
    return true;
  });
  assert.equal(runtime.session.getSession(), null, "a second 401 must clear the local session");
  assert.equal(runtime.calls.login, 1);
}

{
  const runtime = createRuntime({
    responses: [
      { statusCode: 401, data: { error: "unauthorized" } },
      { statusCode: 401, data: { error: "unauthorized" } }
    ]
  });
  runtime.session.saveSession({ accessToken: "old-token", expiresAt: Date.now() + 60_000 });
  await assert.rejects(() => runtime.requestHumi({ path: "/bootstrap" }), (error) => {
    assert.equal(error.code, "invalid_session", "a rejected refresh must normalize to invalid_session");
    assert.equal(error.retryable, false);
    return true;
  });
  assert.equal(runtime.session.getSession(), null, "a rejected refresh must clear the stale session");
  assert.equal(runtime.calls.login, 1);
}

{
  const runtime = createRuntime({ responses: [{ statusCode: 401, data: { error: "unauthorized" } }] });
  runtime.session.saveSession({ accessToken: "old-token", expiresAt: Date.now() + 60_000 });
  await assert.rejects(() => runtime.requestHumi({ path: "/meal-runs", method: "POST", data: { recipeId: "r1" } }), (error) => {
    assert.equal(error.status, 401);
    return true;
  });
  assert.equal(runtime.calls.login, 0, "a POST without an idempotency key must not be replayed");
  assert.equal(runtime.calls.request.length, 1);
}

{
  const runtime = createRuntime({ responses: [{ statusCode: 200, data: { ok: true } }] });
  runtime.session.saveSession({ accessToken: "token", expiresAt: Date.now() + 60_000 });
  await runtime.requestHumi({ path: "/meal-runs", method: "POST", idempotencyKey: "stable-key", stateVersion: "version-1" });
  assert.deepEqual(runtime.calls.request[0].header, {
    "content-type": "application/json",
    Authorization: "Bearer token",
    "X-Humi-Idempotency-Key": "stable-key",
    "If-Match": "version-1"
  });
}

console.log("Native session foundation contract passed.");
