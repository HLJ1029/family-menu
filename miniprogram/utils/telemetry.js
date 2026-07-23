const { HUMI_PACKAGE_VERSION } = require("./config");

const TELEMETRY_QUEUE_KEY = "humi:telemetry-queue:v1";
const ANONYMOUS_SESSION_KEY = "humi:telemetry-anonymous-session:v1";
const MAX_PENDING_EVENTS = 200;
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
const pending = readStoredQueue();
let flushPromise = null;
let flushScheduled = false;
const ID_FIELDS = new Set(["sessionId", "householdId", "mealRunId", "recipeId", "recommendationId", "businessId", "stateVersion", "styleId"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+$/;

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
  let count = 0;
  while (pending.length) {
    const batch = pending.slice(0, 20);
    await send(batch);
    pending.splice(0, batch.length);
    persistPending();
    count += batch.length;
  }
  return { status: "flushed", count };
}

function toWireEvent(event, { anonymousSessionId = getAnonymousSessionId(), authenticated = false } = {}) {
  const fields = event?.fields || {};
  return {
    eventType: EVENT_NAMES.has(event?.name) ? event.name : "",
    anonymousSessionId,
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
  const activeSession = getSession();
  const authenticated = Boolean(activeSession?.accessToken);
  const sendRequest = authenticated ? requestHumi : rawRequest;
  const anonymousSessionId = getAnonymousSessionId();
  flushPromise = flushTelemetry(async (batch) => {
    for (const event of batch) {
      const data = toWireEvent(event, { anonymousSessionId, authenticated });
      await sendRequest({
        path: "/product-events",
        method: "POST",
        data,
        idempotencyKey: data.businessId,
        ...(authenticated ? { expectedUserId: activeSession?.user?.id || "" } : {}),
      });
    }
  }).finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

function scheduleTelemetryFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  Promise.resolve()
    .then(() => flushTelemetryToServer())
    .catch(() => {})
    .finally(() => {
      flushScheduled = false;
    });
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
  try {
    const stored = typeof wx !== "undefined" ? wx.getStorageSync(ANONYMOUS_SESSION_KEY) : "";
    if (safeBusinessId(stored)) return stored;
    const created = createTelemetryId("anonymous");
    if (typeof wx !== "undefined") wx.setStorageSync(ANONYMOUS_SESSION_KEY, created);
    return created;
  } catch (_) {
    return createTelemetryId("anonymous");
  }
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
  if (!reference) return uniqueId;
  const maxReferenceLength = Math.max(1, 100 - uniqueId.length - 1);
  return `${reference.slice(0, maxReferenceLength)}:${uniqueId}`;
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
  startSpan,
};
