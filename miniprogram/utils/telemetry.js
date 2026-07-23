const EVENT_FIELDS = new Set(["sessionId", "householdId", "mealRunId", "recipeId", "page", "stage", "result", "errorCode", "stateVersion", "durationMs", "count", "styleId"]);
const EVENT_NAMES = new Set([
  "native_boot_started", "native_boot_completed", "native_boot_failed",
  "native_login_started", "native_login_completed", "native_login_failed",
  "bootstrap_completed", "bootstrap_failed",
  "share_snapshot_created", "native_share_page_visible", "native_share_cancelled", "native_share_failed",
  "poster_style_changed", "poster_saved", "poster_shared", "poster_failed"
]);
const ENUM_FIELDS = {
  page: new Set(["boot", "tonight", "discover", "plan", "grocery", "family", "cooking", "identity", "share", "poster", "reminder"]),
  stage: new Set(["started", "completed", "failed", "retry", "offline"]),
  result: new Set(["completed", "failed", "cancelled", "offline"])
};
const pending = [];

function sanitizeFields(fields = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!EVENT_FIELDS.has(key) || value === undefined || value === null) continue;
    if (ENUM_FIELDS[key]) {
      if (ENUM_FIELDS[key].has(value)) clean[key] = value;
      continue;
    }
    if ((key === "durationMs" || key === "count") && Number.isFinite(value)) clean[key] = Math.max(0, Number(value));
    else if (typeof value === "string" && value.length <= 128 && !/[?&](?:token|code|key)=/i.test(value)) clean[key] = value;
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
      const eventName = result === "failed" ? `${name}_failed` : `${name}_completed`;
      return trackEvent(eventName, { ...fields, ...finishFields, durationMs: finishFields.durationMs ?? Date.now() - startedAt });
    }
  };
}

module.exports = { EVENT_NAMES, sanitizeFields, isSafeTelemetryEvent, trackEvent, readPendingTelemetry, flushTelemetry, startSpan };
