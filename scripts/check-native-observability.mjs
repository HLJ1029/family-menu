import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import vm from "node:vm";
import * as storeModule from "../api/store.js";
import { createSessionToken } from "../api/session.js";

const EXPECTED_CLIENT_EVENTS = [
  "native_boot_started", "native_boot_completed", "native_boot_failed",
  "native_login_started", "native_login_completed", "native_login_failed",
  "bootstrap_completed", "bootstrap_failed",
  "recommendation_completed", "recommendation_failed",
  "meal_run_restore_completed", "meal_run_restore_failed",
  "thumbnail_first_visible_completed", "thumbnail_first_visible_failed",
  "share_snapshot_created", "native_share_page_visible", "native_share_cancelled", "native_share_failed",
  "poster_style_changed", "poster_saved", "poster_shared", "poster_failed",
  "effort_tier_viewed", "effort_tier_selected", "plan_presented", "plan_accepted", "reminder_opened",
  "cooking_mutation_started", "cooking_mutation_completed", "cooking_mutation_failed",
].sort();
const EXPECTED_SERVER_EVENTS = [
  "meal_run_started",
  "meal_run_completed",
  "meal_run_abandoned",
].sort();
const EXPECTED_HTTP_FIELDS = [
  "eventType",
  "anonymousSessionId",
  "householdId",
  "page",
  "stage",
  "durationMs",
  "errorCode",
  "packageVersion",
  "businessId",
].sort();
const HASH_SALT = "observability-test-salt-at-least-32-bytes";
const failures = [];
const checks = [];

await check("client telemetry retains exactly the 30 reviewed native event names", () => {
  const telemetry = loadCommonJs("miniprogram/utils/telemetry.js", {
    "./config": { HUMI_PACKAGE_VERSION: "1.1.72" },
  });
  assert.deepEqual([...telemetry.EVENT_NAMES].sort(), EXPECTED_CLIENT_EVENTS);
});

