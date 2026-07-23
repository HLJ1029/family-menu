import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const utilDirectory = path.join(root, "miniprogram/utils");
const appSource = fs.readFileSync(path.join(root, "miniprogram/app.js"), "utf8");
for (const name of ["errors.js", "cache.js", "telemetry.js", "offline-queue.js", "store.js"]) {
  const file = path.join(utilDirectory, name);
  if (!fs.existsSync(file)) throw new Error(`Cannot find module '${file}'`);
}

function createRuntime() {
  const storage = new Map();
  const wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: (key) => storage.delete(key)
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
  return {
    queue: load(path.join(utilDirectory, "offline-queue.js")),
    cache: load(path.join(utilDirectory, "cache.js")),
    telemetry: load(path.join(utilDirectory, "telemetry.js")),
    store: load(path.join(utilDirectory, "store.js")),
    storage
  };
}

function createAppRuntime(flush) {
  let definition;
  const events = [];
  vm.runInNewContext(appSource, {
    App: (value) => {
      definition = value;
    },
    require: (specifier) => {
      if (specifier === "./utils/session") return { restoreSession: () => null, saveSession: () => {}, clearSession: () => {} };
      if (specifier === "./utils/offline-queue") return { flushMutationQueue: flush };
      if (specifier === "./utils/config") return { HUMI_NATIVE_SHELL_CANDIDATE: true };
      if (specifier === "./utils/telemetry") return { trackEvent: (name, fields) => events.push({ name, fields }) };
      throw new Error(`Unexpected app dependency: ${specifier}`);
    },
    Date,
    Promise
  });
  return { app: { ...definition, globalData: { ...definition.globalData } }, events };
}

async function nextTask() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

{
  const { queue } = createRuntime();
  assert.throws(() => queue.enqueueMutation({ type: "household_settings_update" }), /offline_action_not_allowed/);
  assert.throws(() => queue.enqueueMutation({
    id: "unsafe-event",
    type: "product_event",
    householdId: "h1",
    createdAt: 1,
    event: "bootstrap_completed",
    fields: { nickname: "private" }
  }), /offline_product_event_unsafe/);
  queue.enqueueMutation({ id: "a", type: "meal_progress", householdId: "h1", mealRunId: "r1", createdAt: 1 });
  queue.enqueueMutation({ id: "b", type: "meal_complete", householdId: "h1", mealRunId: "r1", createdAt: 2 });
  assert.deepEqual(Array.from(queue.readQueue(), (item) => item.id), ["a", "b"]);
  queue.enqueueMutation({ id: "c", type: "meal_feedback", householdId: "h0", mealRunId: "r2", createdAt: 3 });
  assert.deepEqual(Array.from(queue.readQueue(), (item) => item.id), ["c", "a", "b"], "queue replay order is household, meal run, then creation order");
}

{
  const { queue } = createRuntime();
  for (let index = 0; index < 100; index += 1) {
    queue.enqueueMutation({ id: `a-${index}`, type: "meal_progress", householdId: "h", mealRunId: "r", createdAt: index });
  }
  assert.throws(() => queue.enqueueMutation({ id: "one-too-many", type: "meal_progress", householdId: "h", mealRunId: "r", createdAt: 101 }), /offline_queue_full/);
  assert.throws(() => queue.enqueueMutation({ id: "too-large", type: "meal_progress", householdId: "h2", mealRunId: "r2", createdAt: 1, payload: "x".repeat(256 * 1024) }), /offline_queue_too_large/);
}

{
  const { queue } = createRuntime();
  assert.throws(() => queue.enqueueMutation({
    id: "utf8-limit",
    type: "meal_progress",
    householdId: "h1",
    mealRunId: "r1",
    createdAt: 1,
    payload: "😀".repeat(65_550)
  }), /offline_queue_too_large/, "queue capacity is measured in UTF-8 bytes, not JavaScript string length");
}

{
  const { queue } = createRuntime();
  assert.throws(() => queue.enqueueMutation({
    id: "utf8-chinese-limit",
    type: "meal_progress",
    householdId: "h1",
    mealRunId: "r1",
    createdAt: 1,
    payload: "汉".repeat(87_400)
  }), /offline_queue_too_large/, "Chinese payloads use their UTF-8 byte size at the queue boundary");
}

{
  const { queue } = createRuntime();
  queue.enqueueMutation({ id: "a", type: "meal_progress", householdId: "h", mealRunId: "r", createdAt: 1 });
  queue.enqueueMutation({ id: "b", type: "meal_complete", householdId: "h", mealRunId: "r", createdAt: 2 });
  const replayed = [];
  queue.setMutationReplayer(async (action) => {
    replayed.push(action.id);
    if (action.id === "a") {
      const error = new Error("conflict");
      error.status = 409;
      error.latestEnvelope = { stateVersion: "v2" };
      throw error;
    }
  });
  const result = await queue.flushMutationQueue();
  assert.equal(result.status, "conflict");
  assert.equal(result.action.id, "a");
  assert.deepEqual(JSON.parse(JSON.stringify(result.envelope)), { stateVersion: "v2" });
  assert.deepEqual(replayed, ["a"], "a conflict must stop ordered replay");
}

