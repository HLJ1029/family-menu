const { HumiRequestError } = require("./errors");
const { getSession } = require("./session");

const QUEUE_KEY_PREFIX = "humi:offline-queue:v1:";
const DEAD_LETTER_KEY_PREFIX = "humi:offline-dead-letter:v1:";
const MEAL_REPLAY_RESULT_KEY_PREFIX = "humi:offline-meal-results:v1:";
const MAX_ACTIONS = 100;
const MAX_MEAL_REPLAY_RESULTS = 20;
const MAX_QUEUE_BYTES = 256 * 1024;
const ALLOWED_ACTIONS = new Set(["meal_progress", "meal_complete", "meal_feedback", "meal_abandon", "grocery_item_check"]);
const COMMON_ACTION_FIELDS = ["id", "type", "householdId", "createdAt", "ownerUserId"];
const ACTION_FIELD_SCHEMAS = Object.freeze({
  meal_progress: new Set([...COMMON_ACTION_FIELDS, "mealRunId", "data", "idempotencyKey", "stateVersion"]),
  meal_complete: new Set([...COMMON_ACTION_FIELDS, "mealRunId", "data", "idempotencyKey", "stateVersion"]),
  meal_feedback: new Set([...COMMON_ACTION_FIELDS, "mealRunId", "data", "idempotencyKey", "stateVersion"]),
  meal_abandon: new Set([...COMMON_ACTION_FIELDS, "mealRunId", "data", "idempotencyKey", "stateVersion"]),
  grocery_item_check: new Set([...COMMON_ACTION_FIELDS, "data", "idempotencyKey", "stateVersion", "conflictRetryCount"])
});
const FEEDBACK_VALUES = new Set(["want_again", "change_it", "too_hard"]);
const ABANDON_REASONS = new Set(["too_much_effort", "missing_ingredients", "plans_changed", "cooking_failed"]);
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

function mealReplayResultKey(ownerUserId) {
  return `${MEAL_REPLAY_RESULT_KEY_PREFIX}${ownerUserId}`;
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
    mealMutationOrder(left.type) - mealMutationOrder(right.type) ||
    String(left.id || "").localeCompare(String(right.id || ""))
  ));
}

function mealMutationOrder(type) {
  return {
    meal_progress: 0,
    meal_complete: 1,
    meal_feedback: 2,
    meal_abandon: 3,
  }[type] ?? 4;
}

function validateAction(action) {
  if (!ALLOWED_ACTIONS.has(action?.type)) throw new HumiRequestError(0, "offline_action_not_allowed", { retryable: false });
  if (!action.id || !action.householdId || !Number.isFinite(Number(action.createdAt))) {
    throw new HumiRequestError(0, "offline_action_invalid", { retryable: false });
  }
  validateActionData(action);
}