await check("MealRun state facts are not duplicated by client cooking mutation events", () => {
  const source = readFileSync("miniprogram/packageCooking/pages/cooking/index.js", "utf8");
  assert.match(source, /COOKING_TELEMETRY_ACTIONS\s*=\s*new Set\(\["progress",\s*"timer",\s*"downgrade",\s*"feedback"\]\)/);
  assert.doesNotMatch(source, /COOKING_TELEMETRY_ACTIONS[^;]*\b(?:start|complete|abandon)\b/);
  assert.match(source, /trackEvent\(`cooking_mutation_\$\{outcome\}`/);
});

await check("server exposes the same client allowlist plus only three server facts", () => {
  assert.deepEqual([...storeModule.NATIVE_CLIENT_EVENT_TYPES].sort(), EXPECTED_CLIENT_EVENTS);
  assert.deepEqual([...storeModule.MEAL_RUN_SERVER_EVENT_TYPES].sort(), EXPECTED_SERVER_EVENTS);
  assert.deepEqual([...storeModule.PRODUCT_EVENT_FIELDS].sort(), EXPECTED_HTTP_FIELDS);
});

await check("unknown event keys and forged server facts are rejected", async () => {
  const fixture = await createStoreFixture();
  try {
    await assert.rejects(
      fixture.store.recordClientProductEvent({
        userId: fixture.userId,
        telemetryHashSalt: HASH_SALT,
        input: clientEvent({
          householdId: fixture.householdId,
          nickname: "must never be accepted",
        }),
      }),
      (error) => error?.code === "product_event_field_invalid",
    );
    await assert.rejects(
      fixture.store.recordClientProductEvent({
        userId: fixture.userId,
        telemetryHashSalt: HASH_SALT,
        input: clientEvent({
          eventType: "meal_run_completed",
          householdId: fixture.householdId,
        }),
      }),
      (error) => error?.code === "product_event_not_allowed",
    );
    assert.equal(fixture.store.data.productEvents.length, 0);
  } finally {
    await fixture.cleanup();
  }
});

await check("anonymous household attribution is rejected and authenticated attribution requires formal membership", async () => {
  const fixture = await createStoreFixture();
  try {
    await assert.rejects(
      fixture.store.recordClientProductEvent({
        userId: "",
        telemetryHashSalt: HASH_SALT,
        input: clientEvent({ householdId: fixture.householdId }),
      }),
      (error) => error?.code === "product_event_household_forbidden",
    );
    const anonymous = await fixture.store.recordClientProductEvent({
      userId: "",
      telemetryHashSalt: HASH_SALT,
      input: clientEvent({ householdId: "", businessId: "anonymous-event-1" }),
    });
    assert.equal(anonymous.householdId, "");
    await assert.rejects(
      fixture.store.recordClientProductEvent({
        userId: "observability-outsider",
        telemetryHashSalt: HASH_SALT,
        input: clientEvent({ householdId: fixture.householdId, businessId: "outsider-event-1" }),
      }),
      (error) => error?.code === "household_not_found",
    );
  } finally {
    await fixture.cleanup();
  }
});

await check("client business ids make accepted telemetry idempotent", async () => {
  const fixture = await createStoreFixture();
  try {
    const input = clientEvent({ householdId: fixture.householdId, businessId: "same-event-id" });
    const first = await fixture.store.recordClientProductEvent({
      userId: fixture.userId,
      telemetryHashSalt: HASH_SALT,
      input,
    });
    const second = await fixture.store.recordClientProductEvent({
      userId: fixture.userId,
      telemetryHashSalt: HASH_SALT,
      input: { ...input, anonymousSessionId: "rotated-anonymous-session" },
    });
    assert.equal(second.id, first.id);
    assert.equal(fixture.store.data.productEvents.length, 1);
  } finally {
    await fixture.cleanup();
  }
});

await check("HTTP accepts anonymous client events but rejects household spoofing, unknown keys, and server facts", async () => {
  const fixture = await createStoreFixture();
  const priorEnvironment = {
    dataFile: process.env.HUMI_API_DATA_FILE,
    hashSalt: process.env.HUMI_TELEMETRY_HASH_SALT,
    sessionSecret: process.env.HUMI_SESSION_SECRET,
    mealExecution: process.env.HUMI_MEAL_EXECUTION_ENABLED,
    mealHouseholds: process.env.HUMI_MEAL_EXECUTION_HOUSEHOLDS,
    telemetryRateLimit: process.env.HUMI_TELEMETRY_RATE_LIMIT,
    telemetryRateWindowMs: process.env.HUMI_TELEMETRY_RATE_WINDOW_MS,
  };
  const sessionSecret = "observability-http-session-secret";
  let server;
  try {
    fixture.store.data.users.push({ id: "observability-outsider", displayName: "Outsider" });
    await fixture.store.save();
    process.env.HUMI_API_DATA_FILE = fixture.store.filePath;
    process.env.HUMI_TELEMETRY_HASH_SALT = HASH_SALT;
    process.env.HUMI_SESSION_SECRET = sessionSecret;
    process.env.HUMI_MEAL_EXECUTION_ENABLED = "0";
    process.env.HUMI_MEAL_EXECUTION_HOUSEHOLDS = "";
    process.env.HUMI_TELEMETRY_RATE_LIMIT = "7";
    process.env.HUMI_TELEMETRY_RATE_WINDOW_MS = "60000";
    const { createHumiApiServer } = await import(`../api/server.js?observability=${Date.now()}`);
    server = createHumiApiServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const memberToken = createSessionToken({ userId: fixture.userId, secret: sessionSecret }).token;
    const outsiderToken = createSessionToken({ userId: "observability-outsider", secret: sessionSecret }).token;

    await postEvent(
      origin,
      { ...clientEvent({ businessId: "http-too-large" }), padding: "x".repeat(5_000) },
      413,
      "",
      "request_too_large",
    );
    await postEvent(origin, clientEvent({ householdId: "", businessId: "http-anonymous" }), 202);
    await postEvent(
      origin,
      clientEvent({ householdId: fixture.householdId, businessId: "http-anonymous-spoof" }),
      403,
      "",
      "product_event_household_forbidden",
    );
    await postEvent(
      origin,
      clientEvent({ householdId: fixture.householdId, businessId: "http-member" }),
      202,
      memberToken,
    );
    await postEvent(
      origin,
      clientEvent({ householdId: fixture.householdId, businessId: "http-outsider" }),
      404,
      outsiderToken,
      "household_not_found",
    );
    await postEvent(
      origin,
      { ...clientEvent({ businessId: "http-unknown" }), nickname: "not allowed" },
      400,
      "",
      "product_event_field_invalid",
    );
    await postEvent(
      origin,
      clientEvent({ eventType: "meal_run_completed", businessId: "http-forged-server-fact" }),
      400,
      memberToken,
      "product_event_not_allowed",
    );
    await postEvent(
      origin,
      clientEvent({ householdId: fixture.householdId, businessId: "http-member" }),
      202,
      memberToken,
    );
    await postEvent(
      origin,
      clientEvent({ householdId: "", businessId: "http-rate-limited" }),
      429,
      "",
      "telemetry_rate_limited",
    );
    await postEvent(
      origin,
      clientEvent({
        anonymousSessionId: "anonymous-session-observability-2",
        businessId: "http-independent-session",
      }),
      202,
    );

    const persisted = JSON.parse(await readFile(fixture.store.filePath, "utf8"));
    assert.equal(persisted.productEvents.filter((event) => event.businessId === "http-member").length, 1);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    restoreEnvironment("HUMI_API_DATA_FILE", priorEnvironment.dataFile);
    restoreEnvironment("HUMI_TELEMETRY_HASH_SALT", priorEnvironment.hashSalt);
    restoreEnvironment("HUMI_SESSION_SECRET", priorEnvironment.sessionSecret);
    restoreEnvironment("HUMI_MEAL_EXECUTION_ENABLED", priorEnvironment.mealExecution);
    restoreEnvironment("HUMI_MEAL_EXECUTION_HOUSEHOLDS", priorEnvironment.mealHouseholds);
    restoreEnvironment("HUMI_TELEMETRY_RATE_LIMIT", priorEnvironment.telemetryRateLimit);
    restoreEnvironment("HUMI_TELEMETRY_RATE_WINDOW_MS", priorEnvironment.telemetryRateWindowMs);
    await fixture.cleanup();
  }
});

await check("two anonymous sessions behind one proxy each receive the default 120-request window", async () => {
  const fixture = await createStoreFixture();
  const priorEnvironment = {
    dataFile: process.env.HUMI_API_DATA_FILE,
    hashSalt: process.env.HUMI_TELEMETRY_HASH_SALT,
    sessionSecret: process.env.HUMI_SESSION_SECRET,
    telemetryRateLimit: process.env.HUMI_TELEMETRY_RATE_LIMIT,
    telemetryNetworkRateLimit: process.env.HUMI_TELEMETRY_NETWORK_RATE_LIMIT,
  };
  let server;
  try {
    process.env.HUMI_API_DATA_FILE = fixture.store.filePath;
    process.env.HUMI_TELEMETRY_HASH_SALT = HASH_SALT;
    process.env.HUMI_SESSION_SECRET = "observability-default-rate-session-secret";
    delete process.env.HUMI_TELEMETRY_RATE_LIMIT;
    delete process.env.HUMI_TELEMETRY_NETWORK_RATE_LIMIT;
    const serverModule = await import(`../api/server.js?observability-default-rate=${Date.now()}`);
    const bounded = serverModule.createBoundedFixedWindowLimiter({
      limit: 2,
      windowMs: 60_000,
      maxEntries: 3,
    });
    for (let index = 0; index < 20; index += 1) {
      bounded.consume(`unique-${index}`, index);
      assert.ok(bounded.size <= 3, "unique limiter keys must never grow beyond maxEntries");
    }
    bounded.consume("expired", 0);
    bounded.consume("fresh", 60_001);
    assert.ok(bounded.size <= 3, "expired cleanup must retain the hard map bound");

    server = serverModule.createHumiApiServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const session of ["proxy-session-a", "proxy-session-b"]) {
      for (let index = 0; index < 120; index += 1) {
        await postEvent(origin, clientEvent({
          anonymousSessionId: session,
          businessId: `${session}-${index}`,
        }), 202);
      }
    }
    await postEvent(
      origin,
      clientEvent({ anonymousSessionId: "proxy-session-a", businessId: "proxy-session-a-over-limit" }),
      429,
      "",
      "telemetry_rate_limited",
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    restoreEnvironment("HUMI_API_DATA_FILE", priorEnvironment.dataFile);
    restoreEnvironment("HUMI_TELEMETRY_HASH_SALT", priorEnvironment.hashSalt);
    restoreEnvironment("HUMI_SESSION_SECRET", priorEnvironment.sessionSecret);
    restoreEnvironment("HUMI_TELEMETRY_RATE_LIMIT", priorEnvironment.telemetryRateLimit);
    restoreEnvironment("HUMI_TELEMETRY_NETWORK_RATE_LIMIT", priorEnvironment.telemetryNetworkRateLimit);
    await fixture.cleanup();
  }
});

await check("anonymous ids are HMAC-SHA256 hashed and raw identity never persists", async () => {
  const fixture = await createStoreFixture();
  try {
    const rawAnonymousSessionId = "anonymous-session-observability-1";
    const event = await fixture.store.recordClientProductEvent({
      userId: fixture.userId,
      telemetryHashSalt: HASH_SALT,
      input: clientEvent({
        anonymousSessionId: rawAnonymousSessionId,
        householdId: fixture.householdId,
      }),
    });
    const expectedHash = createHmac("sha256", HASH_SALT).update(rawAnonymousSessionId).digest("hex");
    assert.equal(event.anonymousSessionHash, expectedHash);
    const dump = JSON.stringify(fixture.store.data.productEvents);
    assert.equal(dump.includes(rawAnonymousSessionId), false);
    assert.equal(dump.includes(fixture.userId), false);
    assert.equal(dump.includes("nickname"), false);
    assert.equal("anonymousSessionId" in event, false);
    assert.equal("userId" in event, false);
  } finally {
    await fixture.cleanup();
  }
});

await check("legacy product events are sanitized when a store is loaded", async () => {
  const fixture = await createStoreFixture();
  try {
    fixture.store.data.productEvents = [{
      id: "legacy-event",
      eventType: "plan_presented",
      userId: fixture.userId,
      sessionId: "raw-session-id",
      anonymousSessionId: "raw-anonymous-session",
      nickname: "Legacy Nickname",
      householdId: fixture.householdId,
      mealRunId: "legacy-meal-run",
      occurredAt: new Date().toISOString(),
    }, {
      id: "expired-event",
      eventType: "native_boot_completed",
      userId: fixture.userId,
      anonymousSessionId: "expired-raw-session",
      businessId: "expired-business",
      occurredAt: "2025-01-01T00:00:00.000Z",
    }];
    await fixture.store.save();
    const reloaded = new storeModule.HumiStore(fixture.store.filePath);
    await Promise.all([reloaded.load(), reloaded.load()]);
    const dump = JSON.stringify(reloaded.data.productEvents);
    assert.equal(dump.includes(fixture.userId), false);
    assert.equal(dump.includes("raw-session-id"), false);
    assert.equal(dump.includes("raw-anonymous-session"), false);
    assert.equal(dump.includes("Legacy Nickname"), false);
    assert.deepEqual(Object.keys(reloaded.data.productEvents[0]).sort(), [
      "businessId",
      "eventType",
      "householdId",
      "id",
      "occurredAt",
    ]);
    assert.equal(reloaded.data.productEvents.some((event) => event.id === "expired-event"), false);
    const persistedDump = JSON.stringify(JSON.parse(await readFile(fixture.store.filePath, "utf8")).productEvents);
    for (const forbidden of [
      fixture.userId,
      "raw-session-id",
      "raw-anonymous-session",
      "Legacy Nickname",
      "expired-raw-session",
      "expired-event",
    ]) {
      assert.equal(persistedDump.includes(forbidden), false, `${forbidden} must be removed from disk atomically`);
    }
  } finally {
    await fixture.cleanup();
  }
});

await check("every successful store transaction prunes 180-day product events while failed transactions roll back", async () => {
  const fixture = await createStoreFixture();
  try {
    const expired = {
      id: "expired-on-success",
      eventType: "native_boot_completed",
      businessId: "expired-on-success",
      occurredAt: "2025-01-01T00:00:00.000Z",
    };
    fixture.store.data.productEvents.push(expired);
    await fixture.store.mutateAndSave(() => {
      fixture.store.data.states.transactionMarker = "success";
      return "ok";
    });
    assert.equal(fixture.store.data.productEvents.some((event) => event.id === expired.id), false);
    assert.equal((await readFile(fixture.store.filePath, "utf8")).includes(expired.id), false);

    const rollbackEvent = { ...expired, id: "expired-rollback", businessId: "expired-rollback" };
    fixture.store.data.productEvents.push(rollbackEvent);
    await assert.rejects(
      fixture.store.mutateAndSave(() => {
        fixture.store.data.states.transactionMarker = "must-rollback";
        throw new Error("transaction failed");
      }),
      /transaction failed/,
    );
    assert.equal(
      fixture.store.data.productEvents.some((event) => event.id === rollbackEvent.id),
      true,
      "a failed transaction must restore the pre-transaction in-memory snapshot",
    );
    assert.equal(fixture.store.data.states.transactionMarker, "success");
  } finally {
    await fixture.cleanup();
  }
});

await check("client telemetry is durable across failure and retry with an unchanged business id", async () => {
  const storage = new Map();
  const wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: (key) => storage.delete(key),
  };
  const telemetry = loadCommonJs("miniprogram/utils/telemetry.js", {
    "./config": { HUMI_PACKAGE_VERSION: "1.1.72" },
  }, { wx });
  const tracked = telemetry.trackEvent("native_boot_completed", {
    page: "boot",
    stage: "completed",
    durationMs: 12,
    householdId: "",
    nickname: "must-not-leave-device",
  });
  assert.match(tracked.anonymousSessionId, /^anonymous-/);
  assert.equal(storage.get("humi:telemetry-anonymous-session:v1"), undefined);
  assert.equal(storage.get("humi:telemetry-queue:v1").length, 1);
  const attemptedBusinessIds = [];
  await assert.rejects(telemetry.flushTelemetry(async (batch) => {
    attemptedBusinessIds.push(batch.map((event) => event.businessId));
    throw new Error("network down");
  }), /network down/);
  assert.equal(telemetry.readPendingTelemetry().length, 1);
  assert.equal(storage.get("humi:telemetry-queue:v1").length, 1);
  await telemetry.flushTelemetry(async (batch) => {
    attemptedBusinessIds.push(batch.map((event) => event.businessId));
  });
  assert.deepEqual(attemptedBusinessIds[1], attemptedBusinessIds[0]);
  assert.equal(telemetry.readPendingTelemetry().length, 0);
  assert.equal(storage.has("humi:telemetry-queue:v1"), false);
});