{
  const { queue } = createRuntime();
  queue.enqueueMutation({ id: "dead", type: "meal_abandon", householdId: "h", mealRunId: "r", createdAt: 1 });
  queue.setMutationReplayer(async () => {
    const error = new Error("not allowed");
    error.retryable = false;
    error.code = "forbidden";
    throw error;
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await queue.flushMutationQueue())), { status: "flushed" });
  assert.deepEqual(Array.from(queue.readQueue()), []);
  assert.deepEqual(JSON.parse(JSON.stringify(queue.readDeadLetters())), [{ id: "dead", code: "forbidden" }]);
}

{
  const { cache, storage } = createRuntime();
  cache.writeHouseholdCache("h1", { stateVersion: "v1", state: { dinner: "rice" } });
  assert.equal(cache.readHouseholdCache("h1").stateVersion, "v1");
  const key = cache.householdCacheKey("h1");
  storage.set(key, { ...storage.get(key), schemaVersion: 999 });
  assert.equal(cache.readHouseholdCache("h1"), null, "schema mismatches are never read");
  cache.writeHouseholdCache("h1", { stateVersion: "v1" });
  storage.set(key, { ...storage.get(key), savedAt: Date.now() - (7 * 24 * 60 * 60 * 1000) - 1 });
  assert.equal(cache.readHouseholdCache("h1"), null, "cache older than seven days is never read");
}

{
  const { telemetry } = createRuntime();
  telemetry.trackEvent("bootstrap_completed", {
    householdId: "h1",
    durationMs: 12,
    nickname: "private",
    token: "secret",
    url: "https://example.test/path?secret=1",
    note: "free text",
    errorMessage: "arbitrary error"
  });
  const event = telemetry.readPendingTelemetry()[0];
  assert.deepEqual(JSON.parse(JSON.stringify(event.fields)), { householdId: "h1", durationMs: 12 });
  telemetry.trackEvent("bootstrap_failed", {
    householdId: "this is arbitrary free text, not an id",
    sessionId: "session details from a user message",
    errorCode: "the server said something sensitive",
    stage: "not-a-declared-stage",
    result: "not-a-declared-result"
  });
  assert.deepEqual(JSON.parse(JSON.stringify(telemetry.readPendingTelemetry().at(-1).fields)), {}, "free text must not masquerade as IDs, error codes, stages, or results");
  assert.equal(telemetry.trackEvent("not_declared", { householdId: "h1" }), null);
  for (let index = 0; index < 24; index += 1) telemetry.trackEvent("native_boot_started", { page: "boot" });
  const batches = [];
  await telemetry.flushTelemetry(async (batch) => batches.push(batch));
  assert.equal(batches[0].length, 20, "telemetry deliveries must contain at most 20 events");
  assert.deepEqual(batches.map((batch) => batch.length), [20, 6], "flush must drain remaining events in bounded batches");
  const span = telemetry.startSpan("bootstrap", { householdId: "h1" });
  span.end("completed", { durationMs: 4, errorMessage: "ignored" });
  assert.deepEqual(JSON.parse(JSON.stringify(telemetry.readPendingTelemetry().at(-1).fields)), {
    householdId: "h1",
    stage: "completed",
    result: "completed",
    durationMs: 4,
    errorCode: "none"
  });
  const offlineSpan = telemetry.startSpan("bootstrap", { householdId: "h1" });
  const offlineEvent = offlineSpan.end("offline", { durationMs: 5, errorCode: "network_error" });
  assert.equal(offlineEvent.name, "bootstrap_failed", "offline must not be represented as completed");
  assert.deepEqual(JSON.parse(JSON.stringify(offlineEvent.fields)), {
    householdId: "h1",
    stage: "offline",
    result: "offline",
    durationMs: 5,
    errorCode: "network_error"
  });
}

{
  const { store } = createRuntime();
  const snapshots = [];
  const unsubscribe = store.appStore.subscribe((state) => snapshots.push(state.currentHouseholdId));
  store.appStore.setState({ currentHouseholdId: "h1" });
  unsubscribe();
  assert.deepEqual(snapshots, ["h1"]);
}

for (const [outcome, expectedName, expectedResult, expectedCode] of [
  [{ status: "conflict" }, "native_boot_failed", "conflict", "queue_conflict"],
  [{ status: "retry" }, "native_boot_failed", "retry", "queue_retry"]
]) {
  const { app, events } = createAppRuntime(() => Promise.resolve(outcome));
  assert.doesNotThrow(() => app.onShow(), "foreground recovery must never block the app lifecycle");
  await nextTask();
  assert.equal(events.length, 1);
  assert.equal(events[0].name, expectedName);
  assert.equal(events[0].fields.stage, "queue_flush");
  assert.equal(events[0].fields.result, expectedResult);
  assert.equal(events[0].fields.errorCode, expectedCode);
  assert.equal(typeof events[0].fields.durationMs, "number");
}

{
  const { app, events } = createAppRuntime(() => Promise.reject(Object.assign(new Error("sensitive server detail"), { code: "untrusted_message" })));
  assert.doesNotThrow(() => app.onShow(), "a rejected foreground flush must never block the app lifecycle");
  await nextTask();
  assert.equal(events.length, 1);
  assert.equal(events[0].name, "native_boot_failed");
  assert.equal(events[0].fields.page, "boot");
  assert.equal(events[0].fields.stage, "queue_flush");
  assert.equal(events[0].fields.result, "failed");
  assert.equal(events[0].fields.errorCode, "queue_flush_failed");
  assert.equal(typeof events[0].fields.durationMs, "number");
}

console.log("Native offline, cache, telemetry, and store foundation contract passed.");
