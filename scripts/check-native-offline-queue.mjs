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

function createRuntime({ userId = "user-a", requestHumi } = {}) {
  const storage = new Map();
  if (userId) {
    storage.set("humi:native-session:v1", {
      accessToken: `token-${userId}`,
      expiresAt: Date.now() + 60_000,
      user: { id: userId }
    });
  }
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
      require: (specifier) => (
        specifier === "./request" && requestHumi
          ? { requestHumi }
          : load(path.resolve(path.dirname(resolved), `${specifier}.js`))
      ),
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
    session: load(path.join(utilDirectory, "session.js")),
    storage
  };
}

function createAppRuntime(flush, restoredSession = null) {
  let definition;
  const events = [];
  const storeState = {
    session: { user: { id: "stale-user" } },
    bootstrap: { user: { id: "stale-user" } },
    currentHouseholdId: "stale-household",
    offlineStatus: "retry"
  };
  const appStore = {
    replaceSession(session) {
      const previousUserId = storeState.session?.user?.id || "";
      const nextUserId = session?.user?.id || "";
      storeState.session = session || null;
      if (previousUserId !== nextUserId) {
        storeState.bootstrap = null;
        storeState.currentHouseholdId = "";
        storeState.offlineStatus = "idle";
      }
      return { ...storeState };
    },
    replaceBootstrap(envelope) {
      storeState.bootstrap = envelope;
      storeState.currentHouseholdId = envelope?.activeHouseholdId || "";
      return { ...storeState };
    },
    setState(patch) {
      Object.assign(storeState, patch || {});
      return { ...storeState };
    },
  };
  vm.runInNewContext(appSource, {
    App: (value) => {
      definition = value;
    },
    require: (specifier) => {
      if (specifier === "./utils/session") return { restoreSession: () => restoredSession, saveSession: () => {}, clearSession: () => {} };
      if (specifier === "./utils/offline-queue") return { flushMutationQueue: flush };
      if (specifier === "./utils/config") return { HUMI_NATIVE_SHELL_CANDIDATE: true };
      if (specifier === "./utils/telemetry") {
        return {
          trackEvent: (name, fields) => events.push({ name, fields }),
          scheduleTelemetryFlush: () => {},
        };
      }
      if (specifier === "./utils/store") return { appStore };
      throw new Error(`Unexpected app dependency: ${specifier}`);
    },
    Date,
    Promise
  });
  return { app: { ...definition, globalData: { ...definition.globalData } }, events, storeState };
}

async function nextTask() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

{
  const envelopes = [];
  let attempts = 0;
  const { queue } = createRuntime({
    requestHumi: async () => {
      attempts += 1;
      const error = new Error("conflict");
      error.status = 409;
      error.code = "state_version_conflict";
      error.latestEnvelope = {
        schemaVersion: 1,
        stateVersion: "state-v2",
        activeHouseholdId: "h1",
        householdState: { checkedItems: { "ingredient:egg": true } },
        user: { id: "user-a" },
      };
      throw error;
    },
  });
  queue.enqueueMutation({
    id: "already-satisfied", type: "grocery_item_check", householdId: "h1",
    createdAt: 1, stateVersion: "state-v1", data: { itemId: "ingredient:egg", checked: true },
  });
  const result = await queue.flushMutationQueue({ onEnvelope: (envelope) => envelopes.push(envelope) });
  assert.equal(result.status, "flushed");
  assert.equal(attempts, 1);
  assert.deepEqual(Array.from(queue.readQueue()), []);
  assert.equal(envelopes[0].stateVersion, "state-v2");
}