function validateActionData(action) {
  if (action.type === "meal_complete") {
    assertExactData(action.data, new Set(["timelineVersion"]), ["timelineVersion"]);
    if (!Number.isInteger(action.data.timelineVersion) || action.data.timelineVersion <= 0) {
      throw invalidOfflineAction();
    }
    return;
  }
  if (action.type === "meal_progress") {
    assertExactData(action.data, new Set(["currentStepId", "timelineVersion", "timer", "timerEndsAt"]), ["currentStepId", "timelineVersion"]);
    if (!safeIdentifier(action.data.currentStepId, 160)) throw invalidOfflineAction();
    if (
      !Number.isInteger(action.data.timelineVersion)
      || action.data.timelineVersion <= 0
    ) {
      throw invalidOfflineAction();
    }
    if (action.data.timer !== undefined) {
      assertExactData(action.data.timer, new Set(["stepId", "startedAt", "endsAt"]), ["stepId", "startedAt", "endsAt"]);
      if (
        !safeIdentifier(action.data.timer.stepId, 160)
        || action.data.timer.stepId !== action.data.currentStepId
        || !validIsoDate(action.data.timer.startedAt)
        || !validIsoDate(action.data.timer.endsAt)
        || Date.parse(action.data.timer.endsAt) <= Date.parse(action.data.timer.startedAt)
      ) {
        throw invalidOfflineAction();
      }
    }
    if (action.data.timerEndsAt !== undefined && action.data.timerEndsAt !== "" && !validIsoDate(action.data.timerEndsAt)) {
      throw invalidOfflineAction();
    }
    return;
  }
  if (action.type === "meal_feedback") {
    assertExactData(action.data, new Set(["value"]), ["value"]);
    if (!FEEDBACK_VALUES.has(action.data.value)) throw invalidOfflineAction();
    return;
  }
  if (action.type === "meal_abandon") {
    assertExactData(action.data, new Set(["reason"]), ["reason"]);
    if (!ABANDON_REASONS.has(action.data.reason)) throw invalidOfflineAction();
    return;
  }
  if (action.type === "grocery_item_check") {
    assertExactData(action.data, new Set(["itemId", "checked"]), ["itemId", "checked"]);
    if (
      !safeIdentifier(action.data.itemId, 100)
      || typeof action.data.checked !== "boolean"
      || !safeStateVersion(action.stateVersion)
      || (action.conflictRetryCount !== undefined && ![0, 1].includes(action.conflictRetryCount))
    ) {
      throw invalidOfflineAction();
    }
  }
}

function assertExactData(data, allowedFields, requiredFields) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw invalidOfflineAction();
  if (Object.keys(data).some((key) => !allowedFields.has(key))) throw invalidOfflineAction();
  if (requiredFields.some((key) => !Object.prototype.hasOwnProperty.call(data, key))) throw invalidOfflineAction();
}

function safeIdentifier(value, maxLength) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && /^[A-Za-z0-9:_-]+$/.test(value);
}

function safeStateVersion(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 180 && /^[A-Za-z0-9_-]+$/.test(value);
}

function validIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function invalidOfflineAction() {
  return new HumiRequestError(0, "offline_action_invalid", { retryable: false });
}