await check("cold starts and account transitions rotate telemetry sessions without rewriting queued events", () => {
  const storage = new Map();
  const wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: (key) => storage.delete(key),
  };
  const firstRuntime = loadCommonJs("miniprogram/utils/telemetry.js", {
    "./config": { HUMI_PACKAGE_VERSION: "1.1.72" },
  }, { wx });
  firstRuntime.setTelemetryOwner("account-a", { rotate: false });
  const accountAEvent = firstRuntime.trackEvent("native_boot_completed", { page: "boot", stage: "completed" });

  const secondRuntime = loadCommonJs("miniprogram/utils/telemetry.js", {
    "./config": { HUMI_PACKAGE_VERSION: "1.1.72" },
  }, { wx });
  secondRuntime.setTelemetryOwner("account-a", { rotate: false });
  const coldStartEvent = secondRuntime.trackEvent("native_boot_completed", { page: "boot", stage: "completed" });
  assert.notEqual(coldStartEvent.anonymousSessionId, accountAEvent.anonymousSessionId);
  assert.equal(secondRuntime.readPendingTelemetry()[0].anonymousSessionId, accountAEvent.anonymousSessionId);

  secondRuntime.setTelemetryOwner("account-b");
  const accountBEvent = secondRuntime.trackEvent("native_login_completed", { page: "identity", stage: "completed" });
  secondRuntime.setTelemetryOwner("");
  const guestEvent = secondRuntime.trackEvent("native_boot_completed", { page: "boot", stage: "completed" });
  assert.notEqual(accountBEvent.anonymousSessionId, coldStartEvent.anonymousSessionId);
  assert.notEqual(guestEvent.anonymousSessionId, accountBEvent.anonymousSessionId);
  assert.equal(storage.get("humi:telemetry-anonymous-session:v1"), undefined);
});

