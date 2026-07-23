import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const utilDirectory = path.join(root, "miniprogram/utils");
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
  assert.equal(telemetry.trackEvent("not_declared", { householdId: "h1" }), null);
  for (let index = 0; index < 24; index += 1) telemetry.trackEvent("native_boot_started", { page: "boot" });
  const batches = [];
  await telemetry.flushTelemetry(async (batch) => batches.push(batch));
  assert.equal(batches[0].length, 20, "telemetry deliveries must contain at most 20 events");
  assert.deepEqual(batches.map((batch) => batch.length), [20, 5], "flush must drain remaining events in bounded batches");
  const span = telemetry.startSpan("bootstrap", { householdId: "h1" });
  span.end("completed", { durationMs: 4, errorMessage: "ignored" });
  assert.deepEqual(JSON.parse(JSON.stringify(telemetry.readPendingTelemetry().at(-1).fields)), { householdId: "h1", durationMs: 4 });
}

{
  const { store } = createRuntime();
  const snapshots = [];
  const unsubscribe = store.appStore.subscribe((state) => snapshots.push(state.currentHouseholdId));
  store.appStore.setState({ currentHouseholdId: "h1" });
  unsubscribe();
  assert.deepEqual(snapshots, ["h1"]);
}

console.log("Native offline, cache, telemetry, and store foundation contract passed.");
