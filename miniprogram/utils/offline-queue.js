const { HumiRequestError } = require("./errors");

const QUEUE_KEY = "humi:offline-queue:v1";
const DEAD_LETTER_KEY = "humi:offline-dead-letter:v1";
const MAX_ACTIONS = 100;
const MAX_QUEUE_BYTES = 256 * 1024;
const ALLOWED_ACTIONS = new Set(["meal_progress", "meal_complete", "meal_feedback", "meal_abandon", "grocery_item_check", "product_event"]);
let customReplayer = null;

function readQueue() {
  const queue = wx.getStorageSync(QUEUE_KEY);
  return Array.isArray(queue) ? sortQueue(queue) : [];
}

function writeQueue(queue) {
  wx.setStorageSync(QUEUE_KEY, sortQueue(queue));
}

function sortQueue(queue) {
  return [...queue].sort((left, right) => (
    String(left.householdId || "").localeCompare(String(right.householdId || "")) ||
    String(left.mealRunId || "").localeCompare(String(right.mealRunId || "")) ||
    Number(left.createdAt || 0) - Number(right.createdAt || 0) ||
    String(left.id || "").localeCompare(String(right.id || ""))
  ));
}

function validateAction(action) {
  if (!ALLOWED_ACTIONS.has(action?.type)) throw new HumiRequestError(0, "offline_action_not_allowed", { retryable: false });
  if (!action.id || !action.householdId || !Number.isFinite(Number(action.createdAt))) {
    throw new HumiRequestError(0, "offline_action_invalid", { retryable: false });
  }
  if (action.type === "product_event") {
    const { isSafeTelemetryEvent } = require("./telemetry");
    if (!isSafeTelemetryEvent(action.event, action.fields || {})) {
      throw new HumiRequestError(0, "offline_product_event_unsafe", { retryable: false });
    }
  }
}

function utf8ByteLength(value) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

function enqueueMutation(action) {
  validateAction(action);
  const queue = readQueue().filter((item) => item.id !== action.id);
  const next = [...queue, action];
  if (utf8ByteLength(JSON.stringify(next)) > MAX_QUEUE_BYTES) throw new HumiRequestError(0, "offline_queue_too_large", { retryable: false });
  if (next.length > MAX_ACTIONS) throw new HumiRequestError(0, "offline_queue_full", { retryable: false });
  writeQueue(next);
  return action;
}

function removeAction(actionId) {
  writeQueue(readQueue().filter((action) => action.id !== actionId));
}

function readDeadLetters() {
  const items = wx.getStorageSync(DEAD_LETTER_KEY);
  return Array.isArray(items) ? items : [];
}

function moveToDeadLetter(action, code) {
  const next = [...readDeadLetters(), { id: action.id, code: code || "request_failed" }];
  wx.setStorageSync(DEAD_LETTER_KEY, next.slice(-MAX_ACTIONS));
  removeAction(action.id);
}

function setMutationReplayer(replayer) {
  customReplayer = replayer;
}

async function replayAction(action) {
  if (customReplayer) return customReplayer(action);
  const { requestHumi } = require("./request");
  if (!action.path) throw new HumiRequestError(0, "offline_action_unconfigured", { retryable: false });
  return requestHumi({
    path: action.path,
    method: action.method || "POST",
    data: action.data,
    idempotencyKey: action.idempotencyKey || action.id,
    stateVersion: action.stateVersion
  });
}

async function flushMutationQueue() {
  for (const action of sortQueue(readQueue())) {
    try {
      await replayAction(action);
      removeAction(action.id);
    } catch (error) {
      if (error.status === 409) return { status: "conflict", action, envelope: error.latestEnvelope };
      if (!error.retryable) {
        moveToDeadLetter(action, error.code);
        continue;
      }
      return { status: "retry", action };
    }
  }
  return { status: "flushed" };
}

module.exports = {
  ALLOWED_ACTIONS,
  MAX_ACTIONS,
  MAX_QUEUE_BYTES,
  enqueueMutation,
  readQueue,
  readDeadLetters,
  flushMutationQueue,
  setMutationReplayer,
  sortQueue,
  utf8ByteLength
};