{
  const versions = [];
  const { queue } = createRuntime({
    requestHumi: async (options) => {
      versions.push(options.stateVersion);
      if (versions.length === 1) {
        const error = new Error("conflict");
        error.status = 409;
        error.code = "state_version_conflict";
        error.latestEnvelope = {
          schemaVersion: 1,
          stateVersion: "state-v2",
          activeHouseholdId: "h1",
          householdState: { checkedItems: { "ingredient:egg": false } },
          user: { id: "user-a" },
        };
        throw error;
      }
      return {
        schemaVersion: 1,
        stateVersion: "state-v3",
        activeHouseholdId: "h1",
        householdState: { checkedItems: { "ingredient:egg": true } },
        user: { id: "user-a" },
      };
    },
  });
  queue.enqueueMutation({
    id: "retry-once", type: "grocery_item_check", householdId: "h1",
    createdAt: 1, stateVersion: "state-v1", data: { itemId: "ingredient:egg", checked: true },
  });
  assert.equal((await queue.flushMutationQueue()).status, "flushed");
  assert.deepEqual(versions, ["state-v1", "state-v2"]);
  assert.deepEqual(Array.from(queue.readQueue()), []);
}

{
  let attempts = 0;
  const { queue } = createRuntime({
    requestHumi: async () => {
      attempts += 1;
      const error = new Error("conflict");
      error.status = 409;
      error.code = "state_version_conflict";
      error.latestEnvelope = {
        schemaVersion: 1,
        stateVersion: `state-v${attempts + 1}`,
        activeHouseholdId: "h1",
        householdState: { checkedItems: { "ingredient:egg": false } },
        user: { id: "user-a" },
      };
      throw error;
    },
  });
  queue.enqueueMutation({
    id: "conflict-exhausted", type: "grocery_item_check", householdId: "h1",
    createdAt: 1, stateVersion: "state-v1", data: { itemId: "ingredient:egg", checked: true },
  });
  const result = await queue.flushMutationQueue();
  assert.equal(result.status, "conflict");
  assert.equal(result.retryExhausted, true);
  assert.equal(attempts, 2);
  assert.deepEqual(Array.from(queue.readQueue()), []);
  assert.deepEqual(JSON.parse(JSON.stringify(queue.readDeadLetters())), [{
    id: "conflict-exhausted",
    code: "state_version_conflict",
  }]);
}

{
  const envelope = {
    schemaVersion: 1,
    stateVersion: "state-v2",
    activeHouseholdId: "h1",
    user: { id: "user-a" },
  };
  const restored = { accessToken: "restored", expiresAt: Date.now() + 60_000, user: { id: "user-a" } };
  const { app, storeState } = createAppRuntime(async (options) => {
    options.onEnvelope(envelope);
    return { status: "conflict", envelope, retryExhausted: true };
  }, restored);
  app.onLaunch();
  app.onShow();
  await nextTask();
  assert.equal(storeState.bootstrap.stateVersion, "state-v2");
  assert.equal(storeState.offlineStatus, "conflict");
}

{
  const { queue } = createRuntime();
  assert.equal(
    queue.ALLOWED_ACTIONS.has("product_event"),
    false,
    "telemetry owns its durable retry queue and must not be duplicated into the meal mutation queue",
  );
}

{
  const { queue, storage } = createRuntime();
  assert.throws(() => queue.enqueueMutation({ type: "household_settings_update" }), /offline_action_not_allowed/);
  assert.throws(() => queue.enqueueMutation({
    id: "unsafe-event",
    type: "product_event",
    householdId: "h1",
    createdAt: 1,
    event: "bootstrap_completed",
    fields: { nickname: "private" }
  }), /offline_action_not_allowed/);
  const storageSizeBeforeBypass = storage.size;
  assert.throws(() => queue.enqueueMutation({
    id: "unsafe-data-bypass",
    type: "product_event",
    householdId: "h1",
    createdAt: 2,
    event: "bootstrap_completed",
    fields: { householdId: "h1", durationMs: 12 },
    data: {
      nickname: "private nickname",
      token: "private-token",
      note: "private note"
    },
    path: "/arbitrary?token=private-token",
    method: "DELETE",
    mealRunId: "must-not-be-a-product-event-field"
  }), /offline_action_not_allowed/, "product events must not enter the meal mutation queue");
  assert.equal(storage.size, storageSizeBeforeBypass, "an unsafe product event must not write any queue storage");
  queue.enqueueMutation({ id: "a", type: "meal_progress", householdId: "h1", mealRunId: "r1", createdAt: 1, data: { currentStepId: "step-1", timelineVersion: 1 } });
  queue.enqueueMutation({ id: "b", type: "meal_complete", householdId: "h1", mealRunId: "r1", createdAt: 2, data: { timelineVersion: 1 } });
  assert.deepEqual(Array.from(queue.readQueue(), (item) => item.id), ["a", "b"]);
  queue.enqueueMutation({ id: "c", type: "meal_feedback", householdId: "h0", mealRunId: "r2", createdAt: 3, data: { value: "want_again" } });
  assert.deepEqual(Array.from(queue.readQueue(), (item) => item.id), ["c", "a", "b"], "queue replay order is household, meal run, then creation order");
}

