const EVENT_FIELDS = new Set(["sessionId", "householdId", "mealRunId", "recipeId", "recommendationId", "effortTier", "page", "stage", "result", "errorCode", "stateVersion", "durationMs", "count", "styleId"]);
const EVENT_NAMES = new Set([
  "native_boot_started", "native_boot_completed", "native_boot_failed",
  "native_login_started", "native_login_completed", "native_login_failed",
  "bootstrap_completed", "bootstrap_failed",
  "share_snapshot_created", "native_share_page_visible", "native_share_cancelled", "native_share_failed",
  "poster_style_changed", "poster_saved", "poster_shared", "poster_failed",
  "effort_tier_viewed", "effort_tier_selected", "plan_presented", "plan_accepted", "reminder_opened",
  "cooking_mutation_started", "cooking_mutation_completed", "cooking_mutation_failed"
]);
const ENUM_FIELDS = {
  page: new Set(["boot", "tonight", "discover", "plan", "grocery", "family", "cooking", "identity", "share", "poster", "reminder"]),
  stage: new Set(["started", "completed", "failed", "retry", "offline", "queue_flush"]),
  result: new Set(["completed", "failed", "cancelled", "offline", "conflict", "retry"]),
  effortTier: new Set(["quick_15", "easy_30", "normal"]),
  errorCode: new Set([
    "none", "network_error", "invalid_session", "request_failed", "wechat_login_failed", "unauthorized",
    "conflict", "retry", "forbidden", "offline_action_not_allowed", "offline_action_invalid",
    "offline_action_unconfigured", "offline_queue_full", "offline_queue_too_large", "offline_product_event_unsafe",
    "queue_conflict", "queue_retry", "queue_flush_failed"
  ])
};
const pending = [];
const ID_FIELDS = new Set(["sessionId", "householdId", "mealRunId", "recipeId", "recommendationId", "stateVersion", "styleId"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function sanitizeFields(fields = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!EVENT_FIELDS.has(key) || value === undefined || value === null) continue;
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
  const event = { name, fields: sanitizeFields(fields), at: Date.now() };
  pending.push(event);
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
    count += batch.length;
  }
  return { status: "flushed", count };
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

module.exports = { EVENT_NAMES, sanitizeFields, isSafeTelemetryEvent, trackEvent, readPendingTelemetry, flushTelemetry, startSpan };