await check("the app rotates telemetry ownership only when login identity changes or exits", () => {
  let definition;
  const rotations = [];
  const scheduledDelays = [];
  const restored = { accessToken: "token-a", user: { id: "account-a" } };
  loadCommonJs("miniprogram/app.js", {
    "./utils/session": {
      restoreSession: () => restored,
      saveSession: () => {},
      clearSession: () => {},
    },
    "./utils/offline-queue": { flushMutationQueue: async () => ({ status: "empty" }) },
    "./utils/telemetry": {
      scheduleTelemetryFlush: (options) => scheduledDelays.push(options?.delayMs || 0),
      setTelemetryOwner: (owner, options) => rotations.push([owner, options?.rotate]),
    },
    "./utils/config": { HUMI_NATIVE_SHELL_CANDIDATE: true },
    "./utils/store": {
      appStore: {
        replaceSession: () => {},
        replaceBootstrap: () => {},
        setState: () => {},
      },
    },
  }, {
    App: (candidate) => {
      definition = candidate;
    },
  });
  definition.onLaunch.call(definition);
  definition.setHumiSession.call(definition, restored);
  definition.setHumiSession.call(definition, { accessToken: "token-b", user: { id: "account-b" } });
  definition.clearHumiSession.call(definition);
  assert.deepEqual(rotations, [
    ["account-a", false],
    ["account-b", undefined],
    ["", undefined],
  ]);
  assert.deepEqual(scheduledDelays, [1_200], "onLaunch must yield startup bandwidth before telemetry flushes");
});