{
  const schemaCases = [
    {
      action: { id: "progress-schema", type: "meal_progress", householdId: "h", mealRunId: "r", createdAt: 1, data: { currentStepId: "step-1", timelineVersion: 1 } },
      forbidden: { event: "bootstrap_completed" }
    },
    {
      action: { id: "complete-schema", type: "meal_complete", householdId: "h", mealRunId: "r", createdAt: 1, data: { timelineVersion: 1 } },
      forbidden: { data: { timelineVersion: 1, note: "must-not-persist" } }
    },
    {
      action: { id: "feedback-schema", type: "meal_feedback", householdId: "h", mealRunId: "r", createdAt: 1, data: { value: "want_again" } },
      forbidden: { path: "/arbitrary" }
    },
    {
      action: { id: "abandon-schema", type: "meal_abandon", householdId: "h", mealRunId: "r", createdAt: 1, data: { reason: "plans_changed" } },
      forbidden: { method: "DELETE" }
    },
    {
      action: { id: "grocery-schema", type: "grocery_item_check", householdId: "h", createdAt: 1, stateVersion: "state-v1", data: { itemId: "ingredient:egg", checked: true } },
      forbidden: { mealRunId: "r" }
    }
  ];
  for (const { action, forbidden } of schemaCases) {
    const { queue } = createRuntime();
    assert.doesNotThrow(() => queue.enqueueMutation(action), `${action.type} must retain its necessary fields`);
    assert.throws(
      () => queue.enqueueMutation({ ...action, id: `${action.id}-forbidden`, ...forbidden }),
      /offline_action_invalid/,
      `${action.type} must reject fields outside its type-specific schema`,
    );
  }
}

{
  const { queue } = createRuntime();
  assert.doesNotThrow(() => queue.enqueueMutation({
    id: "actual-step-timer",
    type: "meal_progress",
    householdId: "h",
    mealRunId: "r",
    createdAt: 1,
    data: {
      currentStepId: "step-1",
      timelineVersion: 2,
      timer: {
        stepId: "step-1",
        startedAt: "2026-07-23T10:03:00.000Z",
        endsAt: "2026-07-23T10:08:00.000Z",
      },
    },
  }));
  assert.throws(() => queue.enqueueMutation({
    id: "invalid-timeline-version",
    type: "meal_progress",
    householdId: "h",
    mealRunId: "r",
    createdAt: 1,
    data: { currentStepId: "step-1", timelineVersion: 0 },
  }), /offline_action_invalid/);
  assert.throws(() => queue.enqueueMutation({
    id: "missing-timeline-version",
    type: "meal_progress",
    householdId: "h",
    mealRunId: "r",
    createdAt: 1,
    data: { currentStepId: "step-1" },
  }), /offline_action_invalid/);
  assert.throws(() => queue.enqueueMutation({
    id: "actual-step-timer-extra",
    type: "meal_progress",
    householdId: "h",
    mealRunId: "r",
    createdAt: 1,
    data: {
      currentStepId: "step-1",
      timelineVersion: 1,
      timer: {
        stepId: "step-1",
        startedAt: "2026-07-23T10:03:00.000Z",
        endsAt: "2026-07-23T10:08:00.000Z",
        note: "must-not-persist",
      },
    },
  }), /offline_action_invalid/);
  assert.doesNotThrow(() => queue.enqueueMutation({
    id: "canonical-timer",
    type: "meal_progress",
    householdId: "h",
    mealRunId: "r",
    createdAt: 1,
    data: { currentStepId: "step-1", timelineVersion: 1, timerEndsAt: "2026-07-23T10:03:00.000Z" },
  }));
  for (const timerEndsAt of ["1", "2026-07-23", "2026-07-23T10:03:00Z", "2026-07-23T10:03:00.000+00:00"]) {
    assert.throws(() => queue.enqueueMutation({
      id: `non-canonical-${timerEndsAt}`,
      type: "meal_progress",
      householdId: "h",
      mealRunId: "r",
      createdAt: 2,
      data: { currentStepId: "step-1", timelineVersion: 1, timerEndsAt },
    }), /offline_action_invalid/, `timerEndsAt must reject non-canonical input ${timerEndsAt}`);
  }
}

