import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HumiStore } from "../api/store.js";

const directory = await mkdtemp(join(tmpdir(), "humi-native-bootstrap-"));
let serverImportSequence = 0;

try {
  await verifyDefaultOffFirstUse();
  await verifyAllowlistedHouseholdSnapshot();
  await verifyExplicitNonAllowlistedHousehold();
  await verifyTestOnlyWildcardAllowlist();
  console.log("Native bootstrap API contract passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}

async function verifyDefaultOffFirstUse() {
  const server = await startServer("default-off", {
    HUMI_NATIVE_SHELL_ENABLED: "0",
    HUMI_NATIVE_SHELL_HOUSEHOLDS: "",
  });
  try {
    const anonymous = await rawRequest(`${server.baseUrl}/bootstrap`);
    assert.equal(anonymous.status, 401, "bootstrap must require a session");

    const guestOfApi = await login(server.baseUrl, "bootstrap-new-user");
    const first = await rawRequest(`${server.baseUrl}/bootstrap`, { token: guestOfApi.accessToken });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "private, no-store");
    assert.equal(first.data.schemaVersion, 1);
    assert.match(first.data.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(first.data.activeHouseholdId, "");
    assert.equal(first.data.householdState, null);
    assert.equal(first.data.currentMealRun, null);
    assert.deepEqual(first.data.households, []);
    assert.equal(first.data.capabilities.nativeShellEnabled, false);
    assert.equal(first.data.capabilities.mealExecutionEnabled, false);
    assert.equal(first.data.capabilities.reminderEnabled, false);
    assert.match(first.data.stateVersion, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(Object.keys(first.data.user).sort(), ["avatarKey", "avatarUrl", "displayName", "id", "profileStatus"]);
    assert.equal("openid" in first.data.user, false);
    assert.equal("phoneHash" in first.data.user, false);
    assert.equal(JSON.stringify(first.data).includes(guestOfApi.accessToken), false);
    assert.equal(JSON.stringify(first.data).includes("mock-openid-bootstrap-new-user"), false);

    const repeated = await rawRequest(`${server.baseUrl}/bootstrap`, { token: guestOfApi.accessToken });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.stateVersion, first.data.stateVersion, "same logical state must keep its version");

    const households = await request(`${server.baseUrl}/households`, { token: guestOfApi.accessToken });
    assert.equal(households.family, null, "reading bootstrap must not create a household");
    assert.deepEqual(households.households, [], "reading bootstrap must not add a member");
  } finally {
    await stopServer(server);
  }
}

async function verifyAllowlistedHouseholdSnapshot() {
  const dataFile = join(directory, "allowlisted.json");
  const store = new HumiStore(dataFile);
  const user = await store.findOrCreateWechatUser({ openid: "mock-openid-bootstrap-allowlisted", unionid: null });
  const household = await store.createHouseholdForUser(user.id, { householdName: "白名单家庭" });
  await store.saveState(user.id, {
    todayMenu: [{ recipeId: "tomato-egg", quantity: 1 }],
    activeCraveRequest: { token: "must-not-leak", status: "open" },
  }, household.id);
  const created = await store.createMealRun(user.id, {
    householdId: household.id,
    dateKey: todayDateKey(),
    mealSlot: "dinner",
    effortTier: "quick_15",
    recipeIds: ["tomato-egg"],
    idempotencyKey: "bootstrap-current-dinner",
  });
  const server = await startServer("allowlisted", {
    HUMI_API_DATA_FILE: dataFile,
    HUMI_NATIVE_SHELL_ENABLED: "1",
    HUMI_NATIVE_SHELL_HOUSEHOLDS: household.id,
  });
  try {
    const session = await login(server.baseUrl, "bootstrap-allowlisted");
    const bootstrap = await request(`${server.baseUrl}/bootstrap`, { token: session.accessToken });
    assert.equal(bootstrap.activeHouseholdId, household.id);
    assert.equal(bootstrap.households[0].role, "owner");
    assert.equal(bootstrap.capabilities.nativeShellEnabled, true, "an allowlisted household may enter the native shell");
    assert.equal(bootstrap.currentMealRun.id, created.mealRun.id, "bootstrap includes the current dinner only for the active household");
    assert.equal("token" in bootstrap.householdState.activeCraveRequest, false, "household state must remove share capabilities");
    const repeated = await request(`${server.baseUrl}/bootstrap`, { token: session.accessToken });
    assert.equal(repeated.stateVersion, bootstrap.stateVersion, "the same household snapshot must keep its version");
  } finally {
    await stopServer(server);
  }
}

async function verifyExplicitNonAllowlistedHousehold() {
  const dataFile = join(directory, "non-allowlisted.json");
  const store = new HumiStore(dataFile);
  const user = await store.findOrCreateWechatUser({ openid: "mock-openid-bootstrap-non-allowlisted", unionid: null });
  const household = await store.createHouseholdForUser(user.id, { householdName: "未白名单家庭" });
  const server = await startServer("non-allowlisted", {
    HUMI_API_DATA_FILE: dataFile,
    HUMI_NATIVE_SHELL_ENABLED: "1",
    HUMI_NATIVE_SHELL_HOUSEHOLDS: "another-household-id",
  });
  try {
    const session = await login(server.baseUrl, "bootstrap-non-allowlisted");
    const bootstrap = await request(`${server.baseUrl}/bootstrap`, { token: session.accessToken });
    assert.equal(bootstrap.activeHouseholdId, household.id);
    assert.equal(bootstrap.capabilities.nativeShellEnabled, false, "a household outside the allowlist stays on H5");
  } finally {
    await stopServer(server);
  }
}

async function verifyTestOnlyWildcardAllowlist() {
  const server = await startServer("wildcard", {
    HUMI_NATIVE_SHELL_ENABLED: "1",
    HUMI_NATIVE_SHELL_HOUSEHOLDS: "*",
  });
  try {
    const session = await login(server.baseUrl, "bootstrap-wildcard-first-use");
    const bootstrap = await request(`${server.baseUrl}/bootstrap`, { token: session.accessToken });
    assert.equal(bootstrap.activeHouseholdId, "");
    assert.equal(bootstrap.capabilities.nativeShellEnabled, true, "test-only wildcard includes first-use users");
  } finally {
    await stopServer(server);
  }
}

async function startServer(name, overrides = {}) {
  const dataFile = overrides.HUMI_API_DATA_FILE || join(directory, `${name}.json`);
  Object.assign(process.env, {
    HUMI_API_DATA_FILE: dataFile,
    HUMI_SESSION_SECRET: "humi-native-bootstrap-contract-secret",
    HUMI_WECHAT_MOCK: "1",
    HUMI_MEAL_EXECUTION_ENABLED: "0",
    HUMI_MEAL_EXECUTION_HOUSEHOLDS: "",
    ...overrides,
  });
  const { createHumiApiServer } = await import(`../api/server.js?native-bootstrap-contract=${serverImportSequence++}`);
  const httpServer = createHumiApiServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  return {
    httpServer,
    baseUrl: `http://127.0.0.1:${httpServer.address().port}`,
  };
}

async function stopServer(server) {
  await new Promise((resolve) => server.httpServer.close(resolve));
}

async function login(baseUrl, code) {
  return request(`${baseUrl}/auth/wechat/login`, { method: "POST", body: { code } });
}

async function request(url, options = {}) {
  const response = await rawRequest(url, options);
  if (!response.ok) {
    const error = new Error(response.data.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = response.data.error;
    throw error;
  }
  return response.data;
}

async function rawRequest(url, { method = "GET", token = "", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    data: await response.json().catch(() => ({})),
  };
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}