await check("permanent poison events do not block a switched account or later guest telemetry", async () => {
  const storage = new Map();
  const requests = [];
  let activeSession = { accessToken: "token-a", user: { id: "account-a" } };
  const wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: (key) => storage.delete(key),
  };
  const telemetry = loadCommonJs("miniprogram/utils/telemetry.js", {
    "./config": { HUMI_PACKAGE_VERSION: "1.1.72" },
    "./session": { getSession: () => activeSession },
    "./request": {
      rawRequest: async (options) => {
        requests.push(["anonymous", structuredClone(options)]);
        if (options.data.businessId.includes("poison")) {
          const error = new Error("former household is forbidden");
          error.status = 403;
          throw error;
        }
        return { ok: true };
      },
      requestHumi: async (options) => {
        requests.push(["authenticated", structuredClone(options)]);
        return { ok: true };
      },
    },
  }, { wx });
  telemetry.setTelemetryOwner("account-a", { rotate: false });
  telemetry.trackEvent("plan_presented", {
    householdId: "former-household",
    page: "tonight",
    stage: "completed",
    businessId: "poison-former-household",
  });
  activeSession = { accessToken: "token-b", user: { id: "account-b" } };
  telemetry.setTelemetryOwner("account-b");
  const accountB = telemetry.trackEvent("plan_presented", {
    householdId: "current-household",
    page: "tonight",
    stage: "completed",
    businessId: "account-b-plan",
  });
  await telemetry.flushTelemetryToServer();
  assert.equal(requests.some(([transport, request]) => (
    transport === "authenticated" && request.data.businessId.includes("account-b-plan")
  )), true);
  assert.equal(telemetry.readPendingTelemetry().length, 0);

  activeSession = null;
  telemetry.setTelemetryOwner("");
  const guest = telemetry.trackEvent("native_boot_completed", { page: "boot", stage: "completed" });
  await telemetry.flushTelemetryToServer();
  assert.equal(requests.at(-1)[0], "anonymous");
  assert.equal(requests.at(-1)[1].data.anonymousSessionId, guest.anonymousSessionId);
  assert.notEqual(guest.anonymousSessionId, accountB.anonymousSessionId);
  const deadLetters = storage.get("humi:telemetry-dead-letter:v1");
  assert.equal(deadLetters.length, 1);
  assert.deepEqual(Object.keys(deadLetters[0]).sort(), ["businessId", "droppedAt", "errorCode", "name"]);
  assert.equal(JSON.stringify(deadLetters).includes("token-a"), false);
  assert.equal(JSON.stringify(deadLetters).includes("former-household"), false);
});