{
  const { queue } = createRuntime();
  assert.throws(() => queue.enqueueMutation({
    id: "safe-product-event",
    type: "product_event",
    householdId: "h1",
    createdAt: 1,
    event: "plan_presented",
    fields: {
      mealRunId: "run-1",
      recommendationId: "recommendation-1",
      effortTier: "quick_15"
    }
  }), /offline_action_not_allowed/);
}

{
  const { queue } = createRuntime({ userId: "" });
  assert.throws(
    () => queue.enqueueMutation({ id: "anonymous", type: "meal_progress", householdId: "h1", mealRunId: "r1", createdAt: 1 }),
    /offline_session_required/,
    "offline mutations require a trusted authenticated native session",
  );
}

{
  const { queue } = createRuntime();
  const stored = queue.enqueueMutation({
    id: "owned",
    type: "meal_progress",
    householdId: "h1",
    mealRunId: "r1",
    createdAt: 1,
    data: { currentStepId: "step-2", timelineVersion: 1 },
    ownerUserId: "caller-spoof"
  });
  assert.equal(stored.ownerUserId, "user-a", "the queue owner must come from the trusted native session");
  assert.deepEqual(
    JSON.parse(JSON.stringify(stored)),
    {
      id: "owned",
      type: "meal_progress",
      householdId: "h1",
      mealRunId: "r1",
      createdAt: 1,
      data: { currentStepId: "step-2", timelineVersion: 1 },
      ownerUserId: "user-a"
    },
    "persisted actions must use an explicit top-level projection",
  );
  assert.throws(
    () => queue.enqueueMutation({
      id: "extra",
      type: "meal_progress",
      householdId: "h1",
      mealRunId: "r1",
      createdAt: 2,
      data: { currentStepId: "step-3", timelineVersion: 1 },
      privateTopLevel: "must-not-persist"
    }),
    /offline_action_invalid/,
    "arbitrary top-level fields must be rejected rather than persisted",
  );
}

{
  const { queue } = createRuntime();
  for (let index = 0; index < 100; index += 1) {
    queue.enqueueMutation({ id: `a-${index}`, type: "meal_progress", householdId: "h", mealRunId: "r", createdAt: index, data: { currentStepId: `step-${index}`, timelineVersion: 1 } });
  }
  assert.throws(() => queue.enqueueMutation({ id: "one-too-many", type: "meal_progress", householdId: "h", mealRunId: "r", createdAt: 101, data: { currentStepId: "step-101", timelineVersion: 1 } }), /offline_queue_full/);
  assert.throws(() => queue.enqueueMutation({ id: "unsafe-large", type: "meal_progress", householdId: "h2", mealRunId: "r2", createdAt: 1, data: { currentStepId: "step-1", timelineVersion: 1, message: "x".repeat(256 * 1024) } }), /offline_action_invalid/);
}

