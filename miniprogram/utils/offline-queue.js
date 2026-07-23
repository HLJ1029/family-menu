const { HumiRequestError } = require("./errors");
const { getSession } = require("./session");

const QUEUE_KEY_PREFIX = "humi:offline-queue:v1:";
const DEAD_LETTER_KEY_PREFIX = "humi:offline-dead-letter:v1:";
const MAX_ACTIONS = 100;
const MAX_QUEUE_BYTES = 256 * 1024;
const ALLOWED_ACTIONS = new Set(["meal_progress", "meal_complete", "meal_feedback", "meal_abandon", "grocery_item_check", "product_event"]);
const ALLOWED_ACTION_FIELDS = new Set([
  "id",
  "type",
  "householdId",
  "mealRunId",
  "createdAt",
  "path",
  "method",
  "data",
  "idempotencyKey",
  "stateVersion",
  "event",
  "fields",
  "ownerUserId"
]);
let customReplayer = null;

function getOwnerUserId() {
  const userId = getSession()?.user?.id;
  return typeof userId === "string" ? userId : "";
}

function queueKey(ownerUserId) {
  return `${QUEUE_KEY_PREFIX}${ownerUserId}`;
}

function deadLetterKey(ownerUserId) {
  return `${DEAD_LETTER_KEY_PREFIX}${ownerUserId}`;
}

function readQueueForOwner(ownerUserId) {
  if (!ownerUserId) return [];
  const queue = wx.getStorageSync(queueKey(ownerUserId));
  return Array.isArray(queue) ? sortQueue(queue) : [];
}

function readQueue() {
  return readQueueForOwner(getOwnerUserId());
}

function writeQueue(queue, ownerUserId) {
  wx.setStorageSync(queueKey(ownerUserId), sortQueue(queue));
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

function projectAction(action, ownerUserId) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new HumiRequestError(0, "offline_action_invalid", { retryable: false });
  }
  for (const key of Object.keys(action)) {
    if (!ALLOWED_ACTION_FIELDS.has(key)) {
      throw new HumiRequestError(0, "offline_action_invalid", { retryable: false });
    }
  }
  const projected = {};
  for (const key of ALLOWED_ACTION_FIELDS) {
    if (key !== "ownerUserId" && Object.prototype.hasOwnProperty.call(action, key) && action[key] !== undefined) {
      projected[key] = action[key];
    }
  }
  projected.ownerUserId = ownerUserId;
  return projected;
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
  const ownerUserId = getOwnerUserId();
  if (!ownerUserId) throw new HumiRequestError(0, "offline_session_required", { retryable: false });
  const ownedAction = projectAction(action, ownerUserId);
  validateAction(ownedAction);
  const queue = readQueueForOwner(ownerUserId).filter((item) => item.id !== ownedAction.id);
  const next = [...queue, ownedAction];
  if (utf8ByteLength(JSON.stringify(next)) > MAX_QUEUE_BYTES) throw new HumiRequestError(0, "offline_queue_too_large", { retryable: false });
  if (next.length > MAX_ACTIONS) throw new HumiRequestError(0, "offline_queue_full", { retryable: false });
  writeQueue(next, ownerUserId);
  return ownedAction;
}

function removeAction(actionId, ownerUserId) {
  writeQueue(readQueueForOwner(ownerUserId).filter((action) => action.id !== actionId), ownerUserId);
}

function readDeadLettersForOwner(ownerUserId) {
  if (!ownerUserId) return [];
  const items = wx.getStorageSync(deadLetterKey(ownerUserId));
  return Array.isArray(items) ? items : [];
}

function readDeadLetters() {
  return readDeadLettersForOwner(getOwnerUserId());
}

function moveToDeadLetter(action, code, ownerUserId) {
  const next = [...readDeadLettersForOwner(ownerUserId), { id: action.id, code: code || "request_failed" }];
  wx.setStorageSync(deadLetterKey(ownerUserId), next.slice(-MAX_ACTIONS));
  removeAction(action.id, ownerUserId);
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
    stateVersion: action.stateVersion,
    expectedUserId: action.ownerUserId
  });
}

async function flushMutationQueue() {
  const ownerUserId = getOwnerUserId();
  if (!ownerUserId) return { status: "skipped", reason: "no_session" };
  for (const action of sortQueue(readQueueForOwner(ownerUserId))) {
    if (getOwnerUserId() !== ownerUserId) return { status: "skipped", reason: "ownership_changed" };
    if (action.ownerUserId !== ownerUserId) return { status: "skipped", reason: "ownership_mismatch" };
    try {
      await replayAction(action);
      if (getOwnerUserId() !== ownerUserId) return { status: "skipped", reason: "ownership_changed" };
      removeAction(action.id, ownerUserId);
    } catch (error) {
      if (getOwnerUserId() !== ownerUserId) return { status: "skipped", reason: "ownership_changed" };
      if (error.status === 409) return { status: "conflict", action, envelope: error.latestEnvelope };
      if (!error.retryable) {
        moveToDeadLetter(action, error.code, ownerUserId);
        continue;
      }
      return { status: "retry", action };
    }
  }
  return { status: "flushed" };
}

module.exports = {
  ALLOWED_ACTIONS,
  ALLOWED_ACTION_FIELDS,
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