await check("network, 429, and 5xx failures remain queued and each flush attempts at most 20 events", async () => {
  const storage = new Map();
  const wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: (key) => storage.delete(key),
  };
  const telemetry = loadCommonJs("miniprogram/utils/telemetry.js", {
    "./config": { HUMI_PACKAGE_VERSION: "1.1.72" },
  }, { wx });
  for (let index = 0; index < 25; index += 1) {
    telemetry.trackEvent("native_boot_completed", { page: "boot", stage: "completed", businessId: `batch-${index}` });
  }
  const attempted = [];
  const outcome = await telemetry.flushTelemetry(async (batch) => attempted.push(...batch));
  assert.equal(outcome.count, 20);
  assert.equal(attempted.length, 20);
  assert.equal(telemetry.readPendingTelemetry().length, 5);

  const actualStorage = new Map();
  const actualRequests = [];
  const actualRuntime = loadCommonJs("miniprogram/utils/telemetry.js", {
    "./config": { HUMI_PACKAGE_VERSION: "1.1.72" },
    "./session": { getSession: () => null },
    "./request": {
      rawRequest: async (options) => {
        actualRequests.push(options);
        return { ok: true };
      },
      requestHumi: async () => ({ ok: true }),
    },
  }, {
    wx: {
      getStorageSync: (key) => actualStorage.get(key),
      setStorageSync: (key, value) => actualStorage.set(key, structuredClone(value)),
      removeStorageSync: (key) => actualStorage.delete(key),
    },
  });
  for (let index = 0; index < 25; index += 1) {
    actualRuntime.trackEvent("native_boot_completed", {
      page: "boot",
      stage: "completed",
      businessId: `actual-batch-${index}`,
    });
  }
  await actualRuntime.flushTelemetryToServer();
  assert.equal(actualRequests.length, 20);
  assert.equal(actualRuntime.readPendingTelemetry().length, 5);

  for (const status of [0, 429, 503]) {
    const runtimeStorage = new Map();
    const runtime = loadCommonJs("miniprogram/utils/telemetry.js", {
      "./config": { HUMI_PACKAGE_VERSION: "1.1.72" },
      "./session": { getSession: () => null },
      "./request": {
        rawRequest: async () => {
          const error = new Error(`retry ${status}`);
          error.status = status;
          throw error;
        },
        requestHumi: async () => ({ ok: true }),
      },
    }, {
      wx: {
        getStorageSync: (key) => runtimeStorage.get(key),
        setStorageSync: (key, value) => runtimeStorage.set(key, structuredClone(value)),
        removeStorageSync: (key) => runtimeStorage.delete(key),
      },
    });
    runtime.trackEvent("native_boot_completed", { page: "boot", stage: "completed" });
    await assert.rejects(runtime.flushTelemetryToServer(), new RegExp(`retry ${status}`));
    assert.equal(runtime.readPendingTelemetry().length, 1);
  }
});