{
  const { queue } = createRuntime();
  assert(queue.utf8ByteLength("😀".repeat(65_550)) > 256 * 1024, "queue capacity is measured in UTF-8 bytes, not JavaScript string length");
}

{
  const { queue } = createRuntime();
  assert(queue.utf8ByteLength("汉".repeat(87_400)) > 256 * 1024, "Chinese payloads use their UTF-8 byte size at the queue boundary");
}

{
  const runtime = createRuntime();
  const { queue, session } = runtime;
  queue.enqueueMutation({ id: "account-a", type: "meal_complete", householdId: "h", mealRunId: "r", createdAt: 1, data: { timelineVersion: 1 } });
  const replayed = [];
  queue.setMutationReplayer(async (action) => replayed.push(action.id));
  session.saveSession({ accessToken: "token-user-b", expiresAt: Date.now() + 60_000, user: { id: "user-b" } });
  const { app } = createAppRuntime(() => queue.flushMutationQueue(), session.getSession());
  app.onShow();
  await nextTask();
  assert.deepEqual(replayed, [], "account B foreground recovery must not replay account A's queue");
  assert.deepEqual(Array.from(queue.readQueue()), [], "account B must see only its own empty queue");
  session.saveSession({ accessToken: "token-user-a", expiresAt: Date.now() + 60_000, user: { id: "user-a" } });
  assert.deepEqual(Array.from(queue.readQueue(), (item) => item.id), ["account-a"], "account A's queue must remain recoverable");
  assert.equal((await queue.flushMutationQueue()).status, "flushed");
  assert.deepEqual(replayed, ["account-a"], "account A may replay its own queue after returning");
}

{
  const { queue, session } = createRuntime();
  queue.enqueueMutation({ id: "switch-owner", type: "meal_progress", householdId: "h", mealRunId: "r", createdAt: 1, data: { currentStepId: "step-1", timelineVersion: 1 } });
  queue.setMutationReplayer(async () => {
    session.saveSession({ accessToken: "token-user-b", expiresAt: Date.now() + 60_000, user: { id: "user-b" } });
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(await queue.flushMutationQueue())),
    { status: "skipped", reason: "ownership_changed" },
    "a session switch during replay must return a stable ownership outcome",
  );
  session.saveSession({ accessToken: "token-user-a", expiresAt: Date.now() + 60_000, user: { id: "user-a" } });
  assert.deepEqual(Array.from(queue.readQueue(), (item) => item.id), ["switch-owner"], "an ownership switch must not delete account A's action");
}

{
  const requests = [];
  const { queue } = createRuntime({
    requestHumi: async (options) => {
      requests.push(structuredClone(options));
      return { stateVersion: "state-v2" };
    },
  });
  queue.enqueueMutation({
    id: "native-grocery-check",
    type: "grocery_item_check",
    householdId: "household-1",
    createdAt: 1,
    stateVersion: "state-v1",
    data: { itemId: "ingredient:egg", checked: true },
  });
  assert.equal((await queue.flushMutationQueue()).status, "flushed");
  assert.deepEqual(requests, [{
    path: "/state",
    method: "PUT",
    data: {
      householdId: "household-1",
      patch: { checkedItems: { "ingredient:egg": true } },
    },
    idempotencyKey: "native-grocery-check",
    stateVersion: "state-v1",
    expectedUserId: "user-a",
  }], "native grocery checks replay only through the audited narrow state patch");
}

{
  const { queue } = createRuntime();
  assert.throws(() => queue.enqueueMutation({
    id: "offline-menu-replacement",
    type: "meal_plan_replace",
    householdId: "household-1",
    createdAt: 1,
    data: { mealPlan: {} },
  }), /offline_action_not_allowed/, "menu replacement must never enter the offline queue");
  assert.throws(() => queue.enqueueMutation({
    id: "offline-grocery-regeneration",
    type: "grocery_regenerate",
    householdId: "household-1",
    createdAt: 2,
    data: {},
  }), /offline_action_not_allowed/, "grocery regeneration must never enter the offline queue");
}

