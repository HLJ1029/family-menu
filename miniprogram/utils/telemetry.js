const { HUMI_PACKAGE_VERSION } = require("./config");

const TELEMETRY_QUEUE_KEY = "humi:telemetry-queue:v1";
const TELEMETRY_DEAD_LETTER_KEY = "humi:telemetry-dead-letter:v1";
const MAX_PENDING_EVENTS = 200;
const MAX_FLUSH_EVENTS = 20;
const MAX_DEAD_LETTERS = 20;
const EVENT_FIELDS = new Set(["sessionId", "householdId", "mealRunId", "recipeId", "recommendationId", "businessId", "effortTier", "page", "stage", "result", "errorCode", "stateVersion", "durationMs", "count", "styleId", "shareSource", "packageVersion"]);
const EVENT_NAMES = new Set([
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
]);
const ENUM_FIELDS = {
  page: new Set(["boot", "tonight", "discover", "plan", "grocery", "family", "cooking", "identity", "share", "poster", "reminder"]),
  stage: new Set(["started", "completed", "failed", "retry", "offline", "queue_flush"]),
  result: new Set(["completed", "failed", "cancelled", "offline", "conflict", "retry"]),
  effortTier: new Set(["quick_15", "easy_30", "normal"]),
  shareSource: new Set(["menu", "grocery", "invite", "meal_task", "poster"]),
  errorCode: new Set([
    "none", "network_error", "invalid_session", "request_failed", "wechat_login_failed", "unauthorized", "permission_denied",
    "conflict", "retry", "forbidden", "offline_action_not_allowed", "offline_action_invalid",
    "offline_action_unconfigured", "offline_queue_full", "offline_queue_too_large", "offline_product_event_unsafe",
    "queue_conflict", "queue_retry", "queue_flush_failed"
  ])
};
const ID_FIELDS = new Set(["sessionId", "householdId", "mealRunId", "recipeId", "recommendationId", "businessId", "stateVersion", "styleId"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+$/;
let activeAnonymousSessionId = createTelemetryId("anonymous");
let activeOwnerId = "";
const pending = readStoredQueue();
const deadLetters = readStoredDeadLetters();
let flushPromise = null;
let flushScheduled = false;

function sanitizeFields(fields = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!EVENT_FIELDS.has(key) || value === undefined || value === null) continue;
    if (key === "packageVersion") {
      if (typeof value === "string" && SAFE_VERSION.test(value)) clean[key] = value;
      continue;
    }
    if (ENUM_FIELDS[key]) {
      if (ENUM_FIELDS[key].has(value)) clean[key] = value;
      continue;
    }
    if ((key === "durationMs" || key === "count") && Number.isFinite(value)) clean[key] = Math.max(0, Number(value));
    else if (ID_FIELDS.has(key) && typeof value === "string" && SAFE_ID.test(value)) clean[key] = value;
  }
  return clean;
}

function trackEvent(name, fields) {
  if (!EVENT_NAMES.has(name)) return null;
  const event = {
    name,
    fields: sanitizeFields({ ...fields, packageVersion: HUMI_PACKAGE_VERSION }),
    at: Date.now(),
    businessId: createTelemetryId("event"),
    anonymousSessionId: activeAnonymousSessionId,
    ownerId: activeOwnerId,
  };
  pending.push(event);
  if (pending.length > MAX_PENDING_EVENTS) pending.splice(0, pending.length - MAX_PENDING_EVENTS);
  persistPending();
  scheduleTelemetryFlush();
  return event;
}

function isSafeTelemetryEvent(name, fields = {}) {
  return EVENT_NAMES.has(name) && JSON.stringify(sanitizeFields(fields)) === JSON.stringify(fields);
}

function readPendingTelemetry() {
  return pending.slice();
}

async function flushTelemetry(send) {
  if (typeof send !== "function" || !pending.length) return { status: "empty" };
  const batch = pending.slice(0, MAX_FLUSH_EVENTS);
  await send(batch);
  pending.splice(0, batch.length);
  persistPending();
  return { status: "flushed", count: batch.length, remaining: pending.length };
}