function projectAction(action, ownerUserId) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new HumiRequestError(0, "offline_action_invalid", { retryable: false });
  }
  const schema = ACTION_FIELD_SCHEMAS[action.type];
  if (!schema) throw new HumiRequestError(0, "offline_action_not_allowed", { retryable: false });
  for (const key of Object.keys(action)) {
    if (!schema.has(key)) {
      throw new HumiRequestError(0, "offline_action_invalid", { retryable: false });
    }
  }
  const projected = {};
  for (const key of schema) {
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

function replaceAction(nextAction, ownerUserId) {
  writeQueue(readQueueForOwner(ownerUserId).map((action) => action.id === nextAction.id ? nextAction : action), ownerUserId);
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

function persistMealMutationResult(action, response, ownerUserId) {
  const mealRun = response?.mealRun;
  if (
    !String(action?.type || "").startsWith("meal_")
    || !action?.mealRunId
    || !mealRun
    || mealRun.id !== action.mealRunId
  ) return true;
  try {
    const stored = wx.getStorageSync(mealReplayResultKey(ownerUserId));
    const entries = Array.isArray(stored) ? stored : [];
    const next = [
      ...entries.filter((entry) => entry?.mealRunId !== mealRun.id),
      {
        mealRunId: mealRun.id,
        mealRun: JSON.parse(JSON.stringify(mealRun)),
        replayedAt: Date.now(),
      },
    ].slice(-MAX_MEAL_REPLAY_RESULTS);
    wx.setStorageSync(mealReplayResultKey(ownerUserId), next);
    return true;
  } catch (_) {
    return false;
  }
}

function readMealMutationResult(mealRunId) {
  const ownerUserId = getOwnerUserId();
  if (!ownerUserId || !mealRunId) return null;
  const stored = wx.getStorageSync(mealReplayResultKey(ownerUserId));
  if (!Array.isArray(stored)) return null;
  const result = [...stored].reverse().find((entry) => entry?.mealRunId === mealRunId);
  return result?.mealRun ? JSON.parse(JSON.stringify(result.mealRun)) : null;
}

function clearMealMutationResult(mealRunId) {
  const ownerUserId = getOwnerUserId();
  if (!ownerUserId || !mealRunId) return;
  const key = mealReplayResultKey(ownerUserId);
  const stored = wx.getStorageSync(key);
  if (!Array.isArray(stored)) return;
  const next = stored.filter((entry) => entry?.mealRunId !== mealRunId);
  if (next.length) wx.setStorageSync(key, next);
  else wx.removeStorageSync(key);
}

function setMutationReplayer(replayer) {
  customReplayer = replayer;
}

async function replayAction(action) {
  if (customReplayer) return customReplayer(action);
  const { requestHumi } = require("./request");
  const request = buildMutationRequest(action);
  return requestHumi({
    ...request,
    idempotencyKey: action.idempotencyKey || action.id,
    stateVersion: action.stateVersion,
    expectedUserId: action.ownerUserId
  });
}

function buildMutationRequest(action) {
  const mealRunId = encodeURIComponent(String(action.mealRunId || ""));
  if (action.type === "meal_progress" && mealRunId) return { path: `/meal-runs/${mealRunId}/progress`, method: "PUT", data: action.data };
  if (action.type === "meal_complete" && mealRunId) return { path: `/meal-runs/${mealRunId}/complete`, method: "POST", data: action.data };
  if (action.type === "meal_feedback" && mealRunId) return { path: `/meal-runs/${mealRunId}/feedback`, method: "PUT", data: action.data };
  if (action.type === "meal_abandon" && mealRunId) return { path: `/meal-runs/${mealRunId}/abandon`, method: "POST", data: action.data };
  if (action.type === "grocery_item_check") {
    const itemId = String(action.data?.itemId || "");
    if (itemId && action.householdId) {
      return {
        path: "/state",
        method: "PUT",
        data: {
          householdId: action.householdId,
          patch: { checkedItems: { [itemId]: Boolean(action.data?.checked) } },
        },
      };
    }
  }
  throw new HumiRequestError(0, "offline_action_unconfigured", { retryable: false });
}

async function flushMutationQueue(options = {}) {
  const ownerUserId = getOwnerUserId();
  if (!ownerUserId) return { status: "skipped", reason: "no_session" };
  for (const action of sortQueue(readQueueForOwner(ownerUserId))) {
    if (getOwnerUserId() !== ownerUserId) return { status: "skipped", reason: "ownership_changed" };
    if (action.ownerUserId !== ownerUserId) return { status: "skipped", reason: "ownership_mismatch" };
    try {
      const response = await replayAction(action);
      if (getOwnerUserId() !== ownerUserId) return { status: "skipped", reason: "ownership_changed" };
      if (!persistMealMutationResult(action, response, ownerUserId)) {
        return { status: "retry", action };
      }
      removeAction(action.id, ownerUserId);
      if (typeof options.onReplayed === "function") {
        try {
          options.onReplayed(action, response);
        } catch (_) {
          // A local observer cannot turn an already-accepted idempotent server mutation into a replay failure.
        }
      }
    } catch (error) {
      if (getOwnerUserId() !== ownerUserId) return { status: "skipped", reason: "ownership_changed" };
      if (
        error.status === 409
        && error.code === "meal_timeline_version_conflict"
        && ["meal_progress", "meal_complete"].includes(action.type)
      ) {
        const discardedActionIds = discardObsoleteMealEpoch(action, ownerUserId);
        return {
          status: "timeline_conflict",
          action,
          discardedActionIds,
          envelope: error.latestEnvelope,
        };
      }
      if (
        action.type === "grocery_item_check"
        && error.status === 409
        && error.code === "state_version_conflict"
        && error.latestEnvelope
      ) {
        notifyEnvelope(options, error.latestEnvelope);
        if (groceryIntentSatisfied(action, error.latestEnvelope)) {
          removeAction(action.id, ownerUserId);
          continue;
        }
        if (action.conflictRetryCount === 1) {
          moveToDeadLetter(action, "state_version_conflict", ownerUserId);
          return { status: "conflict", action, envelope: error.latestEnvelope, retryExhausted: true };
        }
        const retryAction = {
          ...action,
          stateVersion: error.latestEnvelope.stateVersion,
          conflictRetryCount: 1,
        };
        replaceAction(retryAction, ownerUserId);
        try {
          const response = await replayAction(retryAction);
          if (getOwnerUserId() !== ownerUserId) return { status: "skipped", reason: "ownership_changed" };
          removeAction(retryAction.id, ownerUserId);
          notifyReplayed(options, retryAction, response);
          notifyEnvelope(options, response);
          continue;
        } catch (retryError) {
          if (getOwnerUserId() !== ownerUserId) return { status: "skipped", reason: "ownership_changed" };
          if (
            retryError.status === 409
            && retryError.code === "state_version_conflict"
          ) {
            notifyEnvelope(options, retryError.latestEnvelope);
            moveToDeadLetter(retryAction, "state_version_conflict", ownerUserId);
            return {
              status: "conflict",
              action: retryAction,
              envelope: retryError.latestEnvelope,
              retryExhausted: true,
            };
          }
          if (!retryError.retryable) {
            moveToDeadLetter(retryAction, retryError.code, ownerUserId);
            continue;
          }
          return { status: "retry", action: retryAction, envelope: error.latestEnvelope };
        }
      }
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

function groceryIntentSatisfied(action, envelope) {
  const checkedItems = envelope?.householdState?.checkedItems || envelope?.state?.checkedItems || {};
  return Boolean(checkedItems[action.data?.itemId]) === Boolean(action.data?.checked);
}

function notifyEnvelope(options, envelope) {
  if (!envelope || typeof options.onEnvelope !== "function") return;
  try { options.onEnvelope(envelope); } catch (_) {}
}

function notifyReplayed(options, action, response) {
  if (typeof options.onReplayed !== "function") return;
  try { options.onReplayed(action, response); } catch (_) {}
}

function discardObsoleteMealEpoch(action, ownerUserId) {
  const obsoleteVersion = Number(action.data?.timelineVersion);
  const hasObsoleteVersion = Number.isInteger(obsoleteVersion) && obsoleteVersion > 0;
  const discardedActionIds = [];
  const retained = readQueueForOwner(ownerUserId).filter((candidate) => {
    if (candidate.mealRunId !== action.mealRunId) return true;
    const candidateVersion = Number(candidate.data?.timelineVersion);
    const hasCandidateVersion = Number.isInteger(candidateVersion) && candidateVersion > 0;
    const sameEpochMutation = (
      ["meal_progress", "meal_complete"].includes(candidate.type)
      && (
        candidate.id === action.id
        || (hasObsoleteVersion && hasCandidateVersion && candidateVersion === obsoleteVersion)
        || (!hasObsoleteVersion && !hasCandidateVersion)
      )
    );
    const dependentFeedback = candidate.type === "meal_feedback";
    if (!sameEpochMutation && !dependentFeedback) return true;
    discardedActionIds.push(candidate.id);
    return false;
  });
  writeQueue(retained, ownerUserId);
  return discardedActionIds;
}

module.exports = {
  ALLOWED_ACTIONS,
  ACTION_FIELD_SCHEMAS,
  MAX_ACTIONS,
  MAX_QUEUE_BYTES,
  enqueueMutation,
  clearMealMutationResult,
  readQueue,
  readDeadLetters,
  readMealMutationResult,
  flushMutationQueue,
  setMutationReplayer,
  sortQueue,
  utf8ByteLength
};