{
  const { queue, storage } = createRuntime();
  queue.enqueueMutation({ id: "tampered-owner", type: "meal_progress", householdId: "h", mealRunId: "r", createdAt: 1, data: { currentStepId: "step-1", timelineVersion: 1 } });
  const queueStorageKey = Array.from(storage.keys()).find((key) => key.startsWith("humi:offline-queue:v1:"));
  storage.set(queueStorageKey, [{ ...storage.get(queueStorageKey)[0], ownerUserId: "user-b" }]);
  let replayCount = 0;
  queue.setMutationReplayer(async () => { replayCount += 1; });
  assert.deepEqual(
    JSON.parse(JSON.stringify(await queue.flushMutationQueue())),
    { status: "skipped", reason: "ownership_mismatch" },
    "a persisted action with a mismatched owner must never replay",
  );
  assert.equal(replayCount, 0);
  assert.deepEqual(Array.from(queue.readQueue(), (item) => item.id), ["tampered-owner"], "owner mismatch must not delete the queued action");
}

{
  const { queue, session } = createRuntime();
  queue.enqueueMutation({ id: "a", type: "meal_progress", householdId: "h", mealRunId: "r", createdAt: 1, data: { currentStepId: "step-1", timelineVersion: 1 } });
  queue.enqueueMutation({ id: "b", type: "meal_complete", householdId: "h", mealRunId: "r", createdAt: 2, data: { timelineVersion: 1 } });
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
  queue.enqueueMutation({ id: "stale-progress-1", type: "meal_progress", householdId: "h", mealRunId: "r", createdAt: 1, data: { currentStepId: "step-1", timelineVersion: 1 } });
  queue.enqueueMutation({ id: "stale-progress-2", type: "meal_progress", householdId: "h", mealRunId: "r", createdAt: 2, data: { currentStepId: "step-2", timelineVersion: 1 } });
  queue.enqueueMutation({ id: "stale-complete", type: "meal_complete", householdId: "h", mealRunId: "r", createdAt: 3, data: { timelineVersion: 1 } });
  queue.enqueueMutation({ id: "stale-feedback", type: "meal_feedback", householdId: "h", mealRunId: "r", createdAt: 4, data: { value: "want_again" } });
  queue.enqueueMutation({ id: "safe-abandon", type: "meal_abandon", householdId: "h", mealRunId: "r", createdAt: 5, data: { reason: "plans_changed" } });
  queue.enqueueMutation({ id: "other-run", type: "meal_progress", householdId: "h", mealRunId: "r2", createdAt: 6, data: { currentStepId: "step-1", timelineVersion: 1 } });
  const replayed = [];
  queue.setMutationReplayer(async (action) => {
    replayed.push(action.id);
    const error = new Error("timeline changed");
    error.status = 409;
    error.code = "meal_timeline_version_conflict";
    throw error;
  });
  const result = await queue.flushMutationQueue();
  assert.equal(result.status, "timeline_conflict");
  assert.equal(result.action.id, "stale-progress-1");
  assert.deepEqual(
    Array.from(result.discardedActionIds).sort(),
    ["stale-complete", "stale-feedback", "stale-progress-1", "stale-progress-2"],
    "an obsolete epoch discards only causally dependent progress, completion, and feedback",
  );
  assert.deepEqual(
    Array.from(queue.readQueue(), (item) => item.id),
    ["safe-abandon", "other-run"],
    "safe abandon and unrelated meal actions survive epoch recovery",
  );
  assert.deepEqual(replayed, ["stale-progress-1"], "epoch recovery stops before replaying dependent actions");
}