function toWireEvent(event, { authenticated = false } = {}) {
  const fields = event?.fields || {};
  return {
    eventType: EVENT_NAMES.has(event?.name) ? event.name : "",
    anonymousSessionId: safeBusinessId(event?.anonymousSessionId) || activeAnonymousSessionId,
    householdId: authenticated ? (fields.householdId || "") : "",
    page: fields.page || "",
    stage: fields.stage || "",
    durationMs: Number.isFinite(fields.durationMs) ? fields.durationMs : 0,
    errorCode: fields.errorCode || "none",
    packageVersion: fields.packageVersion || HUMI_PACKAGE_VERSION,
    businessId: correlatedBusinessId(event),
  };
}

function flushTelemetryToServer() {
  if (flushPromise) return flushPromise;
  const { getSession } = require("./session");
  const { rawRequest, requestHumi } = require("./request");
  flushPromise = (async () => {
    let count = 0;
    while (pending.length && count < MAX_FLUSH_EVENTS) {
      const event = pending[0];
      const activeSession = getSession();
      const activeSessionOwner = safeBusinessId(activeSession?.user?.id);
      const authenticated = Boolean(
        activeSession?.accessToken
        && event.ownerId
        && event.ownerId === activeSessionOwner
      );
      const data = toWireEvent(event, { authenticated });
      try {
        await (authenticated ? requestHumi : rawRequest)({
          path: "/product-events",
          method: "POST",
          data,
          idempotencyKey: data.businessId,
          ...(authenticated ? { expectedUserId: activeSessionOwner } : {}),
        });
      } catch (error) {
        if (!isPermanentTelemetryError(error)) throw error;
        moveToDeadLetter(event, error);
      }
      pending.shift();
      persistPending();
      count += 1;
    }
    return { status: count ? "flushed" : "empty", count, remaining: pending.length };
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

function scheduleTelemetryFlush({ delayMs = 0 } = {}) {
  if (flushScheduled) return;
  flushScheduled = true;
  const run = () => Promise.resolve()
    .then(() => flushTelemetryToServer())
    .catch(() => {})
    .finally(() => {
      flushScheduled = false;
    });
  if (delayMs > 0 && typeof setTimeout === "function") setTimeout(run, delayMs);
  else run();
}

function startSpan(name, fields = {}) {
  const startedAt = Date.now();
  let ended = false;
  return {
    end(result = "completed", finishFields = {}) {
      if (ended) return null;
      ended = true;
      const outcome = result === "completed"
        ? { eventName: `${name}_completed`, stage: "completed", result: "completed", errorCode: "none" }
        : result === "offline"
          ? { eventName: `${name}_failed`, stage: "offline", result: "offline", errorCode: "network_error" }
          : { eventName: `${name}_failed`, stage: "failed", result: "failed", errorCode: "request_failed" };
      const { stage, result: ignoredResult, errorCode, durationMs, ...safeFinishFields } = finishFields;
      return trackEvent(outcome.eventName, {
        ...fields,
        ...safeFinishFields,
        stage: outcome.stage,
        result: outcome.result,
        durationMs: durationMs ?? Date.now() - startedAt,
        errorCode: ENUM_FIELDS.errorCode.has(errorCode) ? errorCode : outcome.errorCode
      });
    }
  };
}

function readStoredQueue() {
  try {
    const stored = typeof wx !== "undefined" ? wx.getStorageSync(TELEMETRY_QUEUE_KEY) : null;
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((event) => (
        EVENT_NAMES.has(event?.name)
        && safeBusinessId(event?.businessId)
        && Number.isFinite(event?.at)
        && event?.fields
        && typeof event.fields === "object"
        && JSON.stringify(sanitizeFields(event.fields)) === JSON.stringify(event.fields)
      ))
      .map((event) => ({
        name: event.name,
        fields: event.fields,
        at: event.at,
        businessId: safeBusinessId(event.businessId),
        anonymousSessionId: safeBusinessId(event.anonymousSessionId) || activeAnonymousSessionId,
        ownerId: safeBusinessId(event.ownerId),
      }))
      .slice(-MAX_PENDING_EVENTS);
  } catch (_) {
    return [];
  }
}

function persistPending() {
  try {
    if (typeof wx === "undefined") return;
    if (pending.length) wx.setStorageSync(TELEMETRY_QUEUE_KEY, pending);
    else wx.removeStorageSync(TELEMETRY_QUEUE_KEY);
  } catch (_) {}
}

function getAnonymousSessionId() {
  return activeAnonymousSessionId;
}

function setTelemetryOwner(ownerId, { rotate = true } = {}) {
  const nextOwnerId = safeBusinessId(ownerId);
  if (nextOwnerId === activeOwnerId) return activeAnonymousSessionId;
  activeOwnerId = nextOwnerId;
  if (rotate) activeAnonymousSessionId = createTelemetryId("anonymous");
  return activeAnonymousSessionId;
}

function readStoredDeadLetters() {
  try {
    const stored = typeof wx !== "undefined" ? wx.getStorageSync(TELEMETRY_DEAD_LETTER_KEY) : null;
    if (!Array.isArray(stored)) return [];
    return stored.filter((entry) => (
      EVENT_NAMES.has(entry?.name)
      && safeBusinessId(entry?.businessId)
      && safeBusinessId(entry?.errorCode)
      && Number.isFinite(entry?.droppedAt)
    )).slice(-MAX_DEAD_LETTERS);
  } catch (_) {
    return [];
  }
}

function moveToDeadLetter(event, error) {
  deadLetters.push({
    name: event.name,
    businessId: safeBusinessId(event.businessId) || "invalid-event",
    errorCode: permanentTelemetryErrorCode(error),
    droppedAt: Date.now(),
  });
  if (deadLetters.length > MAX_DEAD_LETTERS) {
    deadLetters.splice(0, deadLetters.length - MAX_DEAD_LETTERS);
  }
  try {
    if (typeof wx !== "undefined") wx.setStorageSync(TELEMETRY_DEAD_LETTER_KEY, deadLetters);
  } catch (_) {}
}

function isPermanentTelemetryError(error) {
  const status = Number(error?.status || 0);
  if (error?.retryable === false) return true;
  return status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status);
}

function permanentTelemetryErrorCode(error) {
  const status = Number(error?.status || 0);
  if (status === 400) return "invalid_event";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  return "non_retryable";
}

function createTelemetryId(prefix) {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 14);
  return `${prefix}-${time}-${random}`.slice(0, 100);
}

function safeBusinessId(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 100
    && /^[A-Za-z0-9:_-]+$/.test(value)
    ? value
    : "";
}

function correlatedBusinessId(event) {
  const uniqueId = safeBusinessId(event?.businessId) || createTelemetryId("event");
  const fields = event?.fields || {};
  const reference = [
    fields.businessId,
    fields.mealRunId,
    fields.recommendationId,
    fields.recipeId,
    fields.styleId,
    fields.stateVersion,
  ].map(safeBusinessId).find(Boolean);
  const dimensions = [
    ENUM_FIELDS.effortTier.has(fields.effortTier) ? `effort-${fields.effortTier}` : "",
    ENUM_FIELDS.shareSource.has(fields.shareSource) ? `share-${fields.shareSource}` : "",
  ].filter(Boolean);
  const reservedLength = uniqueId.length + dimensions.reduce((sum, value) => sum + value.length + 1, 0);
  const safeReference = reference
    ? reference.slice(0, Math.max(0, 100 - reservedLength - 1))
    : "";
  return [...dimensions, safeReference, uniqueId].filter(Boolean).join(":").slice(0, 100);
}

module.exports = {
  EVENT_NAMES,
  sanitizeFields,
  isSafeTelemetryEvent,
  trackEvent,
  readPendingTelemetry,
  flushTelemetry,
  toWireEvent,
  flushTelemetryToServer,
  scheduleTelemetryFlush,
  getAnonymousSessionId,
  setTelemetryOwner,
  startSpan,
};