await check("trackEvent schedules an immediate non-blocking server flush", async () => {
  const storage = new Map();
  const requests = [];
  const wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: (key) => storage.delete(key),
  };
  const telemetry = loadCommonJs("miniprogram/utils/telemetry.js", {
    "./config": { HUMI_PACKAGE_VERSION: "1.1.72" },
    "./session": { getSession: () => null },
    "./request": {
      rawRequest: async (options) => {
        requests.push(structuredClone(options));
        return { ok: true };
      },
      requestHumi: async () => {
        throw new Error("anonymous flush must not use authenticated transport");
      },
    },
  }, { wx });
  const tracked = telemetry.trackEvent("native_boot_completed", {
    page: "boot",
    stage: "completed",
    durationMs: 7,
    errorCode: "none",
  });
  assert.equal(requests.length, 0, "trackEvent must return before the network request starts");
  await Promise.resolve();
  await telemetry.flushTelemetryToServer();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/product-events");
  assert.equal(requests[0].data.businessId, tracked.businessId);
  assert.equal(telemetry.readPendingTelemetry().length, 0);
});

await check("wire projection uses only the exact reviewed HTTP fields", () => {
  const telemetry = loadCommonJs("miniprogram/utils/telemetry.js", {
    "./config": { HUMI_PACKAGE_VERSION: "1.1.72" },
  });
  const event = telemetry.trackEvent("plan_presented", {
    householdId: "observability-household",
    page: "tonight",
    stage: "completed",
    durationMs: 10,
    errorCode: "none",
    mealRunId: "run-business-id",
    nickname: "must-not-project",
  });
  const projected = telemetry.toWireEvent(event, { authenticated: true });
  assert.deepEqual(Object.keys(projected).sort(), EXPECTED_HTTP_FIELDS);
  assert.equal(projected.anonymousSessionId, event.anonymousSessionId);
  assert.match(projected.businessId, /^run-business-id:/, "wire businessId must retain the safe business object reference");
  assert.equal(
    telemetry.toWireEvent(event, { authenticated: true }).businessId,
    projected.businessId,
    "the correlated wire businessId must remain stable across retries",
  );
  assert.equal(JSON.stringify(projected).includes("nickname"), false);
});

await check("all effort tiers and share sources remain analytically distinct inside strict wire business ids", () => {
  const telemetry = loadCommonJs("miniprogram/utils/telemetry.js", {
    "./config": { HUMI_PACKAGE_VERSION: "1.1.72" },
  });
  for (const effortTier of ["quick_15", "easy_30", "normal"]) {
    const event = telemetry.trackEvent("effort_tier_selected", {
      page: "tonight",
      stage: "completed",
      effortTier,
    });
    assert.match(telemetry.toWireEvent(event).businessId, new RegExp(`effort-${effortTier}`));
  }
  for (const shareSource of ["menu", "grocery", "invite", "meal_task", "poster"]) {
    const event = telemetry.trackEvent("native_share_page_visible", {
      page: "share",
      stage: "completed",
      shareSource,
    });
    assert.match(telemetry.toWireEvent(event).businessId, new RegExp(`share-${shareSource}`));
  }
});

await check("the app schedules a real non-blocking telemetry flush", () => {
  const source = readFileSync("miniprogram/app.js", "utf8");
  assert.match(source, /scheduleTelemetryFlush/);
  assert.doesNotMatch(source, /await\s+scheduleTelemetryFlush/);
});

await check("production startup fails closed without HUMI_TELEMETRY_HASH_SALT", () => {
  const env = { ...process.env };
  delete env.HUMI_TELEMETRY_HASH_SALT;
  const result = spawnSync(process.execPath, ["-e", "import('./api/server.js')"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...env,
      NODE_ENV: "production",
      HUMI_SESSION_SECRET: "production-session-secret-for-test",
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /HUMI_TELEMETRY_HASH_SALT/);

  const shortSalt = spawnSync(process.execPath, ["-e", "import('./api/server.js')"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...env,
      NODE_ENV: "production",
      HUMI_SESSION_SECRET: "production-session-secret-for-test",
      HUMI_TELEMETRY_HASH_SALT: "too-short",
    },
  });
  assert.notEqual(shortSalt.status, 0);
  assert.match(`${shortSalt.stdout}\n${shortSalt.stderr}`, /at least 32/);
});

await check("client writes prune raw product events older than 180 days", async () => {
  const fixture = await createStoreFixture();
  try {
    fixture.store.data.productEvents = [{
      id: "expired",
      eventType: "native_boot_completed",
      occurredAt: "2025-01-01T00:00:00.000Z",
    }];
    await fixture.store.recordClientProductEvent({
      userId: fixture.userId,
      telemetryHashSalt: HASH_SALT,
      input: clientEvent({ householdId: fixture.householdId }),
    });
    assert.equal(fixture.store.data.productEvents.some((event) => event.id === "expired"), false);
  } finally {
    await fixture.cleanup();
  }
});