{
  const { queue, storage } = createRuntime();
  queue.enqueueMutation({ id: "legacy-progress", type: "meal_progress", householdId: "h", mealRunId: "legacy-run", createdAt: 1, data: { currentStepId: "step-1", timelineVersion: 1 } });
  queue.enqueueMutation({ id: "legacy-complete", type: "meal_complete", householdId: "h", mealRunId: "legacy-run", createdAt: 2, data: { timelineVersion: 1 } });
  queue.enqueueMutation({ id: "legacy-feedback", type: "meal_feedback", householdId: "h", mealRunId: "legacy-run", createdAt: 3, data: { value: "want_again" } });
  const queueStorageKey = Array.from(storage.keys()).find((key) => key.startsWith("humi:offline-queue:v1:"));
  storage.set(queueStorageKey, storage.get(queueStorageKey).map((action) => {
    if (action.id === "legacy-progress") {
      return { ...action, data: { currentStepId: action.data.currentStepId } };
    }
    if (action.id === "legacy-complete") {
      const { data: _data, ...legacyAction } = action;
      return legacyAction;
    }
    return action;
  }));
  queue.setMutationReplayer(async () => {
    const error = new Error("legacy timeline changed");
    error.status = 409;
    error.code = "meal_timeline_version_conflict";
    throw error;
  });
  const result = await queue.flushMutationQueue();
  assert.equal(result.status, "timeline_conflict");
  assert.deepEqual(
    Array.from(result.discardedActionIds).sort(),
    ["legacy-complete", "legacy-feedback", "legacy-progress"],
    "an upgraded client explicitly clears legacy epoch work with no timelineVersion",
  );
  assert.deepEqual(Array.from(queue.readQueue()), [], "legacy persisted actions cannot block every restart");
}

{
  const { queue, session } = createRuntime();
  queue.enqueueMutation({ id: "dead", type: "meal_abandon", householdId: "h", mealRunId: "r", createdAt: 1, data: { reason: "plans_changed" } });
  queue.setMutationReplayer(async () => {
    const error = new Error("not allowed");
    error.retryable = false;
    error.code = "forbidden";
    throw error;
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await queue.flushMutationQueue())), { status: "flushed" });
  assert.deepEqual(Array.from(queue.readQueue()), []);
  assert.deepEqual(JSON.parse(JSON.stringify(queue.readDeadLetters())), [{ id: "dead", code: "forbidden" }]);
  session.saveSession({ accessToken: "token-user-b", expiresAt: Date.now() + 60_000, user: { id: "user-b" } });
  assert.deepEqual(Array.from(queue.readDeadLetters()), [], "dead letters are namespaced to the authenticated account");
  session.saveSession({ accessToken: "token-user-a", expiresAt: Date.now() + 60_000, user: { id: "user-a" } });
  assert.deepEqual(JSON.parse(JSON.stringify(queue.readDeadLetters())), [{ id: "dead", code: "forbidden" }], "account A's dead letters remain available when A returns");
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
  assert.deepEqual(JSON.parse(JSON.stringify(event.fields)), { householdId: "h1", durationMs: 12, packageVersion: "1.1.72" });
  telemetry.trackEvent("bootstrap_failed", {
    householdId: "this is arbitrary free text, not an id",
    sessionId: "session details from a user message",
    errorCode: "the server said something sensitive",
    stage: "not-a-declared-stage",
    result: "not-a-declared-result"
  });
  assert.deepEqual(JSON.parse(JSON.stringify(telemetry.readPendingTelemetry().at(-1).fields)), { packageVersion: "1.1.72" }, "free text must not masquerade as IDs, error codes, stages, or results");
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
    errorCode: "none",
    packageVersion: "1.1.72"
  });
  const offlineSpan = telemetry.startSpan("bootstrap", { householdId: "h1" });
  const offlineEvent = offlineSpan.end("offline", { durationMs: 5, errorCode: "network_error" });
  assert.equal(offlineEvent.name, "bootstrap_failed", "offline must not be represented as completed");
  assert.deepEqual(JSON.parse(JSON.stringify(offlineEvent.fields)), {
    householdId: "h1",
    stage: "offline",
    result: "offline",
    durationMs: 5,
    errorCode: "network_error",
    packageVersion: "1.1.72"
  });
}

{
  const { store } = createRuntime();
  const snapshots = [];
  const unsubscribe = store.appStore.subscribe((state) => snapshots.push(state.currentHouseholdId));
  store.appStore.replaceSession({ accessToken: "a1", user: { id: "user-a" } });
  store.appStore.replaceBootstrap({
    schemaVersion: 1,
    stateVersion: "state-a",
    activeHouseholdId: "h1",
    user: { id: "user-a" }
  });
  store.appStore.setState({ offlineStatus: "retry" });
  store.appStore.replaceSession({ accessToken: "a2", user: { id: "user-a" } });
  assert.equal(store.appStore.getState().bootstrap.stateVersion, "state-a", "same-user session refresh may retain a valid bootstrap");
  store.appStore.replaceBootstrap({
    schemaVersion: 1,
    activeHouseholdId: "h1",
    user: { id: "user-a" }
  });
  store.appStore.replaceSession({ accessToken: "a3", user: { id: "user-a" } });
  assert.equal(store.appStore.getState().bootstrap, null, "same-user refresh must clear a bootstrap without a valid state version");
  store.appStore.replaceBootstrap({
    schemaVersion: 1,
    stateVersion: "state-a2",
    activeHouseholdId: "h1",
    user: { id: "user-a" }
  });
  store.appStore.replaceSession({ accessToken: "b1", user: { id: "user-b" } });
  assert.deepEqual(
    JSON.parse(JSON.stringify(store.appStore.getState())),
    { session: { accessToken: "b1", user: { id: "user-b" } }, currentHouseholdId: "", bootstrap: null, offlineStatus: "idle" },
    "a user change must atomically replace the session and clear user-owned state",
  );
  store.appStore.replaceSession(null);
  assert.deepEqual(
    JSON.parse(JSON.stringify(store.appStore.getState())),
    { session: null, currentHouseholdId: "", bootstrap: null, offlineStatus: "idle" },
    "logout must atomically clear session-owned state",
  );
  unsubscribe();
  assert(snapshots.includes("h1"));
}

{
  const restored = { accessToken: "restored", expiresAt: Date.now() + 60_000, user: { id: "user-a" } };
  const { app, storeState } = createAppRuntime(() => Promise.resolve({ status: "flushed" }), restored);
  app.onLaunch();
  assert.equal(app.globalData.humiSession.user.id, "user-a");
  assert.equal(storeState.session.user.id, "user-a");
  assert.equal(storeState.bootstrap, null, "launching as a different user clears stale bootstrap state");
  app.setHumiSession({ ...restored, accessToken: "refreshed" });
  storeState.bootstrap = { schemaVersion: 1, user: { id: "user-a" }, stateVersion: "still-valid" };
  app.setHumiSession({ ...restored, accessToken: "refreshed-again" });
  assert.equal(storeState.bootstrap.stateVersion, "still-valid", "same-user app session refresh retains reusable state");
  app.clearHumiSession();
  assert.equal(app.globalData.humiSession, null);
  assert.deepEqual(
    JSON.parse(JSON.stringify(storeState)),
    { session: null, bootstrap: null, currentHouseholdId: "", offlineStatus: "idle" },
    "app logout clears all user-owned appStore state",
  );
}

for (const outcome of [{ status: "conflict" }, { status: "retry" }]) {
  const { app, events } = createAppRuntime(() => Promise.resolve(outcome));
  assert.doesNotThrow(() => app.onShow(), "foreground recovery must never block the app lifecycle");
  await nextTask();
  assert.deepEqual(events, [], "foreground queue recovery must not masquerade as native startup telemetry");
}

{
  const { app, events } = createAppRuntime(() => Promise.reject(Object.assign(new Error("sensitive server detail"), { code: "untrusted_message" })));
  assert.doesNotThrow(() => app.onShow(), "a rejected foreground flush must never block the app lifecycle");
  await nextTask();
  assert.deepEqual(events, [], "foreground queue failures must stay out of native boot duration metrics");
}

console.log("Native offline, cache, telemetry, and store foundation contract passed.");