await check("MealRun transitions append server facts transactionally and exactly once", async () => {
  const fixture = await createStoreFixture();
  try {
    const startedRun = mealRunFixture({
      id: "meal-run-start-complete",
      householdId: fixture.householdId,
      status: "planned",
    });
    const abandonedRun = mealRunFixture({
      id: "meal-run-abandon",
      householdId: fixture.householdId,
      status: "planned",
    });
    fixture.store.data.mealRuns.push(startedRun, abandonedRun);

    await fixture.store.startMealRun(fixture.userId, startedRun.id, {
      steps: [{ id: "step-1", attention: "active" }],
    });
    await fixture.store.startMealRun(fixture.userId, startedRun.id, {
      steps: [{ id: "step-1", attention: "active" }],
    });
    await fixture.store.completeMealRun(fixture.userId, startedRun.id, { timelineVersion: 1 });
    await fixture.store.completeMealRun(fixture.userId, startedRun.id, { timelineVersion: 1 });
    await fixture.store.abandonMealRun(fixture.userId, abandonedRun.id, "plans_changed");
    await fixture.store.abandonMealRun(fixture.userId, abandonedRun.id, "plans_changed");

    for (const eventType of EXPECTED_SERVER_EVENTS) {
      const matching = fixture.store.data.productEvents.filter((event) => event.eventType === eventType);
      assert.equal(matching.length, 1, `${eventType} must be stored exactly once`);
      assert.equal(matching[0].householdId, fixture.householdId);
      assert.equal("userId" in matching[0], false);
    }
  } finally {
    await fixture.cleanup();
  }
});

console.log(JSON.stringify({ ok: failures.length === 0, checks }, null, 2));
if (failures.length) {
  throw new AggregateError(
    failures.map((failure) => new Error(`${failure.name}: ${failure.message}`)),
    `${failures.length} native observability checks failed`,
  );
}

async function check(name, run) {
  try {
    await run();
    checks.push({ name, ok: true });
  } catch (error) {
    const message = error?.message || String(error);
    failures.push({ name, message });
    checks.push({ name, ok: false, error: message });
  }
}

function clientEvent(overrides = {}) {
  return {
    eventType: "native_boot_completed",
    anonymousSessionId: "anonymous-session-observability-1",
    householdId: "",
    page: "boot",
    stage: "completed",
    durationMs: 120,
    errorCode: "none",
    packageVersion: "1.1.72",
    businessId: "event-observability-1",
    ...overrides,
  };
}

async function createStoreFixture() {
  const directory = await mkdtemp(join(tmpdir(), "humi-observability-"));
  const store = new storeModule.HumiStore(join(directory, "store.json"));
  await store.load();
  const userId = "observability-user";
  const householdId = "observability-household";
  store.data.users.push({ id: userId, displayName: "Test User" });
  store.data.households.push({
    id: householdId,
    ownerId: userId,
    members: [{ memberId: userId, role: "owner", status: "formal" }],
  });
  store.data.activeHouseholds[userId] = householdId;
  return {
    store,
    userId,
    householdId,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

function mealRunFixture({ id, householdId, status }) {
  const now = "2026-07-24T10:00:00.000Z";
  return {
    id,
    householdId,
    dateKey: "2026-07-24",
    mealSlot: "dinner",
    effortTier: "quick_15",
    recipeIds: ["tomato-eggs"],
    recipeSnapshot: [],
    timelineVersion: 1,
    timeline: null,
    currentStepId: "",
    timers: {},
    timerEndsAt: "",
    syncedStartedAt: "",
    status,
    abandonReason: "",
    feedback: [],
    createdBy: "observability-user",
    startedBy: "",
    completedBy: "",
    createdAt: now,
    updatedAt: now,
    startedAt: "",
    completedAt: "",
    abandonedAt: "",
  };
}

async function postEvent(origin, body, expectedStatus, token = "", expectedCode = "") {
  const response = await fetch(`${origin}/product-events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(payload));
  if (expectedCode) assert.equal(payload.error || payload.code, expectedCode);
  return payload;
}

function restoreEnvironment(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function loadCommonJs(relativePath, moduleMap, globals = {}) {
  const absolutePath = resolve(relativePath);
  const source = readFileSync(absolutePath, "utf8");
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: (specifier) => {
      if (Object.prototype.hasOwnProperty.call(moduleMap, specifier)) return moduleMap[specifier];
      throw new Error(`Unexpected dependency ${specifier} from ${relativePath}`);
    },
    console,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    ...globals,
  });
  new vm.Script(`(function(require, module, exports) {${source}\n})(require, module, exports);`, {
    filename: absolutePath,
  }).runInContext(context);
  return module.exports;
}
